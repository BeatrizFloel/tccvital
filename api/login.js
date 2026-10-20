import app from "../backend/server.js";

export default function login(req, res) {
  // OPTIONS é a verificação de CORS do navegador (página aberta em outro endereço): o app responde
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Use POST para entrar." });
  }

  req.url = "/api/login";
  return app(req, res);
}
