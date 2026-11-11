/* Faz de conta que é o ESP32: manda leituras a cada 3 segundos para testar o site sem o protótipo.
   Uso (na pasta do projeto, com o servidor ligado em outro terminal):
     npm run simular -- email@da.conta
     npm run simular -- email@da.conta gas        (simula vazamento de gás, para ver o alerta)
     npm run simular -- email@da.conta normal https://tccvital-3.vercel.app
   Cuidado: no site da Vercel as leituras falsas ficam salvas no banco de verdade.
   Se SENSOR_KEY estiver no .env, ela é enviada junto. Pare com Ctrl+C. */
import "dotenv/config";

const [email, modo = "normal", servidor = "http://localhost:3000"] = process.argv.slice(2);
if (!email) {
  console.log("Informe o e-mail da conta. Exemplo: npm run simular -- email@da.conta");
  process.exit(1);
}

const INTERVALO_MS = 3000;
const entre = (min, max) => Math.round((min + Math.random() * (max - min)) * 10) / 10;

function leitura() {
  return {
    email,
    gas: modo === "gas" ? entre(250, 400) : entre(5, 30),
    bpm: Math.round(entre(68, 84)),
    spo2: Math.round(entre(96, 99)),
    celsius: entre(23, 25),
    humidity: Math.round(entre(50, 60))
  };
}

async function enviar() {
  const corpo = leitura();
  try {
    const resposta = await fetch(`${servidor}/api/sensores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.SENSOR_KEY ? { "x-sensor-key": process.env.SENSOR_KEY } : {}) },
      body: JSON.stringify(corpo)
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      console.log(`Recusado: ${dados.message}`);
      process.exit(1);
    }
    console.log(`Enviado: ${corpo.bpm} bpm, ${corpo.spo2}% de oxigenação, ${corpo.gas} ppm de gás, ${corpo.celsius} °C`);
  } catch (error) {
    console.log(`Não consegui falar com ${servidor}. O servidor está ligado? (${error.message})`);
  }
}

console.log(`Simulando o ESP32 para ${email} em ${servidor}. Pare com Ctrl+C.`);
enviar();
setInterval(enviar, INTERVALO_MS);
