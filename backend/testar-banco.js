/* Testa a conexão com o MySQL configurado no .env e cria as tabelas do database.sql.
   Uso (na pasta do projeto):  npm run banco */
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function configuracao() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "")
    };
  }
  return {
    host: process.env.MYSQL_HOST || process.env.DB_HOST,
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || "alunos_gabrielyabreu"
  };
}

const config = configuracao();
const faltando = ["host", "user", "password"].filter((campo) => !config[campo]);
if (faltando.length) {
  console.error(`Faltam dados no .env: ${faltando.join(", ")}. Preencha DB_HOST, DB_USER e DB_PASSWORD.`);
  process.exit(1);
}

console.log(`Conectando em ${config.user}@${config.host}:${config.port}/${config.database} ...`);
let conexao;
try {
  conexao = await mysql.createConnection({ ...config, connectTimeout: 10000 });
} catch (erro) {
  const dicas = {
    ETIMEDOUT: "O servidor não respondeu. Ele pode só aceitar conexões de dentro da rede da escola.",
    ENOTFOUND: "Endereço (DB_HOST) não encontrado. Confira se foi digitado certo.",
    ECONNREFUSED: "O servidor recusou a conexão. Confira o DB_HOST e a porta (DB_PORT).",
    ER_ACCESS_DENIED_ERROR: "Usuário ou senha incorretos.",
    ER_BAD_DB_ERROR: "O banco (DB_NAME) não existe ou o usuário não tem acesso a ele."
  };
  console.error(`FALHOU (${erro.code}): ${erro.message}`);
  if (dicas[erro.code]) console.error(`Dica: ${dicas[erro.code]}`);
  process.exit(1);
}

console.log("Conectado! Criando as tabelas do database.sql (as que já existem não são alteradas)...");
const sql = await fs.readFile(path.join(raiz, "database.sql"), "utf8");
const comandos = sql.split(";").map((trecho) => trecho.replace(/--.*$/gm, "").trim()).filter(Boolean);
for (const comando of comandos) await conexao.query(comando);

const [tabelas] = await conexao.query("SHOW TABLES");
console.log("Tabelas no banco:");
for (const linha of tabelas) console.log("  -", Object.values(linha)[0]);
await conexao.end();
console.log("Tudo certo: o site vai salvar os dados neste banco.");
