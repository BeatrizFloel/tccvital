import app from "../server.js";

export default function login(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Use POST para entrar." });
  }

  req.url = "/api/login";
  return app(req, res);
}
