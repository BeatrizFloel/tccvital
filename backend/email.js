/* ================= Envio de e-mails (Brevo) =================
   1º) API do Brevo por HTTPS (porta 443): funciona em qualquer rede e na Vercel.
       Precisa de BREVO_API_KEY (Brevo > SMTP e API > aba "Chaves de API", começa com xkeysib-).
   2º) SMTP do Brevo (SMTP_USER + SMTP_PASS): alternativa. Muitas redes de casa e de escola
       bloqueiam as portas de SMTP (587/2525/465), e aí o envio dá "timeout".
   O remetente (MAIL_FROM) precisa estar verificado em Brevo > Remetentes. */
import nodemailer from "nodemailer";

export class EmailError extends Error {
  constructor(message, publicMessage) {
    super(message);
    this.publicMessage = publicMessage;
  }
}

// "VitalCare <vitalcarecontatar@gmail.com>" -> { name, email }
export function parseAddress(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*)<([^>]+)>$/);
  return match ? { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() } : { name: "", email: text };
}

export function hasMailConfig() {
  return Boolean(process.env.BREVO_API_KEY || process.env.SMTP_PASS);
}

async function sendWithBrevoApi({ from, to, replyTo, subject, text, html }) {
  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY.trim(), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: from.name ? { name: from.name, email: from.email } : { email: from.email },
        to: [to.name ? { email: to.email, name: to.name } : { email: to.email }],
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        subject,
        htmlContent: html,
        textContent: text
      }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new EmailError(`Brevo API inacessível: ${error.message}`, "Não foi possível falar com o serviço de e-mail agora. Tente novamente.");
  }
  if (response.ok) return;

  const data = await response.json().catch(() => ({}));
  const detail = `${response.status} ${data.code || ""} ${data.message || ""}`.trim();
  if (response.status === 401) throw new EmailError(`Brevo API: ${detail}`, "Chave da API do Brevo inválida — confira BREVO_API_KEY.");
  if (/sender/i.test(data.message || "")) {
    throw new EmailError(`Brevo API: ${detail}`, `O remetente ${from.email} ainda não foi verificado no Brevo (Remetentes).`);
  }
  throw new EmailError(`Brevo API: ${detail}`, "O serviço de e-mail recusou o envio. Tente novamente em instantes.");
}

async function sendWithSmtp({ from, to, replyTo, subject, text, html }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port,
    secure: port === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s/g, "") }
  });
  try {
    await mailer.sendMail({
      from: from.name ? `"${from.name}" <${from.email}>` : from.email,
      to: to.name ? `"${to.name}" <${to.email}>` : to.email,
      replyTo,
      subject,
      text,
      html
    });
  } catch (error) {
    if (error.code === "EAUTH") throw new EmailError(`SMTP: ${error.message}`, "Login SMTP recusado — confira SMTP_USER e SMTP_PASS.");
    if (error.code === "ETIMEDOUT" || error.code === "ESOCKET" || error.code === "ECONNECTION") {
      throw new EmailError(`SMTP: ${error.message}`, "A rede bloqueou o envio por SMTP. Configure a BREVO_API_KEY para enviar pela API do Brevo.");
    }
    throw new EmailError(`SMTP: ${error.message}`, "Não foi possível enviar o e-mail agora. Tente novamente.");
  }
}

// Envia um e-mail. `to` pode ser "email" ou { email, name }.
export async function sendEmail({ to, replyTo, subject, text, html }) {
  const from = parseAddress(process.env.MAIL_FROM || process.env.SMTP_USER);
  const recipient = typeof to === "string" ? { email: to, name: "" } : to;
  const message = { from, to: recipient, replyTo, subject, text, html };
  if (process.env.BREVO_API_KEY) return sendWithBrevoApi(message);
  if (process.env.SMTP_PASS) return sendWithSmtp(message);
  throw new EmailError("Nenhum envio de e-mail configurado", "Envio de e-mail não configurado no site (BREVO_API_KEY).");
}
