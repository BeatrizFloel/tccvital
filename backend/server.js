import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const secretKey = process.env.JWT_SECRET || "vitalcare-development-secret";
let pool;
const tableName = process.env.DB_TABLE || "vital_care";
if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error("DB_TABLE inválida");
const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(backendDirectory, "..");
const localDataPath = path.join(backendDirectory, ".data", "vital_care.json");

app.use(cors());
app.use(express.json());

function hasDatabaseConfig() {
  return Boolean(
    (process.env.MYSQL_URL || process.env.DATABASE_URL) ||
    ((process.env.MYSQL_HOST || process.env.MYSQLHOST || process.env.DB_HOST) &&
      (process.env.MYSQL_USER || process.env.MYSQLUSER || process.env.DB_USER) &&
      (process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || process.env.DB_PASSWORD))
  );
}

async function readLocalUsers() {
  try {
    return JSON.parse(await fs.readFile(localDataPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writeLocalUsers(users) {
  await fs.mkdir(path.dirname(localDataPath), { recursive: true });
  await fs.writeFile(localDataPath, JSON.stringify(users, null, 2), "utf8");
}

function createToken(user) { return jwt.sign({ userId: user.id_usuario, name: user.nome, email: user.email }, secretKey, { expiresIn: "1h" }); }

app.get("/", (_req, res) => res.json({ status: "ok", service: "VitalCare API", storage: hasDatabaseConfig() ? "mysql" : "local" }));
app.get(["/api/health", "/health"], (_req, res) => res.json({ status: "ok", storage: hasDatabaseConfig() ? "mysql" : "local" }));
app.get(["/api/login", "/login"], (_req, res) => res.status(200).json({ message: "Use POST para fazer login." }));
app.get(["/api/cadastro", "/cadastro"], (_req, res) => res.status(200).json({ message: "Use POST para criar o cadastro." }));

function getPool() {
  if (!pool) {
    let host = process.env.MYSQL_HOST || process.env.MYSQLHOST || process.env.DB_HOST;
    let user = process.env.MYSQL_USER || process.env.MYSQLUSER || process.env.DB_USER;
    let password = process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
    let database = process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || process.env.DB_NAME || "alunos_gabrielyabreu";
    let port = process.env.MYSQL_PORT || process.env.MYSQLPORT || process.env.DB_PORT || 3306;

    const connectionUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
    if (connectionUrl) {
      const parsed = new URL(connectionUrl);
      host = parsed.hostname;
      user = decodeURIComponent(parsed.username);
      password = decodeURIComponent(parsed.password);
      database = parsed.pathname.replace(/^\//, "") || database;
      port = parsed.port || port;
    }

    const missing = [!host && "MYSQL_HOST/DB_HOST", !user && "MYSQL_USER/DB_USER", !password && "MYSQL_PASSWORD/DB_PASSWORD"].filter(Boolean);
    if (missing.length) throw new Error(`Variáveis MySQL ausentes: ${missing.join(", ")}`);

    pool = mysql.createPool({
      host,
      port: Number(port),
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000
    });
  }
  return pool;
}

app.post(["/cadastro", "/api/cadastro"], async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!name || !email || !password) return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
  if (password.length < 6) return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres." });

  try {
    if (!hasDatabaseConfig()) {
      if (process.env.VERCEL === "1") return res.status(503).json({ message: "Banco de dados não configurado no deploy. Defina MYSQL_URL na Vercel." });
      const users = await readLocalUsers();
      if (users.some((user) => user.email === email)) return res.status(409).json({ message: "Usuário já cadastrado." });
      users.push({ id_usuario: Date.now(), nome: name, email, senha: await bcrypt.hash(password, 10), data_cadastro: new Date().toISOString().slice(0, 10) });
      await writeLocalUsers(users);
      return res.status(201).json({ message: "Usuário criado com sucesso!" });
    }

    const db = getPool();
    const [existing] = await db.query(`SELECT id_usuario FROM ${tableName} WHERE email = ? LIMIT 1`, [email]);
    if (existing.length) return res.status(409).json({ message: "Usuário já cadastrado." });

    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO ${tableName} (nome, email, senha, data_cadastro) VALUES (?, ?, ?, CURDATE())`,
      [name, email, passwordHash]
    );
    return res.status(201).json({ message: "Usuário criado com sucesso!" });
  } catch (error) {
    console.error("Erro no cadastro:", error.message);
    return res.status(500).json({ message: "Não foi possível salvar o cadastro." });
  }
});

app.post(["/login", "/api/login"], async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ message: "E-mail e senha são obrigatórios." });

  try {
    if (!hasDatabaseConfig()) {
      if (process.env.VERCEL === "1") return res.status(503).json({ message: "Banco de dados não configurado no deploy. Defina MYSQL_URL na Vercel." });
      const users = await readLocalUsers();
      const user = users.find((item) => item.email === email);
      if (!user || !(await bcrypt.compare(password, user.senha))) return res.status(401).json({ message: "E-mail ou senha inválidos." });
      const token = createToken(user);
      return res.json({ message: "Login bem-sucedido!", token, user: { id: user.id_usuario, name: user.nome, email: user.email } });
    }

    const db = getPool();
    const [rows] = await db.query(
      `SELECT id_usuario, nome, email, senha FROM ${tableName} WHERE email = ? LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.senha || !(await bcrypt.compare(password, user.senha))) {
      return res.status(401).json({ message: "E-mail ou senha inválidos." });
    }

    const token = createToken(user);
    return res.json({ message: "Login bem-sucedido!", token, user: { id: user.id_usuario, name: user.nome, email: user.email } });
  } catch (error) {
    console.error("Erro no login:", error.message);
    return res.status(500).json({ message: "Não foi possível realizar o login." });
  }
});

function hasMailConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getMailer() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

app.post(["/orcamento", "/api/orcamento"], async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = String(req.body?.phone || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!name || !email) return res.status(400).json({ message: "Nome e e-mail são obrigatórios." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Digite um e-mail válido." });
  if (!hasMailConfig()) return res.status(503).json({ message: "Envio de e-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS." });

  const from = process.env.MAIL_FROM || `VitalCare <${process.env.SMTP_USER}>`;
  const teamEmail = process.env.MAIL_TO || process.env.SMTP_USER;
  const safeName = escapeHtml(name);

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;color:#1E2433;max-width:560px">
      <h2 style="color:#1F2A44">Olá, ${safeName}!</h2>
      <p>Recebemos sua solicitação de orçamento do <strong>VitalCare</strong>. Seguem as informações:</p>
      <h3 style="color:#1F2A44">VitalCare completo — R$ 399,99</h3>
      <p>Pagamento único + Software gratuito</p>
      <ul>
        <li>Alertas para medicamentos e compromissos</li>
        <li>Monitoramento de frequência cardíaca e saturação</li>
        <li>Alertas sonoros</li>
        <li>Tela touch screen de 14 polegadas</li>
      </ul>
      <p>Nossa equipe entrará em contato em breve para tirar suas dúvidas e combinar os próximos passos.</p>
      <p>Feito com ♥ para você,<br/>Equipe VitalCare</p>
    </div>`;

  const teamHtml = `
    <div style="font-family:Arial,sans-serif">
      <h2>Nova solicitação de orçamento</h2>
      <p><strong>Nome:</strong> ${safeName}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(phone || "—")}</p>
      <p><strong>Mensagem:</strong><br/>${escapeHtml(message || "—").replace(/\n/g, "<br/>")}</p>
    </div>`;

  try {
    const mailer = getMailer();
    await mailer.sendMail({ from, to: email, subject: "Seu orçamento VitalCare", html: customerHtml });
    await mailer.sendMail({ from, to: teamEmail, replyTo: email, subject: `Novo pedido de orçamento — ${name}`, html: teamHtml });
    return res.json({ message: "Pronto! Enviamos as informações para o seu e-mail." });
  } catch (error) {
    console.error("Erro ao enviar orçamento:", error.message);
    return res.status(500).json({ message: "Não foi possível enviar o e-mail agora. Tente novamente." });
  }
});

app.use(express.static(projectRoot));

export default app;

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Servidor ligado na porta ${port}`));
}

if (process.env.VERCEL === "1" && !hasDatabaseConfig()) {
  console.warn("Configure MYSQL_URL ou DATABASE_URL na Vercel para persistir os cadastros.");
}
