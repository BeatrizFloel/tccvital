/* ================= Tempo real: protótipo (ESP) <-> backend <-> app =================
   Um WebSocket só, no endereço /ws do mesmo servidor (porta 3000):

   ESP32/ESP8266  ws://IP-DO-COMPUTADOR:3000/ws?email=<conta>&key=<SENSOR_KEY>
     Manda a cada poucos segundos o mesmo JSON do POST /api/sensores (sem precisar repetir o e-mail):
       { "gas": 23, "bpm": 78, "spo2": 97, "celsius": 24.5, "humidity": 60 }
     Recebe de volta { "type": "ok", "saved": {...} } ou { "type": "erro", "message": "..." }.

   App (painel)   ws://.../ws?token=<token do login>
     Recebe { "type": "sensores", "data": {...} }   -> mesmo formato do GET /api/dashboard/sensores
            { "type": "dispositivo", "online": true|false }

   Não funciona na Vercel (ela desliga o servidor quando ninguém usa): lá o painel continua
   buscando os dados a cada 5 segundos, como antes. */
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";

const MIN_INTERVAL_MS = 1000;   // o ESP pode mandar no máximo 1 leitura por segundo
const PING_MS = 30000;          // derruba conexões que pararam de responder (Wi-Fi caiu, celular bloqueou)

export function startRealtime(server, dashboard, secretKey) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const apps = new Map();      // userId -> Set de celulares/navegadores abertos no painel
  const devices = new Map();   // userId -> Set de protótipos conectados

  const add = (map, userId, socket) => (map.get(userId) || map.set(userId, new Set()).get(userId)).add(socket);
  const remove = (map, userId, socket) => {
    map.get(userId)?.delete(socket);
    if (!map.get(userId)?.size) map.delete(userId);
  };
  const send = (socket, message) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
  const sendToApps = (userId, message) => apps.get(userId)?.forEach((socket) => send(socket, message));

  // Toda leitura salva (pelo WebSocket ou pelo POST /api/sensores) vai na hora para o app
  dashboard.onSensors(async (userId) => {
    if (!apps.has(userId)) return;
    try {
      sendToApps(userId, { type: "sensores", data: await dashboard.loadSensors(userId) });
    } catch (error) {
      console.error("Tempo real: não foi possível enviar as leituras:", error.message);
    }
  });

  async function connectDevice(socket, url) {
    if (process.env.SENSOR_KEY && url.searchParams.get("key") !== process.env.SENSOR_KEY) {
      return socket.close(4001, "Chave do sensor inválida");
    }
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    const userId = email && await dashboard.findSensorOwner(email);
    if (!userId) return socket.close(4004, "Nenhuma conta com esse e-mail");

    add(devices, userId, socket);
    console.log(`Protótipo conectado (${email})`);
    sendToApps(userId, { type: "dispositivo", online: true });
    send(socket, { type: "ok", message: "Conectado ao VitalCare." });

    let lastAt = 0;
    socket.on("message", async (raw) => {
      if (Date.now() - lastAt < MIN_INTERVAL_MS) return;
      lastAt = Date.now();
      let body;
      try {
        body = JSON.parse(raw.toString());
      } catch {
        return send(socket, { type: "erro", message: "Mande um JSON, ex.: {\"bpm\":78}" });
      }
      try {
        const { status, reply } = await dashboard.receiveSensors({ ...body, email });
        send(socket, status === 201 ? { type: "ok", saved: reply.saved, ignored: reply.ignored } : { type: "erro", ...reply });
      } catch (error) {
        console.error("Tempo real: erro ao salvar a leitura:", error.message);
        send(socket, { type: "erro", message: "Não foi possível salvar a leitura." });
      }
    });

    socket.on("close", () => {
      remove(devices, userId, socket);
      console.log(`Protótipo desconectado (${email})`);
      if (!devices.has(userId)) sendToApps(userId, { type: "dispositivo", online: false });
    });
  }

  async function connectApp(socket, url) {
    let userId;
    try {
      userId = Number(jwt.verify(url.searchParams.get("token") || "", secretKey).userId);
      if (!userId) throw new Error("token sem usuário");
    } catch {
      return socket.close(4001, "Sessão expirada");
    }

    add(apps, userId, socket);
    socket.on("close", () => remove(apps, userId, socket));
    send(socket, { type: "dispositivo", online: devices.has(userId) });
    try {
      send(socket, { type: "sensores", data: await dashboard.loadSensors(userId) });
    } catch (error) {
      console.error("Tempo real: não foi possível carregar as leituras:", error.message);
    }
  }

  wss.on("connection", (socket, req) => {
    socket.alive = true;
    socket.on("pong", () => { socket.alive = true; });
    socket.on("error", () => {});
    const url = new URL(req.url, "http://localhost");
    const connect = url.searchParams.has("token") ? connectApp : connectDevice;
    connect(socket, url).catch((error) => {
      console.error("Tempo real: erro na conexão:", error.message);
      socket.close(1011, "Erro no servidor");
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (!socket.alive) return socket.terminate();
      socket.alive = false;
      socket.ping();
    });
  }, PING_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}
