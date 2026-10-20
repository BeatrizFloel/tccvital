#include <Wire.h>
#include <DHT.h>
#include <MAX30105.h>
#include <MQUnifiedsensor.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WebSocketsClient.h>   // biblioteca "WebSockets" (Markus Sattler)
#include <ArduinoJson.h>        // biblioteca "ArduinoJson" (Benoit Blanchon)
#include "spo2_algorithm.h"     // vem junto com a biblioteca do MAX30105 (SparkFun)

// ==========================================================
//  CONFIGURACAO - troque so o que esta entre aspas
// ==========================================================
const char* WIFI_SSID     = "NOME_DA_REDE";           // qualquer Wi-Fi 2.4 GHz com internet
const char* WIFI_PASSWORD = "SENHA_DA_REDE";
const char* ACCOUNT_EMAIL = "byacururu@gmail.com";    // e-mail da conta usada para entrar no app
const char* SENSOR_KEY    = "";                       // deixe vazio (so use se colocar SENSOR_KEY no .env)

// Para onde vao as leituras:
//   1 = site na Vercel (https://tccvital.vercel.app) pela internet. Nao precisa do computador ligado.
//   0 = backend no computador (npm run dev), em tempo real. Computador, celular e ESP no mesmo Wi-Fi.
#define ENVIAR_PARA_VERCEL 1
const char* VERCEL_URL    = "https://tccvital.vercel.app/api/sensores";
const char* SERVER_HOST   = "192.168.42.115";         // so no modo 0: IP que aparece no terminal do npm run dev
const uint16_t SERVER_PORT = 3000;

// ==========================================================
//  LIGACOES (ESP32 DevKit 30 pinos)
//
//  MAX30102:  VIN -> 3V3   GND -> GND   SDA -> D21   SCL -> D22
//  DHT11 #1:  VCC -> 3V3   DATA -> D4    GND -> GND
//  DHT11 #2:  VCC -> 3V3   DATA -> D27   GND -> GND
//             (resistor de 10k entre DATA e 3V3 em cada DHT11)
//  MQ:        VCC -> VIN (5V)   GND -> GND   DO -> nada
//             AO -> 10k -> D34 -> 20k (2x 10k) -> GND
// ==========================================================

// ------------------ DHT11 ------------------
#define DHT1_PIN 4       // D4
#define DHT2_PIN 27      // D27
#define DHTTYPE DHT11
DHT dht1(DHT1_PIN, DHTTYPE);
DHT dht2(DHT2_PIN, DHTTYPE);

// ------------------ MAX30102 (I2C) ------------------
#define SDA_PIN 21       // D21
#define SCL_PIN 22       // D22
MAX30105 particleSensor;
bool maxOk = false;

// Batimentos e oxigenacao: 100 amostras (4 s a 25 por segundo), recalcula a cada 25 novas
const int32_t TAMANHO_BUFFER = 100;
uint32_t irBuffer[TAMANHO_BUFFER];
uint32_t redBuffer[TAMANHO_BUFFER];
int32_t amostras = 0;
int32_t bpm = 0, spo2 = 0;
int8_t bpmValido = 0, spo2Valido = 0;
long irValue = 0;

// ------------------ MQ (ex.: MQ-2) ------------------
#define Board ("ESP-32")
#define Pin (34)                 // D34
#define Type ("MQ-2")            // Mude para o seu modelo (ex.: "MQ-135")
#define Voltage_Resolution (3.3)
#define ADC_Bit_Resolution (12)
#define RatioMQ2CleanAir (9.83)  // MQ-2 = 9.83 | MQ-135 = 3.6

MQUnifiedsensor MQ(Board, Voltage_Resolution, ADC_Bit_Resolution, Pin, Type);
bool mqOk = false;

// ------------------ Conexao com o backend ------------------
WebSocketsClient webSocket;
bool conectado = false;
WiFiClientSecure clienteHttps;
HTTPClient http;

// ------------------ Tempo ------------------
unsigned long tempoAnteriorSensores = 0;
const long intervaloSensores = 3000;

// Le um DHT11, mostra no Monitor Serial e devolve se deu certo
bool leDHT(const char* nome, DHT& sensor, float& temperatura, float& umidade) {
  umidade = sensor.readHumidity();
  temperatura = sensor.readTemperature();
  Serial.print(nome);
  if (isnan(umidade) || isnan(temperatura)) {
    Serial.println(": falha na leitura (confira DATA, VCC, GND e o resistor de 10k)");
    return false;
  }
  Serial.print(": ");
  Serial.print(temperatura, 1); Serial.print(" °C | ");
  Serial.print(umidade, 0);     Serial.println(" %");
  return true;
}

// Chamado o tempo todo no loop: junta as amostras do MAX30102 sem travar o Wi-Fi
void leOximetro() {
  if (!maxOk) return;
  particleSensor.check();
  while (particleSensor.available()) {
    redBuffer[amostras] = particleSensor.getFIFORed();
    irBuffer[amostras] = particleSensor.getFIFOIR();
    irValue = irBuffer[amostras];
    particleSensor.nextSample();
    amostras++;

    if (amostras == TAMANHO_BUFFER) {
      maxim_heart_rate_and_oxygen_saturation(irBuffer, TAMANHO_BUFFER, redBuffer, &spo2, &spo2Valido, &bpm, &bpmValido);
      // descarta as 25 amostras mais antigas e continua enchendo
      memmove(irBuffer, irBuffer + 25, (TAMANHO_BUFFER - 25) * sizeof(uint32_t));
      memmove(redBuffer, redBuffer + 25, (TAMANHO_BUFFER - 25) * sizeof(uint32_t));
      amostras = TAMANHO_BUFFER - 25;
    }
  }
}

// O e-mail vai no endereco, entao caracteres como + viram %2B
String codificaUrl(const char* texto) {
  String saida;
  for (const char* c = texto; *c; c++) {
    if (isalnum(*c) || *c == '-' || *c == '_' || *c == '.' || *c == '@') saida += *c;
    else { char hex[4]; snprintf(hex, sizeof(hex), "%%%02X", (unsigned char)*c); saida += hex; }
  }
  return saida;
}

void eventoWebSocket(WStype_t tipo, uint8_t* dados, size_t tamanho) {
  if (tipo == WStype_CONNECTED) {
    conectado = true;
    Serial.println(">> Conectado ao backend VitalCare");
  } else if (tipo == WStype_DISCONNECTED) {
    if (conectado) Serial.println(">> Desconectado do backend, tentando de novo...");
    conectado = false;
  } else if (tipo == WStype_TEXT) {
    // resposta do backend: {"type":"ok",...} ou {"type":"erro","message":"..."}
    Serial.print(">> Backend: ");
    Serial.write(dados, tamanho);
    Serial.println();
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("--- Inicializando Sistema Multisensores ---");

  // 1. DHT11
  dht1.begin();
  dht2.begin();
  Serial.println("DHT11 (D4 e D27) inicializados.");

  // 2. MAX30102 no I2C (D21 / D22)
  Wire.begin(SDA_PIN, SCL_PIN);
  maxOk = particleSensor.begin(Wire, I2C_SPEED_STANDARD);
  if (!maxOk) {
    Serial.println("ATENCAO: MAX30102 nao encontrado. Confira SDA=D21, SCL=D22, VIN=3V3, GND.");
  } else {
    // brilho 60, media 4, vermelho + IR, 100 Hz -> 25 amostras/s (o calculo de batimentos precisa disso)
    particleSensor.setup(60, 4, 2, 100, 411, 4096);
    Serial.println("MAX30102 inicializado com sucesso.");
  }

  // 3. MQ: calibracao em ar limpo
  MQ.setRegressionMethod(1);
  MQ.setA(574.25); MQ.setB(-2.222);
  MQ.init();

  Serial.print("Calibrando o MQ em ar limpo...");
  float calcR0 = 0;
  for (int i = 1; i <= 10; i++) {
    MQ.update();
    calcR0 += MQ.calibrate(RatioMQ2CleanAir);
    delay(200);
  }
  Serial.println(" concluido!");

  if (isinf(calcR0) || calcR0 <= 0) {
    Serial.println("ERRO no MQ: confira AO -> divisor -> D34, VCC -> VIN e GND.");
  } else {
    MQ.setR0(calcR0 / 10);
    mqOk = true;
    Serial.print("R0 = "); Serial.println(calcR0 / 10);
  }

  // 4. Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando no Wi-Fi ");
  Serial.print(WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\nWi-Fi conectado. IP do ESP: ");
  Serial.println(WiFi.localIP());

#if ENVIAR_PARA_VERCEL
  // 5. Site na Vercel (HTTPS)
  clienteHttps.setInsecure();   // nao confere o certificado (suficiente para o prototipo)
  http.setReuse(true);          // mantem a conexao aberta entre um envio e outro (mais rapido)
  Serial.print("Enviando as leituras para "); Serial.println(VERCEL_URL);
#else
  // 5. Backend no computador (WebSocket)
  String caminho = String("/ws?email=") + codificaUrl(ACCOUNT_EMAIL);
  if (strlen(SENSOR_KEY)) caminho += String("&key=") + codificaUrl(SENSOR_KEY);
  webSocket.begin(SERVER_HOST, SERVER_PORT, caminho);
  webSocket.onEvent(eventoWebSocket);
  webSocket.setReconnectInterval(3000);       // backend reiniciou? tenta de novo a cada 3 s
  webSocket.enableHeartbeat(15000, 3000, 2);  // percebe quando a conexao caiu
  Serial.print("Conectando no backend ws://");
  Serial.print(SERVER_HOST); Serial.print(":"); Serial.print(SERVER_PORT); Serial.println("/ws ...");
#endif
}

#if ENVIAR_PARA_VERCEL
// Manda as leituras para a Vercel, que salva no banco; o app mostra em ate 5 segundos
void enviaVercel(JsonDocument& leitura) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Vercel: sem Wi-Fi, tentando reconectar...");
    WiFi.reconnect();
    return;
  }
  leitura["email"] = ACCOUNT_EMAIL;
  String json;
  serializeJson(leitura, json);

  http.begin(clienteHttps, VERCEL_URL);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(SENSOR_KEY)) http.addHeader("x-sensor-key", SENSOR_KEY);
  int status = http.POST(json);
  Serial.print("Enviado: "); Serial.println(json);
  Serial.print(">> Vercel respondeu "); Serial.print(status); Serial.print(": ");
  Serial.println(status > 0 ? http.getString() : http.errorToString(status));
  http.end();
}
#endif

void loop() {
#if !ENVIAR_PARA_VERCEL
  webSocket.loop();   // precisa rodar o tempo todo
#endif
  leOximetro();       // precisa rodar o tempo todo

  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnteriorSensores >= intervaloSensores) {
    tempoAnteriorSensores = tempoAtual;
    JsonDocument leitura;   // o que vai para o app

    Serial.println("\n===========================================");

    if (!maxOk) {
      Serial.println("MAX30102: nao conectado");
    } else if (irValue > 50000) {
      Serial.print("MAX30102: ");
      if (bpmValido)  { Serial.print(bpm);  Serial.print(" bpm  "); leitura["bpm"] = bpm; }
      if (spo2Valido) { Serial.print(spo2); Serial.print(" % SpO2"); leitura["spo2"] = spo2; }
      if (!bpmValido && !spo2Valido) Serial.print("calculando... (mantenha o dedo parado)");
      Serial.println();
    } else {
      Serial.println("MAX30102: sem dedo no sensor");
    }

    // Os dois DHT11: manda a media dos que leram certo
    float t1, u1, t2, u2;
    bool ok1 = leDHT("DHT11 #1 (D4) ", dht1, t1, u1);
    bool ok2 = leDHT("DHT11 #2 (D27)", dht2, t2, u2);
    if (ok1 || ok2) {
      leitura["celsius"]  = ok1 && ok2 ? (t1 + t2) / 2 : (ok1 ? t1 : t2);
      leitura["humidity"] = ok1 && ok2 ? (u1 + u2) / 2 : (ok1 ? u1 : u2);
    }

    MQ.update();
    float ppm = MQ.readSensor();
    Serial.print("Gas ("); Serial.print(Type); Serial.print(", D34): ");
    Serial.print(ppm); Serial.println(" ppm");
    if (mqOk && isfinite(ppm)) leitura["gas"] = ppm;

    // Envia para o backend, que salva e mostra no app
#if ENVIAR_PARA_VERCEL
    if (leitura.size() > 0) enviaVercel(leitura);
#else
    if (!conectado) {
      Serial.println("Backend: aguardando conexao (o npm run dev esta rodando? o IP esta certo?)");
    } else if (leitura.size() > 0) {
      String json;
      serializeJson(leitura, json);
      webSocket.sendTXT(json);
      Serial.print("Enviado: "); Serial.println(json);
    }
#endif

    Serial.println("===========================================");
  }
}
