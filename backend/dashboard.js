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
  }
};

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
  )`
];

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
    try {
      return JSON.parse(await fs.readFile(localPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { nextId: 1, medicamentos: [], consultas: [], lembretes: [], locais: {}, leituras_gas: [] };
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
  const toLocation = (row) => row ? { latitude: Number(row.latitude), longitude: Number(row.longitude), city: row.cidade || "" } : null;
  const toGas = (row) => row ? { level: Number(row.ppm), updatedAt: new Date(row.lido_em).toISOString() } : null;

  async function loadGas(userId) {
    if (usingMysql()) {
      const [rows] = await (await db()).query("SELECT ppm, lido_em FROM vc_leituras_gas WHERE id_usuario = ? ORDER BY lido_em DESC, id DESC LIMIT 1", [userId]);
      return toGas(rows[0]);
    }
    const data = await readLocal();
    return toGas(data.leituras_gas.filter((row) => row.id_usuario === userId).at(-1));
  }

  /* ---------- rotas do painel ---------- */
  app.get(["/dashboard", "/api/dashboard"], auth, handle(async (req, res) => {
    const userId = req.userId;
    if (usingMysql()) {
      const pool = await db();
      const [[meds], [appointments], [reminders], [locations]] = await Promise.all([
        pool.query("SELECT id, nome, dose, horario, DATE_FORMAT(tomado_em, '%Y-%m-%d') AS tomado_em FROM vc_medicamentos WHERE id_usuario = ? ORDER BY horario", [userId]),
        pool.query("SELECT id, titulo, medico, DATE_FORMAT(data, '%Y-%m-%d') AS data, horario FROM vc_consultas WHERE id_usuario = ? ORDER BY data, horario", [userId]),
        pool.query("SELECT id, titulo, detalhe, horario FROM vc_lembretes WHERE id_usuario = ? ORDER BY horario", [userId]),
        pool.query("SELECT latitude, longitude, cidade FROM vc_locais WHERE id_usuario = ?", [userId])
      ]);
      return res.json({
        medications: meds.map(toMedication),
        appointments: appointments.map(toAppointment),
        reminders: reminders.map(toReminder),
        location: toLocation(locations[0]),
        gas: await loadGas(userId)
      });
    }

    const data = await readLocal();
    const mine = (list) => data[list].filter((row) => row.id_usuario === userId)
      .sort((a, b) => `${a.data || ""} ${a.horario}`.localeCompare(`${b.data || ""} ${b.horario}`));
    return res.json({
      medications: mine("medicamentos").map(toMedication),
      appointments: mine("consultas").map(toAppointment),
      reminders: mine("lembretes").map(toReminder),
      location: toLocation(data.locais[userId]),
      gas: await loadGas(userId)
    });
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

    if (usingMysql()) {
      await (await db()).query("UPDATE vc_medicamentos SET tomado_em = ? WHERE id = ? AND id_usuario = ?", [takenOn, id, req.userId]);
    } else {
      const data = await readLocal();
      const row = data.medicamentos.find((item) => item.id === id && item.id_usuario === req.userId);
      if (row) row.tomado_em = takenOn;
      await writeLocal(data);
    }
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

  /* ---------- Sensor de gás ----------
     O sensor (ESP32/Arduino) envia: POST /api/sensores/gas  { "email": "dono@conta.com", "level": 23 }
     Se SENSOR_KEY estiver definida, o sensor manda o cabeçalho  x-sensor-key: <SENSOR_KEY> */
  app.post(["/sensores/gas", "/api/sensores/gas"], handle(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const level = Number(req.body?.level);
    if (process.env.SENSOR_KEY && req.get("x-sensor-key") !== process.env.SENSOR_KEY) return res.status(401).json({ message: "Chave do sensor inválida." });
    if (!email || !Number.isFinite(level) || level < 0) return res.status(400).json({ message: "Envie email e level (número em ppm)." });

    if (usingMysql()) {
      const pool = await db();
      const [users] = await pool.query(`SELECT id_usuario FROM ${tableName} WHERE email = ? LIMIT 1`, [email]);
      if (!users.length) return res.status(404).json({ message: "Nenhuma conta com esse e-mail." });
      await pool.query("INSERT INTO vc_leituras_gas (id_usuario, ppm) VALUES (?, ?)", [users[0].id_usuario, level]);
    } else {
      const user = (await readLocalUsers()).find((item) => item.email === email);
      if (!user) return res.status(404).json({ message: "Nenhuma conta com esse e-mail." });
      const data = await readLocal();
      data.leituras_gas.push({ id: data.nextId++, id_usuario: user.id_usuario, ppm: level, lido_em: new Date().toISOString() });
      data.leituras_gas = data.leituras_gas.slice(-5000);
      await writeLocal(data);
    }
    return res.status(201).json({ message: "Leitura recebida.", level });
  }));
}
