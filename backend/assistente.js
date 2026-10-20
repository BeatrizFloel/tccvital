/* ================= Assistentes VitalCare (IA) =================
   - /api/assistente         : assistente do site (página Equipe), responde dúvidas por texto.
   - /api/assistente/painel  : "Vital", assistente de voz do painel. Conhece os remédios, consultas,
                               lembretes e sensores da pessoa logada e pode marcar remédio como tomado.
   Usa a Claude API: precisa de ANTHROPIC_API_KEY no .env (crie em console.anthropic.com).
   Planos/preços vêm de /shared/planos.js e frete/pagamento de proposta.js (mesmos valores do site). */
import Anthropic from "@anthropic-ai/sdk";
import { PLANOS, formatarPreco } from "../shared/planos.js";
import { PROPOSTA } from "./proposta.js";

const MODEL = "claude-opus-5-5";
const MAX_HISTORY = 20;          // últimas mensagens enviadas para a IA
const MAX_MESSAGE_CHARS = 1500;  // tamanho máximo de cada mensagem do visitante
const MAX_TOOL_ROUNDS = 3;       // quantas vezes a Vital pode usar ferramentas numa resposta
const RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 }; // por visitante/usuário

const planos = PLANOS.map((plano) =>
  `- ${plano.nome}: ${formatarPreco(plano.preco)} (pagamento único). ${plano.resumo}${plano.recomendado ? " É o plano mais recomendado." : ""}`
).join("\n");
const frete = Object.entries(PROPOSTA.frete).map(([regiao, valor]) => `${regiao}: ${formatarPreco(valor)}`).join("; ");

// Conhecimento comum às duas assistentes
const PRODUCT_FACTS = `O que é o VitalCare
- Um aparelho com tela touch screen de 14 polegadas, montado sobre um Raspberry Pi 3, que fica sobre uma mesa ou móvel da casa. A carcaça é compacta, resistente e pensada para facilitar o acesso do idoso.
- Reúne em uma única tela: data, horário e clima da cidade; lembretes de medicamentos (com foto do remédio e aviso sonoro e visual na hora certa); alertas de consultas, exames e compromissos; sensor de vazamento de gás; sensor de temperatura do ambiente; e sensor de frequência cardíaca e saturação de oxigênio (oxímetro).
- Tem um painel online onde o idoso, a família ou o cuidador acompanham tudo: remédios do dia, consultas, lembretes, clima, gás, batimentos, oxigenação e temperatura da casa. As informações ficam salvas em um banco de dados online.
- No painel existe a Vital, uma assistente de voz: a pessoa diz "Vital" e faz a pergunta, e a resposta sai no alto-falante. Ela também avisa em voz alta a hora dos remédios, as consultas e os lembretes.
- Envia alertas para familiares e cuidadores quando algum valor sai do padrão esperado.

Como usar
1. Configuração inicial: cadastrar os dados do usuário, horários de medicamentos, compromissos e preferências de monitoramento.
2. Conexão dos dispositivos: conectar os sensores de saúde e do ambiente.
3. Acompanhamento pelo painel: ver data, horário, temperatura, lembretes e as leituras dos sensores.
4. Recebimento de alertas: avisos de medicamentos, horários programados e alterações no ambiente.
Para usar o painel, a pessoa cria uma conta na página Login (com e-mail e senha ou com a conta Google). No painel, os botões "+ Adicionar" cadastram medicamentos, consultas e lembretes. Para medir batimentos e oxigenação, basta apoiar o dedo no sensor; as leituras aparecem no painel em poucos segundos.

Planos (todos incluem o equipamento, a instalação e o software gratuito)
${planos}
Pagamento: ${PROPOSTA.pagamento}. Entrega: ${PROPOSTA.entrega}. Frete por região: ${frete}.
Para receber uma proposta, a pessoa usa o botão "Solicitar orçamento" na página Produto e recebe a proposta por e-mail.

Equipe (estudantes do UNASP)
- Beatriz Floel: design e prototipação no Figma e projeto.
- Davi Evangelista: desenvolvimento do software.
- Lucas Nunes: integração de hardware e eletrônica.
- Giovanna Migliorini: documentação e gestão do projeto.
Contato da equipe: ${PROPOSTA.email}.

O site também tem o jogo "Além da Memória" (aventura e investigação em 2D, feito no GDevelop), em que o jogador é um cuidador que usa o VitalCare para encontrar um idoso que saiu da área segura.`;

const SAFETY_RULES = `Regras importantes
- O VitalCare é uma ferramenta de apoio. Ele não substitui avaliação, diagnóstico nem acompanhamento por profissionais de saúde. Você não faz diagnósticos, não interpreta exames individualmente e não indica, troca ou ajusta remédios ou doses. Para dúvidas de saúde da pessoa, oriente procurar o médico ou a equipe de saúde.
- Você pode explicar informações gerais e conhecidas: por exemplo, que em repouso a frequência cardíaca de um adulto costuma ficar entre 60 e 100 batimentos por minuto e que a saturação de oxigênio costuma ficar em 95% ou mais, sempre lembrando que cada caso deve ser avaliado por um profissional.
- Emergência (dor no peito, falta de ar, desmaio, confusão súbita, queda com machucado, oxigenação muito baixa): diga para ligar imediatamente para o SAMU (192). Em caso de incêndio ou vazamento de gás: não acender luzes nem fósforos, não ligar ou desligar aparelhos elétricos, abrir portas e janelas, fechar o registro do gás se for seguro, sair do local e ligar para os Bombeiros (193).
- Use só as informações que você recebeu. Se não souber algo (por exemplo, garantia ou detalhes técnicos não descritos), diga com honestidade que não tem essa informação e indique o contato da equipe. Nunca invente preços, prazos, promoções, funcionalidades ou dados da pessoa.
- Não peça dados pessoais sensíveis (CPF, senhas, cartão).`;

const SITE_PROMPT = `Você é a Assistente VitalCare, que atende no site do VitalCare: um sistema de monitoramento e assistência domiciliar para idosos, criado como Trabalho de Conclusão de Curso por estudantes do UNASP. Quem conversa com você costuma ser um idoso, um familiar ou um cuidador. Responda sempre em português do Brasil, com frases curtas, linguagem simples e acolhedora, sem termos técnicos desnecessários.

Formato: texto simples, sem Markdown (sem **, #, tabelas ou links em formato Markdown). Quando ajudar, use uma lista curta com linhas começando por "- ". Em geral, responda em até 5 frases; aprofunde só se a pessoa pedir.

${PRODUCT_FACTS}

${SAFETY_RULES}
- Você pode conversar sobre assuntos do dia a dia de forma gentil, mas traga a conversa de volta ao cuidado e ao VitalCare quando fizer sentido.`;

const VOICE_PROMPT = `Você é a Vital, a assistente de voz do painel VitalCare. Você fala com a pessoa idosa dona do painel (ou com quem cuida dela) por um alto-falante: tudo o que você escreve é lido em voz alta por uma voz sintetizada.

Como responder
- Português do Brasil, tom carinhoso, calmo e respeitoso. Trate a pessoa pelo primeiro nome de vez em quando.
- Respostas curtas para serem ouvidas: em geral 1 a 3 frases. Nada de listas, tópicos, emojis, Markdown, parênteses longos ou siglas difíceis. Quando houver vários itens, fale em uma frase corrida ("Hoje ainda faltam a Losartana às 20h e a Metformina às 22h.").
- Escreva horários como "8h30" e datas por extenso ("amanhã", "sexta-feira, dia 24"), porque soa natural na fala.
- A transcrição da fala pode ter pequenos erros; interprete com bom senso. Se a pergunta ficar ambígua, peça para a pessoa repetir de forma breve.

Dados da pessoa
- Cada mensagem da pessoa vem acompanhada de um bloco <painel> com a data e a hora atuais, os remédios com o horário e se já foram tomados hoje, as consultas, os lembretes, o clima e as últimas leituras dos sensores. Use somente esses dados para falar da rotina dela; se algo não estiver no painel, diga que não encontrou e sugira cadastrar pelo botão "+ Adicionar".
- Leituras de sensor antigas (com mais de 10 minutos) podem estar desatualizadas: avise isso se for falar delas.
- Quando a pessoa disser que já tomou um remédio, use a ferramenta marcar_remedio_tomado com o id do remédio certo e depois confirme em uma frase. Se não estiver claro qual remédio foi, pergunte antes. Nunca marque um remédio que a pessoa não disse que tomou.

Você também pode conversar sobre o dia a dia, fazer companhia e responder dúvidas sobre o VitalCare.

${PRODUCT_FACTS}

${SAFETY_RULES}`;

const VOICE_TOOLS = [
  {
    name: "marcar_remedio_tomado",
    description: "Marca no painel que a pessoa já tomou hoje um dos remédios cadastrados. Use só quando a pessoa disser claramente que tomou aquele remédio.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        medicamento_id: { type: "integer", description: "O id do remédio, como aparece no bloco <painel>." }
      },
      required: ["medicamento_id"],
      additionalProperties: false
    }
  }
];

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// Só para testes automáticos: troca o cliente da API por um simulado
export function setAssistantClientForTests(fake) {
  client = fake;
}

// Limite simples (memória do servidor) para evitar abuso
const hits = new Map();
function allowed(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((time) => now - time < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return true;
}

// Aceita só { role: "user" | "assistant", content: "texto" }, começando e terminando na pessoa
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const messages = raw.slice(-MAX_HISTORY)
    .filter((item) => (item?.role === "user" || item?.role === "assistant") && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter((item) => item.content);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages.at(-1).role !== "user") return null;
  return messages;
}

function textOf(response) {
  return response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}

function createMessage(system, messages, extra = {}) {
  return getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Se o modelo recusar por segurança, a própria API tenta de novo em outro modelo
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    ...extra
  });
}

function sendApiError(res, error) {
  console.error("Erro na assistente:", error.status || "", error.message);
  if (error instanceof Anthropic.AuthenticationError) {
    return res.status(503).json({ message: "A chave da assistente (ANTHROPIC_API_KEY) é inválida." });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ message: "A assistente está muito ocupada agora. Tente de novo em instantes." });
  }
  return res.status(502).json({ message: "A assistente não conseguiu responder agora. Tente novamente em instantes." });
}

function notConfigured(res) {
  return res.status(503).json({ message: "A assistente ainda não foi configurada no site (falta a ANTHROPIC_API_KEY)." });
}

/* ---------- Bloco <painel> com os dados da pessoa ---------- */
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function describeDay(isoDate, today) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const label = diff === 0 ? "hoje" : diff === 1 ? "amanhã" : `${weekday}, dia ${d}/${String(m).padStart(2, "0")}`;
  return { diff, label };
}

function minutesAgo(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function panelBlock(data, context, userName) {
  const today = context.hoje;
  const lines = [`Pessoa: ${userName}`, `Agora: ${context.agora}`];

  lines.push("Remédios (id | nome | dose | horário | situação hoje):");
  lines.push(...(data.medications.length
    ? data.medications.map((med) => `- ${med.id} | ${med.name} | ${med.dose || "dose não informada"} | ${med.time} | ${med.takenOn === today ? "já tomado hoje" : "ainda não tomado hoje"}`)
    : ["- nenhum remédio cadastrado"]));

  const upcoming = data.appointments
    .map((item) => ({ ...item, day: describeDay(item.date, today) }))
    .filter((item) => item.day.diff >= 0 && item.day.diff <= 60);
  lines.push("Próximas consultas:");
  lines.push(...(upcoming.length
    ? upcoming.map((item) => `- ${item.title}${item.doctor ? ` com ${item.doctor}` : ""}: ${item.day.label} às ${item.time}`)
    : ["- nenhuma consulta agendada"]));

  lines.push("Lembretes diários:");
  lines.push(...(data.reminders.length
    ? data.reminders.map((item) => `- ${item.title}${item.detail ? ` (${item.detail})` : ""} às ${item.time}`)
    : ["- nenhum lembrete"]));

  lines.push(`Clima: ${context.clima || "não disponível"}`);

  const heartPoint = (key) => [...(data.heart?.history || [])].reverse().find((point) => point[key] !== null && point[key] !== undefined);
  const bpm = heartPoint("bpm");
  const spo2 = heartPoint("spo2");
  lines.push("Sensores (última leitura):");
  lines.push(bpm ? `- Batimentos: ${bpm.bpm} bpm, há ${minutesAgo(bpm.at)} min` : "- Batimentos: sem leitura");
  lines.push(spo2 ? `- Oxigenação (SpO2): ${spo2.spo2}%, há ${minutesAgo(spo2.at)} min` : "- Oxigenação: sem leitura");
  lines.push(data.temperature
    ? `- Temperatura da casa: ${data.temperature.celsius} °C${data.temperature.humidity !== null && data.temperature.humidity !== undefined ? `, umidade ${data.temperature.humidity}%` : ""}, há ${minutesAgo(data.temperature.updatedAt)} min`
    : "- Temperatura da casa: sem leitura");
  // Mesmas janelas do painel: os alertas da tela usam a média recente, não uma leitura isolada
  const average = (points, key, minutes) => {
    const values = points.filter((point) => point[key] !== null && point[key] !== undefined);
    const last = values.at(-1);
    if (!last || minutesAgo(last.at) > 10) return null;
    const since = new Date(last.at).getTime() - minutes * 60000;
    const recent = values.filter((point) => new Date(point.at).getTime() >= since).map((point) => Number(point[key]));
    return (recent.reduce((sum, value) => sum + value, 0) / recent.length).toFixed(1).replace(".", ",");
  };
  const averages = [
    ["Batimentos, média dos últimos 5 min", average(data.heart?.history || [], "bpm", 5), "bpm (normal em repouso: 60 a 100)"],
    ["Oxigenação, média dos últimos 5 min", average(data.heart?.history || [], "spo2", 5), "% (normal: 95% ou mais)"],
    ["Temperatura da casa, média dos últimos 30 min", average(data.temperature?.history || [], "celsius", 30), "°C (agradável: 18 a 26 °C)"]
  ].filter(([, value]) => value !== null);
  if (averages.length) lines.push(...averages.map(([label, value, unit]) => `- ${label}: ${value} ${unit}`));
  lines.push(data.gas
    ? `- Gás: ${data.gas.level} ppm (até 50 normal, até 200 atenção, acima perigo), há ${minutesAgo(data.gas.updatedAt)} min`
    : "- Gás: sem leitura");

  return `<painel>\n${lines.join("\n")}\n</painel>`;
}

export function registerAssistantRoutes(app, dashboard) {
  /* ---------- Assistente do site ---------- */
  app.post(["/assistente", "/api/assistente"], async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return notConfigured(res);
    const messages = cleanHistory(req.body?.messages);
    if (!messages) return res.status(400).json({ message: "Envie sua pergunta." });

    const visitor = String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();
    if (!allowed(`site:${visitor}`)) {
      return res.status(429).json({ message: "Você enviou muitas perguntas seguidas. Aguarde alguns minutos e tente de novo." });
    }

    try {
      const response = await createMessage(SITE_PROMPT, messages);
      if (response.stop_reason === "refusal") {
        return res.json({ reply: "Desculpe, não posso ajudar com esse assunto. Posso tirar outras dúvidas sobre o VitalCare?" });
      }
      return res.json({ reply: textOf(response) || "Desculpe, não consegui responder agora. Pode perguntar de outro jeito?" });
    } catch (error) {
      return sendApiError(res, error);
    }
  });

  /* ---------- Vital: assistente de voz do painel (pessoa logada) ---------- */
  app.post(["/assistente/painel", "/api/assistente/painel"], dashboard.auth, async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return notConfigured(res);
    const messages = cleanHistory(req.body?.messages);
    if (!messages) return res.status(400).json({ message: "Não entendi a pergunta." });

    // A data e a hora vêm do aparelho da pessoa (o servidor pode estar em outro fuso horário)
    const context = {
      hoje: String(req.body?.contexto?.hoje || ""),
      agora: String(req.body?.contexto?.agora || "").slice(0, 120),
      clima: String(req.body?.contexto?.clima || "").slice(0, 200)
    };
    if (!dashboard.isValidDate(context.hoje)) return res.status(400).json({ message: "Data do aparelho inválida." });
    if (!allowed(`painel:${req.userId}`)) {
      return res.status(429).json({ message: "Muitas perguntas seguidas. Espere um pouquinho e tente de novo." });
    }

    try {
      const data = await dashboard.loadDashboardData(req.userId);
      const userName = String(req.body?.nome || "").trim().slice(0, 60) || "a pessoa";
      const last = messages.pop();
      messages.push({ role: "user", content: [{ type: "text", text: panelBlock(data, context, userName) }, { type: "text", text: last.content }] });

      let changed = false;
      let response;
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        response = await createMessage(VOICE_PROMPT, messages, { tools: VOICE_TOOLS });
        if (response.stop_reason !== "tool_use") break;

        // Executa as ferramentas pedidas e devolve todos os resultados numa única mensagem
        messages.push({ role: "assistant", content: response.content });
        const results = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const id = Number(block.input?.medicamento_id);
          const med = data.medications.find((item) => item.id === id);
          if (block.name !== "marcar_remedio_tomado" || !med) {
            results.push({ type: "tool_result", tool_use_id: block.id, content: "Remédio não encontrado no painel.", is_error: true });
            continue;
          }
          await dashboard.setMedicationTaken(req.userId, id, context.hoje);
          med.takenOn = context.hoje;
          changed = true;
          results.push({ type: "tool_result", tool_use_id: block.id, content: `Pronto: ${med.name} marcado como tomado hoje.` });
        }
        messages.push({ role: "user", content: results });
      }

      if (response.stop_reason === "refusal") {
        return res.json({ reply: "Desculpe, não posso ajudar com isso. Quer saber dos seus remédios ou das suas consultas?", changed });
      }
      return res.json({ reply: textOf(response) || "Desculpe, não entendi. Pode repetir?", changed });
    } catch (error) {
      return sendApiError(res, error);
    }
  });
}
