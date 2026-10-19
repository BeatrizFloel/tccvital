import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import { registerDashboardRoutes } from "./dashboard.js";
import { PROPOSTA, FUNCOES, consultarCep, montarProposta, montarAvisoEquipe } from "./proposta.js";
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

function createToken(user) { return jwt.sign({ userId: user.id_usuario, name: user.nome, email: user.email }, secretKey, { expiresIn: "7d" }); }

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
      const newUser = { id_usuario: Date.now(), nome: name, email, senha: await bcrypt.hash(password, 10), data_cadastro: new Date().toISOString().slice(0, 10) };
      users.push(newUser);
      await writeLocalUsers(users);
      return res.status(201).json({ message: "Usuário criado com sucesso!", token: createToken(newUser), user: { id: newUser.id_usuario, name, email } });
    }

    const db = getPool();
    const [existing] = await db.query(`SELECT id_usuario FROM ${tableName} WHERE email = ? LIMIT 1`, [email]);
    if (existing.length) return res.status(409).json({ message: "Usuário já cadastrado." });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO ${tableName} (nome, email, senha, data_cadastro) VALUES (?, ?, ?, CURDATE())`,
      [name, email, passwordHash]
    );
    const newUser = { id_usuario: result.insertId, nome: name, email };
    return res.status(201).json({ message: "Usuário criado com sucesso!", token: createToken(newUser), user: { id: newUser.id_usuario, name, email } });
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

registerDashboardRoutes(app, { hasDatabaseConfig, getPool, secretKey, tableName, readLocalUsers, backendDirectory });

/* ---------- Orçamento: proposta automática por e-mail (modelo em proposta.js) ---------- */
const MAIL_USER = process.env.SMTP_USER || PROPOSTA.email;

function hasMailConfig() {
  return Boolean(process.env.SMTP_PASS);
}

function getMailer() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: MAIL_USER, pass: String(process.env.SMTP_PASS).replace(/\s/g, "") }
  });
}

app.post(["/orcamento", "/api/orcamento"], async (req, res) => {
  const nome = String(req.body?.name || "").trim().slice(0, 120);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const telefone = String(req.body?.phone || "").trim().slice(0, 40);
  const cep = String(req.body?.cep || "").replace(/\D/g, "");
  const mensagem = String(req.body?.message || "").trim().slice(0, 2000);
  const funcoes = [].concat(req.body?.funcoes || []).filter((chave) => FUNCOES[chave]);
  const plano = String(req.body?.plano || "");

  if (!nome || !email) return res.status(400).json({ message: "Nome e e-mail são obrigatórios." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Digite um e-mail válido." });
  if (cep.length !== 8) return res.status(400).json({ message: "Digite um CEP válido (8 números)." });
  if (!hasMailConfig()) return res.status(503).json({ message: "Envio de e-mail não configurado. Defina SMTP_USER e SMTP_PASS (chave SMTP do Brevo) no .env." });

  const local = await consultarCep(cep);
  if (!local) return res.status(400).json({ message: "CEP não encontrado. Confira os números." });

  const from = process.env.MAIL_FROM || `VitalCare <${MAIL_USER}>`;
  const teamEmail = process.env.MAIL_TO || MAIL_USER;
  const proposta = montarProposta({ nome, local });
  const aviso = montarAvisoEquipe({ nome, email, telefone, local, plano, funcoes, mensagem });

  try {
    const mailer = getMailer();
    await mailer.sendMail({ from, to: email, replyTo: teamEmail, subject: proposta.assunto, text: proposta.texto, html: proposta.html });
    await mailer.sendMail({ from, to: teamEmail, replyTo: email, subject: aviso.assunto, text: aviso.texto, html: aviso.html });
    return res.json({ message: "Pronto! Enviamos a proposta para o seu e-mail." });
  } catch (error) {
    console.error("Erro ao enviar orçamento:", error.message);
    const motivo = error.code === "EAUTH" ? " (login SMTP recusado — confira SMTP_USER e SMTP_PASS no .env)" : "";
    return res.status(500).json({ message: `Não foi possível enviar o e-mail agora. Tente novamente.${motivo}` });
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
