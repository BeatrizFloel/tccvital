import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const users = [];
const secretKey = process.env.JWT_SECRET || "vitalcare-development-secret";

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.json({ status: "ok", service: "VitalCare API" }));
app.get(["/api/health", "/health"], (_req, res) => res.json({ status: "ok" }));

app.post(["/cadastro", "/api/cadastro"], async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
  if (password.length < 6) return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres." });
  if (users.some((user) => user.email === email)) return res.status(409).json({ message: "Usuário já cadastrado." });

  users.push({ id: Date.now(), email, passwordHash: await bcrypt.hash(password, 10) });
  return res.status(201).json({ message: "Usuário criado com sucesso!" });
});

app.post(["/login", "/api/login"], async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = users.find((item) => item.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "E-mail ou senha inválidos." });
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, secretKey, { expiresIn: "1h" });
  return res.json({ message: "Login bem-sucedido!", token });
});

export default app;

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Servidor ligado na porta ${port}`));
}