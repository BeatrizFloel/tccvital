import app from "../server.js";

export default function cadastro(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Use POST para cadastrar." });
  }

  req.url = "/api/cadastro";
  return app(req, res);
}
