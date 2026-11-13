#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <DHT.h>
#include <MAX30105.h>          // biblioteca "SparkFun MAX3010x Pulse and Proximity Sensor Library"
#include "spo2_algorithm.h"    // vem junto com essa mesma biblioteca

// ==========================================================
//  ESP32 do protótipo: DHT11 (temperatura e umidade), MQ-2 (gás)
//  e MAX30102 (batimentos e oxigenação). Manda tudo para o site
//  a cada 5 segundos.
//
//  LIGAÇÕES (ESP32 DevKit)
//  DHT11:     VCC -> 3V3   DATA -> D4    GND -> GND
//  MQ-2:      AO  -> D34   (o DO não é usado)
//  MAX30102:  VIN -> 3V3   GND -> GND    SDA -> D18   SCL -> D19
// ==========================================================

// --- Configurações do Wi-Fi (preencha antes de carregar; não suba a senha para o GitHub) ---
const char* ssid = "NOME_DA_REDE";
const char* password = "SENHA_DA_REDE";

// --- Configurações da API (backend Node na Vercel) ---
const char* url_api = "https://tccvital-3.vercel.app/api/sensores";
const char* account_email = "byacururu@gmail.com"; // e-mail da conta usada para entrar no app
const char* SENSOR_KEY = "";                       // deixe vazio (só preencha se definir SENSOR_KEY na Vercel)

// --- Configurações dos Sensores ---
#define DHTPIN 4          // DHT11: DATA no D4
#define DHTTYPE DHT11
#define MQ2_AOUT 34       // gás: AO no D34
#define OXI_SDA 18        // oxímetro MAX30102: SDA no D18
#define OXI_SCL 19        // oxímetro MAX30102: SCL no D19

const unsigned long INTERVALO_ENVIO = 5000; // manda para o site a cada 5 segundos
const long DEDO_MINIMO = 50000;             // abaixo disso, não tem dedo no oxímetro

// --- Gás (MQ-2) ---
// Ao ligar, o ESP32 mede o ar limpo. Tem gás quando a leitura sobe GAS_ACIMA_DO_NORMAL acima disso.
// Menor = mais sensível. O aviso só vai para o site se o gás continuar por GAS_TEMPO_MINIMO.
const int GAS_ACIMA_DO_NORMAL = 60;
const unsigned long GAS_TEMPO_MINIMO = 30000;   // 30 segundos
float gasBase = 0;                // leitura do ar limpo (ajustada devagar enquanto não há gás)
unsigned long gasDesde = 0;       // quando o gás começou (0 = sem gás agora)

DHT dht(DHTPIN, DHTTYPE);
WiFiClientSecure clienteHttps;

// --- Oxímetro: guarda 100 amostras (4 s) e recalcula a cada 25 novas (1 s) ---
MAX30105 oximetro;
bool oximetroOk = false;
const int32_t TAMANHO_BUFFER = 100;
uint32_t irBuffer[TAMANHO_BUFFER];
uint32_t redBuffer[TAMANHO_BUFFER];
int32_t amostras = 0;
int32_t bpm = 0, spo2 = 0;
int8_t bpmValido = 0, spo2Valido = 0;
long ultimoIR = 0;

unsigned long ultimoEnvio = 0;

// Função para gerenciar a conexão Wi-Fi de forma automática
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Conectando ao Wi-Fi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Conectado com sucesso!");
    Serial.print("Endereço IP do ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFalha ao conectar. Tentará novamente na próxima leitura.");
  }
}

// Tenta achar o oxímetro com SDA e SCL nesses pinos
bool tentaOximetro(int sda, int scl) {
  Wire.end();
  Wire.begin(sda, scl);
  if (!oximetro.begin(Wire, I2C_SPEED_STANDARD)) return false;
  Serial.printf("Oxímetro encontrado: SDA no D%d e SCL no D%d.\n", sda, scl);
  return true;
}

// Chamada o tempo todo no loop: junta as amostras do oxímetro e calcula batimentos e oxigenação
void leOximetro() {
  if (!oximetroOk) return;
  oximetro.check();
  while (oximetro.available()) {
    redBuffer[amostras] = oximetro.getFIFORed();
    irBuffer[amostras] = oximetro.getFIFOIR();
    ultimoIR = irBuffer[amostras];
    oximetro.nextSample();
    amostras++;

    if (amostras == TAMANHO_BUFFER) {
      maxim_heart_rate_and_oxygen_saturation(irBuffer, TAMANHO_BUFFER, redBuffer, &spo2, &spo2Valido, &bpm, &bpmValido);
      // descarta as 25 amostras mais antigas e continua enchendo
      memmove(irBuffer, irBuffer + 25, (TAMANHO_BUFFER - 25) * sizeof(uint32_t));
      memmove(redBuffer, redBuffer + 25, (TAMANHO_BUFFER - 25) * sizeof(uint32_t));
      amostras = TAMANHO_BUFFER - 25;
    }
  }
  // tirou o dedo: zera, para não mandar um valor velho
  if (ultimoIR < DEDO_MINIMO) {
    amostras = 0;
    bpmValido = 0;
    spo2Valido = 0;
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(MQ2_AOUT, INPUT);

  // Gás: mede o ar limpo por 10 segundos (ligue longe de gás e fogo)
  Serial.print("Medindo o ar limpo para o sensor de gás (10 s)...");
  long soma = 0;
  for (int i = 0; i < 100; i++) {
    soma += analogRead(MQ2_AOUT);
    delay(100);
  }
  gasBase = soma / 100.0;
  Serial.printf(" pronto! Ar limpo = %.0f\n", gasBase);

  // Oxímetro MAX30102 (I2C: SDA no D18, SCL no D19)
  oximetroOk = tentaOximetro(OXI_SDA, OXI_SCL);
  if (oximetroOk) {
    // brilho 60, média 4, vermelho + infravermelho, 100 Hz -> 25 amostras/s (o cálculo precisa disso)
    oximetro.setup(60, 4, 2, 100, 411, 4096);
  } else {
    Serial.println("ATENÇÃO: oxímetro não encontrado. Confira VIN=3V3, GND, SDA=D18 e SCL=D19.");
  }

  WiFi.mode(WIFI_STA);
  conectarWiFi();

  clienteHttps.setInsecure(); // não confere o certificado HTTPS (suficiente para o protótipo)

  Serial.println("--- Sistema IoT Iniciado ---");
}

void loop() {
  leOximetro();   // precisa rodar o tempo todo (não use delay longo no loop)

  if (millis() - ultimoEnvio < INTERVALO_ENVIO) return;
  ultimoEnvio = millis();

  // Garante estabilidade na conexão Wi-Fi
  conectarWiFi();

  // Leituras físicas dos sensores
  float umidade = dht.readHumidity();
  float temperatura = dht.readTemperature();
  int valorAnalogico = analogRead(MQ2_AOUT);
  bool dhtOk = !(isnan(umidade) || isnan(temperatura));
  bool temDedo = oximetroOk && ultimoIR >= DEDO_MINIMO;

  // Gás na escala do site: subir GAS_ACIMA_DO_NORMAL acima do ar limpo vira 50 (começo do "Atenção");
  // 4 vezes isso vira 200 (começo do "Perigo")
  float acima = valorAnalogico - gasBase;
  int gasSite = acima > 0 ? (int)(acima * 50 / GAS_ACIMA_DO_NORMAL) : 0;
  bool temGas = gasSite >= 50;
  if (temGas) {
    if (gasDesde == 0) gasDesde = millis();
  } else {
    gasDesde = 0;
    gasBase = gasBase * 0.98 + valorAnalogico * 0.02;   // sem gás: acompanha o sensor esquentando aos poucos
  }
  unsigned long segundosComGas = temGas ? (millis() - gasDesde) / 1000 : 0;
  bool gasConfirmado = temGas && millis() - gasDesde >= GAS_TEMPO_MINIMO;
  // antes dos 30 s, manda 49 (logo abaixo do aviso): o site só avisa se o gás continuar
  int gasEnviado = (temGas && !gasConfirmado) ? 49 : gasSite;

  // Print de depuração local no Monitor Serial
  Serial.println("-------------------------------");
  if (dhtOk) Serial.printf("Temp: %.1f°C | Umid: %.1f%%\n", temperatura, umidade);
  else Serial.println("[Erro DHT11] Leitura inválida (a temperatura não vai nesta rodada).");
  Serial.printf("Gás: %d no pino (ar limpo: %.0f) -> site: %d", valorAnalogico, gasBase, gasEnviado);
  if (gasConfirmado) Serial.println("  ** GÁS CONFIRMADO: aviso no site **");
  else if (temGas) Serial.printf("  (gás há %lu s; avisa aos 30 s)\n", segundosComGas);
  else Serial.println();
  if (!oximetroOk) Serial.println("Oxímetro: não conectado");
  else if (!temDedo) Serial.println("Oxímetro: sem dedo no sensor");
  else if (!bpmValido && !spo2Valido) Serial.println("Oxímetro: calculando... (mantenha o dedo parado)");
  else Serial.printf("Oxímetro: %d bpm | SpO2 %d%%\n", bpmValido ? bpm : 0, spo2Valido ? spo2 : 0);

  // Envio dos dados caso a rede esteja conectada
  if (WiFi.status() == WL_CONNECTED) {
    // Monta o JSON só com o que foi lido certo
    String corpoJSON = "{\"email\":\"" + String(account_email) + "\"";
    if (dhtOk) corpoJSON += ",\"celsius\":" + String(temperatura) + ",\"humidity\":" + String(umidade);
    corpoJSON += ",\"gas\":" + String(gasEnviado);
    if (temDedo && bpmValido) corpoJSON += ",\"bpm\":" + String(bpm);
    if (temDedo && spo2Valido) corpoJSON += ",\"spo2\":" + String(spo2);
    corpoJSON += "}";

    HTTPClient http;
    http.begin(clienteHttps, url_api);
    http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json");
    if (strlen(SENSOR_KEY)) http.addHeader("x-sensor-key", SENSOR_KEY);

    Serial.println("Enviando: " + corpoJSON);
    int codigoRespostaHTTP = http.POST(corpoJSON);

    // Validação da resposta do servidor
    if (codigoRespostaHTTP > 0) {
      Serial.printf("Código HTTP: %d\n", codigoRespostaHTTP);
      Serial.println("Resposta do servidor: " + http.getString());
    } else {
      Serial.printf("Erro no envio do POST. Código: %s\n", http.errorToString(codigoRespostaHTTP).c_str());
    }
    http.end();
  }
}
