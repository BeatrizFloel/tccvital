/* ================= Dashboard: dados salvos no banco =================
   MySQL quando configurado (MYSQL_URL / DB_HOST...). Sem MySQL, em desenvolvimento,
   salva em backend/.data/dashboard.json para não travar quem está testando. */
import jwt from "jsonwebtoken";
import fs from "node:fs/promises";
import path from "node:path";

const LISTS = {
  medicamentos: {
    table: "vc_medicamentos",
    fields: { name: "nome", dose: "dose", time: "horario" },
    required: ["name", "time"]
  },
  consultas: {
    table: "vc_consultas",
    fields: { title: "titulo", doctor: "medico", date: "data", time: "horario" },
    required: ["title", "date", "time"]
  },
  lembretes: {
    table: "vc_lembretes",
    fields: { title: "titulo", detail: "detalhe", time: "horario" },
    required: ["title", "time"]
  },
  // Músicas do idoso: links do Spotify ou do YouTube que tocam direto no painel
  musicas: {
    table: "vc_musicas",
    fields: { title: "titulo", url: "url" },
    required: ["url"],
    check: (values) => MUSIC_URL_RE.test(values.url) ? null : "Cole um link do Spotify ou do YouTube."
  }
};
const MUSIC_URL_RE = /^https:\/\/(open\.spotify\.com|(www\.|m\.|music\.)?youtube\.com|youtu\.be)\//i;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vc_medicamentos (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    dose VARCHAR(60) NULL,
    horario VARCHAR(5) NOT NULL,
    tomado_em DATE NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_med_usuario (id_usuario)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_consultas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    medico VARCHAR(120) NULL,
    data DATE NOT NULL,
    horario VARCHAR(5) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_consulta_usuario (id_usuario)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_lembretes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    detalhe VARCHAR(200) NULL,
    horario VARCHAR(5) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lembrete_usuario (id_usuario)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_locais (
    id_usuario INT NOT NULL PRIMARY KEY,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    cidade VARCHAR(120) NULL,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS vc_leituras_gas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    ppm DECIMAL(8,2) NOT NULL,
    lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gas_usuario (id_usuario, lido_em)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_leituras_cardiacas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    bpm DECIMAL(5,1) NULL,
    spo2 DECIMAL(4,1) NULL,
    lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cardiaca_usuario (id_usuario, lido_em)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_leituras_temperatura (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    celsius DECIMAL(5,2) NOT NULL,
    umidade DECIMAL(5,2) NULL,
    lido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_temperatura_usuario (id_usuario, lido_em)
  )`,
  // Cada "TOMEI" do idoso (botão ou voz): o painel do cuidador mostra o horário e o histórico
  `CREATE TABLE IF NOT EXISTS vc_tomadas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_medicamento INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    dose VARCHAR(60) NULL,
    horario VARCHAR(5) NOT NULL,
    dia DATE NOT NULL,
    tomado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tomada_usuario (id_usuario, tomado_em)
  )`,
  `CREATE TABLE IF NOT EXISTS vc_musicas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    titulo VARCHAR(120) NULL,
    url VARCHAR(200) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_musica_usuario (id_usuario)
  )`
];

/* ---------- Sensores ----------
   Cada valor aceita alguns apelidos para facilitar o código do Raspberry/ESP32.
   Leituras fora da faixa (ex.: -999 do oxímetro sem o dedo) são ignoradas. */
const SENSOR_FIELDS = {
  gas: { names: ["level", "gas", "ppm"], min: 0, max: 100000 },
  bpm: { names: ["bpm", "heartRate", "batimentos"], min: 20, max: 250 },
  spo2: { names: ["spo2", "oxygen", "saturacao", "oxigenio"], min: 50, max: 100 },
  celsius: { names: ["celsius", "temperature", "temperatura", "temp"], min: -40, max: 85 },
  umidade: { names: ["humidity", "umidade"], min: 0, max: 100 }
};
const HISTORY_SIZE = 30;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerDashboardRoutes(app, { hasDatabaseConfig, getPool, secretKey, tableName, readLocalUsers, backendDirectory }) {
  const localPath = path.join(backendDirectory, ".data", "dashboard.json");
  let schemaReady = null;

  /* ---------- armazenamento ---------- */
  function usingMysql() {
    if (hasDatabaseConfig()) return true;
    if (process.env.VERCEL === "1") {
      const error = new Error("Banco de dados não configurado no deploy. Defina MYSQL_URL na Vercel.");
      error.status = 503;
      throw error;
    }
    return false;
  }

  async function db() {
    const pool = getPool();
    if (!schemaReady) schemaReady = Promise.all(SCHEMA.map((sql) => pool.query(sql))).catch((error) => { schemaReady = null; throw error; });
    await schemaReady;
    return pool;
  }

  async function readLocal() {
    const empty = { nextId: 1, medicamentos: [], consultas: [], lembretes: [], musicas: [], tomadas: [], locais: {}, leituras_gas: [], leituras_cardiacas: [], leituras_temperatura: [] };
    try {
      return { ...empty, ...JSON.parse(await fs.readFile(localPath, "utf8")) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return empty;
    }
  }

  async function writeLocal(data) {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, JSON.stringify(data, null, 2), "utf8");
  }

  /* ---------- autenticação ---------- */
  function auth(req, res, next) {
    const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    try {
      const payload = jwt.verify(token, secretKey);
      req.userId = Number(payload.userId);
      if (!req.userId) throw new Error("token sem usuário");
      next();
    } catch {
      res.status(401).json({ message: "Sessão expirada. Entre novamente." });
    }
  }

  function handle(fn) {
    return async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        console.error("Erro no dashboard:", error.message);
        res.status(error.status || 500).json({ message: error.status ? error.message : "Não foi possível acessar os dados do painel." });
      }
    };
  }

  /* ---------- formato enviado ao navegador ---------- */
  const toMedication = (row) => ({ id: row.id, name: row.nome, dose: row.dose || "", time: row.horario, takenOn: row.tomado_em || null });
  const toAppointment = (row) => ({ id: row.id, title: row.titulo, doctor: row.medico || "", date: row.data, time: row.horario });
  const toReminder = (row) => ({ id: row.id, title: row.titulo, detail: row.detalhe || "", time: row.horario });
  const toMusic = (row) => ({ id: row.id, title: row.titulo || "", url: row.url });
  const toDose = (row) => ({ medicationId: row.id_medicamento, name: row.nome, dose: row.dose || "", time: row.horario, day: row.dia, at: new Date(row.tomado_em).toISOString() });
  const toLocation = (row) => row ? { latitude: Number(row.latitude), longitude: Number(row.longitude), city: row.cidade || "" } : null;
  const toGas = (row) => row ? { level: Number(row.ppm), updatedAt: new Date(row.lido_em).toISOString() } : null;
  const numberOrNull = (value) => value === null || value === undefined ? null : Number(value);
  const toHeartPoint = (row) => ({ bpm: numberOrNull(row.bpm), spo2: numberOrNull(row.spo2), at: new Date(row.lido_em).toISOString() });
  const toTemperaturePoint = (row) => ({ celsius: Number(row.celsius), humidity: numberOrNull(row.umidade), at: new Date(row.lido_em).toISOString() });

  // Última leitura + histórico curto (mais antiga primeiro) para o gráfico do painel
  function withHistory(points) {
    if (!points.length) return null;
    const { at, ...latest } = points.at(-1);
    return { ...latest, updatedAt: at, history: points };
  }

  async function latestRows(table, columns, userId) {
    if (usingMysql()) {
      const [rows] = await (await db()).query(
        `SELECT ${columns}, lido_em FROM ${table} WHERE id_usuario = ? ORDER BY lido_em DESC, id DESC LIMIT ${HISTORY_SIZE}`, [userId]);
      return rows.reverse();
    }
    const data = await readLocal();
    return data[table.replace(/^vc_/, "")].filter((row) => row.id_usuario === userId).slice(-HISTORY_SIZE);
  }

  async function loadGas(userId) {
    return toGas((await latestRows("vc_leituras_gas", "ppm", userId)).at(-1));
  }

  async function loadSensors(userId) {
    const [gas, heart, temperature] = await Promise.all([
      loadGas(userId),
      latestRows("vc_leituras_cardiacas", "bpm, spo2", userId),
      latestRows("vc_leituras_temperatura", "celsius, umidade", userId)
    ]);
    return { gas, heart: withHistory(heart.map(toHeartPoint)), temperature: withHistory(temperature.map(toTemperaturePoint)) };
  }

  /* ---------- rotas do painel ---------- */
  // Tudo o que o painel mostra (também usado pela assistente de voz)
  async function loadDashboardData(userId) {
    if (usingMysql()) {
      const pool = await db();
      const [[meds], [appointments], [reminders], [music], [locations]] = await Promise.all([
        pool.query("SELECT id, nome, dose, horario, DATE_FORMAT(tomado_em, '%Y-%m-%d') AS tomado_em FROM vc_medicamentos WHERE id_usuario = ? ORDER BY horario", [userId]),
        pool.query("SELECT id, titulo, medico, DATE_FORMAT(data, '%Y-%m-%d') AS data, horario FROM vc_consultas WHERE id_usuario = ? ORDER BY data, horario", [userId]),
        pool.query("SELECT id, titulo, detalhe, horario FROM vc_lembretes WHERE id_usuario = ? ORDER BY horario", [userId]),
        pool.query("SELECT id, titulo, url FROM vc_musicas WHERE id_usuario = ? ORDER BY id", [userId]),
        pool.query("SELECT latitude, longitude, cidade FROM vc_locais WHERE id_usuario = ?", [userId])
      ]);
      return {
        medications: meds.map(toMedication),
        appointments: appointments.map(toAppointment),
        reminders: reminders.map(toReminder),
        music: music.map(toMusic),
        location: toLocation(locations[0]),
        ...(await loadSensors(userId))
      };
    }

    const data = await readLocal();
    const mine = (list) => data[list].filter((row) => row.id_usuario === userId)
      .sort((a, b) => `${a.data || ""} ${a.horario}`.localeCompare(`${b.data || ""} ${b.horario}`));
    return {
      medications: mine("medicamentos").map(toMedication),
      appointments: mine("consultas").map(toAppointment),
      reminders: mine("lembretes").map(toReminder),
      music: data.musicas.filter((row) => row.id_usuario === userId).map(toMusic),
      location: toLocation(data.locais[userId]),
      ...(await loadSensors(userId))
    };
  }

  // Marca o remédio como tomado no dia `takenOn` (AAAA-MM-DD) ou volta para pendente (null)
  // Também registra a dose em vc_tomadas (ou apaga o registro do dia, se voltar para pendente)
  async function setMedicationTaken(userId, id, takenOn) {
    if (usingMysql()) {
      const pool = await db();
      const [[med]] = await pool.query(
        "SELECT nome, dose, horario, DATE_FORMAT(tomado_em, '%Y-%m-%d') AS tomado_em FROM vc_medicamentos WHERE id = ? AND id_usuario = ?", [id, userId]);
      if (!med) return false;
      await pool.query("UPDATE vc_medicamentos SET tomado_em = ? WHERE id = ? AND id_usuario = ?", [takenOn, id, userId]);
      if (takenOn && med.tomado_em !== takenOn) {
        await pool.query("INSERT INTO vc_tomadas (id_usuario, id_medicamento, nome, dose, horario, dia) VALUES (?, ?, ?, ?, ?, ?)",
          [userId, id, med.nome, med.dose, med.horario, takenOn]);
      } else if (!takenOn && med.tomado_em) {
        await pool.query("DELETE FROM vc_tomadas WHERE id_usuario = ? AND id_medicamento = ? AND dia = ?", [userId, id, med.tomado_em]);
      }
      return true;
    }
    const data = await readLocal();
    const row = data.medicamentos.find((item) => item.id === id && item.id_usuario === userId);
    if (!row) return false;
    if (takenOn && row.tomado_em !== takenOn) {
      data.tomadas.push({ id: data.nextId++, id_usuario: userId, id_medicamento: id, nome: row.nome, dose: row.dose, horario: row.horario, dia: takenOn, tomado_em: new Date().toISOString() });
      data.tomadas = data.tomadas.slice(-2000);
    } else if (!takenOn && row.tomado_em) {
      data.tomadas = data.tomadas.filter((item) => !(item.id_usuario === userId && item.id_medicamento === id && item.dia === row.tomado_em));
    }
    row.tomado_em = takenOn;
    await writeLocal(data);
    return true;
  }

  /* ---------- Histórico para o painel do cuidador ----------
     As leituras são agrupadas em ~120 intervalos (média, mínimo e máximo de cada um),
     para o gráfico continuar leve mesmo com o ESP mandando uma leitura por segundo. */
  const HISTORY_POINTS = 120;
  const HISTORY_SERIES = [
    { key: "heart", table: "vc_leituras_cardiacas", columns: ["bpm", "spo2"] },
    { key: "gas", table: "vc_leituras_gas", columns: ["ppm"] },
    { key: "temperature", table: "vc_leituras_temperatura", columns: ["celsius"] }
  ];

  function bucketRows(rows, columns, bucketSeconds) {
    const buckets = new Map();
    for (const row of rows) {
      const t = Math.floor(new Date(row.lido_em).getTime() / 1000 / bucketSeconds) * bucketSeconds;
      const bucket = buckets.get(t) || buckets.set(t, { t }).get(t);
      for (const column of columns) {
        if (row[column] === null || row[column] === undefined) continue;
        const value = Number(row[column]);
        const stats = bucket[column] || (bucket[column] = { sum: 0, n: 0, min: value, max: value });
        stats.sum += value;
        stats.n++;
        stats.min = Math.min(stats.min, value);
        stats.max = Math.max(stats.max, value);
      }
    }
    return [...buckets.values()].sort((a, b) => a.t - b.t).map((bucket) => {
      const point = { at: new Date(bucket.t * 1000).toISOString() };
      for (const column of columns) {
        const stats = bucket[column];
        point[column] = stats ? { avg: Math.round(stats.sum / stats.n * 10) / 10, min: stats.min, max: stats.max } : null;
      }
      return point;
    });
  }

  async function loadHistory(userId, hours) {
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const bucketSeconds = Math.max(60, Math.round(hours * 3600 / HISTORY_POINTS));
    const result = { hours, bucketMinutes: bucketSeconds / 60 };

    if (usingMysql()) {
      const pool = await db();
      await Promise.all(HISTORY_SERIES.map(async ({ key, table, columns }) => {
        const stats = columns.map((c) => `AVG(${c}) AS ${c}_avg, MIN(${c}) AS ${c}_min, MAX(${c}) AS ${c}_max`).join(", ");
        const [rows] = await pool.query(
          `SELECT FLOOR(UNIX_TIMESTAMP(lido_em) / ?) * ? AS t, ${stats} FROM ${table}
           WHERE id_usuario = ? AND lido_em >= FROM_UNIXTIME(?) GROUP BY t ORDER BY t`,
          [bucketSeconds, bucketSeconds, userId, since]);
        result[key] = rows.map((row) => {
          const point = { at: new Date(Number(row.t) * 1000).toISOString() };
          for (const c of columns) {
            point[c] = row[`${c}_avg`] === null ? null
              : { avg: Math.round(Number(row[`${c}_avg`]) * 10) / 10, min: Number(row[`${c}_min`]), max: Number(row[`${c}_max`]) };
          }
          return point;
        });
      }));
      const [doses] = await pool.query(
        `SELECT id_medicamento, nome, dose, horario, DATE_FORMAT(dia, '%Y-%m-%d') AS dia, tomado_em FROM vc_tomadas
         WHERE id_usuario = ? AND tomado_em >= NOW() - INTERVAL 7 DAY ORDER BY tomado_em DESC LIMIT 200`, [userId]);
      result.doses = doses.map(toDose);
      return result;
    }

    const data = await readLocal();
    for (const { key, table, columns } of HISTORY_SERIES) {
      const rows = data[table.replace(/^vc_/, "")].filter((row) => row.id_usuario === userId && new Date(row.lido_em).getTime() / 1000 >= since);
      result[key] = bucketRows(rows, columns, bucketSeconds);
    }
    const weekAgo = Date.now() - 7 * 86400000;
    result.doses = data.tomadas.filter((row) => row.id_usuario === userId && new Date(row.tomado_em).getTime() >= weekAgo)
      .reverse().slice(0, 200).map(toDose);
    return result;
  }

  app.get(["/dashboard", "/api/dashboard"], auth, handle(async (req, res) => {
    res.json(await loadDashboardData(req.userId));
  }));

  app.post(["/dashboard/:list", "/api/dashboard/:list"], auth, handle(async (req, res) => {
    const config = LISTS[req.params.list];
    if (!config) return res.status(404).json({ message: "Lista inexistente." });

    const values = {};
    for (const [key, column] of Object.entries(config.fields)) {
      values[column] = String(req.body?.[key] ?? "").trim().slice(0, 200) || null;
    }
    const missing = config.required.find((key) => !values[config.fields[key]]);
    if (missing) return res.status(400).json({ message: "Preencha todos os campos obrigatórios." });
    if (values.horario && !TIME_RE.test(values.horario)) return res.status(400).json({ message: "Horário inválido." });
    if (values.data && !DATE_RE.test(values.data)) return res.status(400).json({ message: "Data inválida." });
    const invalid = config.check?.(values);
    if (invalid) return res.status(400).json({ message: invalid });

    if (usingMysql()) {
      const columns = Object.keys(values);
      const [result] = await (await db()).query(
        `INSERT INTO ${config.table} (id_usuario, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        [req.userId, ...columns.map((column) => values[column])]
      );
      return res.status(201).json({ id: result.insertId });
    }

    const data = await readLocal();
    const row = { id: data.nextId++, id_usuario: req.userId, ...values, tomado_em: null };
    data[req.params.list].push(row);
    await writeLocal(data);
    return res.status(201).json({ id: row.id });
  }));

  app.delete(["/dashboard/:list/:id", "/api/dashboard/:list/:id"], auth, handle(async (req, res) => {
    const config = LISTS[req.params.list];
    if (!config) return res.status(404).json({ message: "Lista inexistente." });
    const id = Number(req.params.id);

    if (usingMysql()) {
      await (await db()).query(`DELETE FROM ${config.table} WHERE id = ? AND id_usuario = ?`, [id, req.userId]);
    } else {
      const data = await readLocal();
      data[req.params.list] = data[req.params.list].filter((row) => !(row.id === id && row.id_usuario === req.userId));
      await writeLocal(data);
    }
    return res.json({ message: "Removido." });
  }));

  // Marca o remédio como tomado no dia (o navegador envia a data local) ou volta para pendente
  app.patch(["/dashboard/medicamentos/:id", "/api/dashboard/medicamentos/:id"], auth, handle(async (req, res) => {
    const id = Number(req.params.id);
    const takenOn = req.body?.takenOn ? String(req.body.takenOn) : null;
    if (takenOn && !DATE_RE.test(takenOn)) return res.status(400).json({ message: "Data inválida." });

    await setMedicationTaken(req.userId, id, takenOn);
    return res.json({ message: "Atualizado." });
  }));

  // Localização da casa (vinda do GPS/rede do monitor) usada para o clima
  app.put(["/dashboard/local", "/api/dashboard/local"], auth, handle(async (req, res) => {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const city = String(req.body?.city || "").trim().slice(0, 120) || null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: "Localização inválida." });
    }

    if (usingMysql()) {
      await (await db()).query(
        `INSERT INTO vc_locais (id_usuario, latitude, longitude, cidade) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), cidade = VALUES(cidade)`,
        [req.userId, latitude, longitude, city]
      );
    } else {
      const data = await readLocal();
      data.locais[req.userId] = { latitude, longitude, cidade: city };
      await writeLocal(data);
    }
    return res.json({ message: "Localização salva." });
  }));

  app.get(["/dashboard/gas", "/api/dashboard/gas"], auth, handle(async (req, res) => {
    res.json(await loadGas(req.userId));
  }));

  // Painel do cuidador: histórico dos sensores (?horas=6, 24 ou 168) e as doses tomadas nos últimos 7 dias
  app.get(["/dashboard/historico", "/api/dashboard/historico"], auth, handle(async (req, res) => {
    const hours = Math.min(Math.max(Number(req.query.horas) || 24, 1), 168);
    res.json(await loadHistory(req.userId, hours));
  }));

  // Gás, batimentos/oxímetro e temperatura de uma vez (o painel consulta a cada poucos segundos)
  app.get(["/dashboard/sensores", "/api/dashboard/sensores"], auth, handle(async (req, res) => {
    res.json(await loadSensors(req.userId));
  }));

  /* ---------- Recebimento dos sensores ----------
     O dispositivo (Raspberry Pi/ESP32) identifica a conta pelo e-mail e envia só o que tiver:
       POST /api/sensores              { "email": "...", "gas": 23, "bpm": 78, "spo2": 97, "celsius": 24.5, "humidity": 60 }
       POST /api/sensores/gas          { "email": "...", "level": 23 }
       POST /api/sensores/cardiaco     { "email": "...", "bpm": 78, "spo2": 97 }
       POST /api/sensores/temperatura  { "email": "...", "celsius": 24.5, "humidity": 60 }
     Se SENSOR_KEY estiver definida, o dispositivo manda o cabeçalho  x-sensor-key: <SENSOR_KEY> */
  const SENSOR_HELP = {
    "": "Envie email e ao menos um valor: gas, bpm, spo2, celsius ou humidity.",
    gas: "Envie email e level (número em ppm).",
    cardiaco: "Envie email e bpm (20 a 250) e/ou spo2 (50 a 100).",
    temperatura: "Envie email e celsius (-40 a 85). humidity (0 a 100) é opcional."
  };
  const SENSOR_ACCEPTS = { gas: ["gas"], cardiaco: ["bpm", "spo2"], temperatura: ["celsius", "umidade"] };

  function readSensorValues(body, tipo) {
    const values = {};
    const ignored = [];
    for (const [key, field] of Object.entries(SENSOR_FIELDS)) {
      if (tipo && !SENSOR_ACCEPTS[tipo].includes(key)) continue;
      const name = field.names.find((item) => body?.[item] !== undefined && body[item] !== null && body[item] !== "");
      if (!name) continue;
      const value = Number(body[name]);
      if (Number.isFinite(value) && value >= field.min && value <= field.max) values[key] = Math.round(value * 100) / 100;
      else ignored.push(name);
    }
    // umidade sozinha não forma uma leitura de temperatura
    if (values.umidade !== undefined && values.celsius === undefined) delete values.umidade;
    return { values, ignored };
  }

  async function findSensorOwner(email) {
    if (usingMysql()) {
      const [users] = await (await db()).query(`SELECT id_usuario FROM ${tableName} WHERE email = ? LIMIT 1`, [email]);
      return users[0]?.id_usuario ?? null;
    }
    return (await readLocalUsers()).find((item) => item.email === email)?.id_usuario ?? null;
  }

  async function saveReadings(userId, values) {
    const rows = [];
    if (values.gas !== undefined) rows.push(["vc_leituras_gas", { ppm: values.gas }]);
    if (values.bpm !== undefined || values.spo2 !== undefined) rows.push(["vc_leituras_cardiacas", { bpm: values.bpm ?? null, spo2: values.spo2 ?? null }]);
    if (values.celsius !== undefined) rows.push(["vc_leituras_temperatura", { celsius: values.celsius, umidade: values.umidade ?? null }]);

    if (usingMysql()) {
      const pool = await db();
      for (const [table, row] of rows) {
        const columns = Object.keys(row);
        await pool.query(`INSERT INTO ${table} (id_usuario, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
          [userId, ...columns.map((column) => row[column])]);
      }
      return;
    }
    const data = await readLocal();
    for (const [table, row] of rows) {
      const list = table.replace(/^vc_/, "");
      data[list].push({ id: data.nextId++, id_usuario: userId, ...row, lido_em: new Date().toISOString() });
      data[list] = data[list].slice(-5000);
    }
    await writeLocal(data);
  }

  // Avisados a cada leitura salva (o tempo-real.js usa para mandar na hora para o app)
  const sensorListeners = new Set();

  // Usado pelo POST abaixo e pelo WebSocket do ESP (tempo-real.js): valida, salva e avisa o app
  async function receiveSensors(body, tipo = "") {
    const email = String(body?.email || "").trim().toLowerCase();
    const { values, ignored } = readSensorValues(body, tipo);
    if (!email || !Object.keys(values).length) return { status: 400, reply: { message: SENSOR_HELP[tipo], ignored } };

    const userId = await findSensorOwner(email);
    if (!userId) return { status: 404, reply: { message: "Nenhuma conta com esse e-mail." } };

    await saveReadings(userId, values);
    sensorListeners.forEach((listener) => listener(userId));
    const reply = { message: "Leitura recebida.", saved: values, ignored };
    if (values.gas !== undefined) reply.level = values.gas;
    return { status: 201, reply, userId };
  }

  app.post(["/sensores", "/api/sensores", "/sensores/:tipo", "/api/sensores/:tipo"], handle(async (req, res) => {
    const tipo = req.params.tipo || "";
    if (!(tipo in SENSOR_HELP)) return res.status(404).json({ message: "Sensor inexistente. Use gas, cardiaco ou temperatura." });
    if (process.env.SENSOR_KEY && req.get("x-sensor-key") !== process.env.SENSOR_KEY) return res.status(401).json({ message: "Chave do sensor inválida." });

    const { status, reply } = await receiveSensors(req.body, tipo);
    return res.status(status).json(reply);
  }));

  return {
    auth, handle, loadDashboardData, setMedicationTaken, isValidDate: (value) => DATE_RE.test(String(value || "")),
    loadSensors, receiveSensors, findSensorOwner, onSensors: (listener) => sensorListeners.add(listener)
  };
}
