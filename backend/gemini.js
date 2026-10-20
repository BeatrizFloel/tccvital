/* ================= Google Gemini (plano gratuito) =================
   Chave grátis em aistudio.google.com > "Get API key". Vai no .env como GEMINI_API_KEY.
   O plano gratuito tem limite de pedidos por dia; quando acaba, tenta o próximo modelo da lista
   e, se todos falharem, a assistente usa as respostas prontas (assistente-local.js). */

const API = "https://generativelanguage.googleapis.com/v1beta/models";
// "-latest" sempre aponta para a versão mais nova; o Flash-Lite tem o maior limite gratuito
const DEFAULT_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const TIMEOUT_MS = 20000;

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function models() {
  return [...new Set([process.env.GEMINI_MODEL, ...DEFAULT_MODELS].filter(Boolean))];
}

// { role: "user" | "assistant", content: "texto" } -> formato do Gemini
export function toGeminiContents(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: Array.isArray(message.parts) ? message.parts : [{ text: message.content }]
  }));
}

async function callModel(model, body) {
  const response = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GeminiError(data.error?.message || `Gemini respondeu ${response.status}`, response.status);
  return data;
}

/* Gera uma resposta. functions: [{ name, description, parameters }] (opcional).
   Devolve { text, calls: [{ name, args, id }], content } — content é a fala do modelo, para reenviar
   no histórico junto com o resultado das funções (o Gemini exige isso). */
export async function geminiGenerate({ system, contents, functions }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.6 }
  };
  if (functions?.length) body.tools = [{ functionDeclarations: functions }];

  let lastError;
  for (const model of models()) {
    try {
      const data = await callModel(model, body);
      const candidate = data.candidates?.[0];
      if (!candidate?.content) {
        return { text: "", calls: [], content: null, blocked: Boolean(data.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") };
      }
      const parts = candidate.content.parts || [];
      return {
        text: parts.filter((part) => part.text && !part.thought).map((part) => part.text).join("").trim(),
        calls: parts.filter((part) => part.functionCall).map((part) => part.functionCall),
        content: candidate.content,
        blocked: candidate.finishReason === "SAFETY"
      };
    } catch (error) {
      lastError = error;
      // modelo inexistente (404), limite gratuito esgotado (429) ou modelo sobrecarregado (500/503): tenta o próximo
      if (!(error instanceof GeminiError) || ![404, 429, 500, 503].includes(error.status)) throw error;
    }
  }
  throw lastError;
}
