/* ================= Respostas prontas das assistentes (sem IA externa) =================
   Usadas quando não há chave de IA configurada ou quando a IA falha (sem internet, limite
   do plano gratuito etc.). Assim a assistente do site e a Vital nunca ficam sem responder.
   - siteAnswer(texto)                        : dúvidas frequentes sobre o VitalCare
   - vitalAnswer(texto, dados, contexto, nome): rotina da pessoa (remédios, consultas, sensores...)
   Os valores vêm de /shared/planos.js e proposta.js (os mesmos do site). */
import { PLANOS, formatarPreco } from "../shared/planos.js";
import { PROPOSTA } from "./proposta.js";

// minúsculas, sem acentos e sem pontuação: "Já tomei a Losartana!" -> "ja tomei a losartana"
export function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const planosTexto = PLANOS.map((plano) => `${plano.nome}, ${formatarPreco(plano.preco)}`).join("; ");
const freteMin = Math.min(...Object.values(PROPOSTA.frete));
const freteMax = Math.max(...Object.values(PROPOSTA.frete));

const EMERGENCY = "Se for uma emergência, como dor no peito, falta de ar, desmaio ou queda com machucado, ligue agora para o SAMU, no 192. Em caso de vazamento de gás ou incêndio, saia de casa e ligue para os Bombeiros, no 193.";

/* ---------- Assistente do site: perguntas frequentes ---------- */
// Respostas gerais: só entram quando nenhuma resposta específica serviu
const GENERIC = true;
const SITE_FAQ = [
  [/\b(dor no peito|falta de ar|desmai|infarto|avc|socorro|emergencia|cai |caiu|queda)/,
    EMERGENCY],
  [/\b(preco|precos|valor|valores|custa|custo|plano|planos|quanto)\b/,
    `O VitalCare tem três planos, com pagamento único e equipamento, instalação e software incluídos: ${planosTexto}. O plano Completo é o mais recomendado, porque inclui também batimentos e oxigenação.`],
  [/\b(frete|entrega|prazo|chega|envio)\b/,
    `A entrega é feita ${PROPOSTA.entrega}. O frete depende da região, de ${formatarPreco(freteMin)} a ${formatarPreco(freteMax)}, e aparece certinho na proposta enviada por e-mail.`],
  [/\b(pagamento|pagar|pix|cartao|parcela|parcelas|parcelar|boleto)\b/,
    `O pagamento é ${PROPOSTA.pagamento}.`],
  [/\b(orcamento|proposta|comprar|compra|adquirir)\b/,
    "Para receber uma proposta, abra a página Produto, clique em \"Solicitar orçamento\" e preencha nome, e-mail e CEP. A proposta chega no seu e-mail em poucos segundos."],
  [/\b(gas|vazamento)\b/,
    "O VitalCare tem um sensor de gás. Se ele detectar gás, o painel mostra um alerta vermelho, toca um alarme e a Vital avisa em voz alta o que fazer: não acender luzes, abrir as janelas, sair de casa e ligar para os Bombeiros, no 193."],
  [/\b(batimento|batimentos|coracao|cardiac|oximetro|oxigen|saturacao|spo2|pressao)\b/,
    "O plano Completo mede a frequência cardíaca e a saturação de oxigênio: basta apoiar o dedo no sensor e as leituras aparecem no painel em poucos segundos. Se a média sair do normal, o painel e a Vital avisam. O VitalCare não mede pressão arterial e não faz diagnósticos."],
  [/\b(temperatura|calor|frio|termometro)\b/,
    "O sensor de temperatura acompanha a temperatura da casa. Se a média ficar acima de 26 graus ou abaixo de 18, o painel avisa e dá orientações, como beber água ou se agasalhar. O clima da cidade aparece separado, na tela principal."],
  [/\b(remedio|remedios|medicamento|medicamentos|comprimido|lembrete|lembretes|consulta|consultas)\b/,
    "No painel, você cadastra remédios, consultas e lembretes pelo botão \"+ Adicionar\". Na hora certa, a tela mostra o nome, a foto e a dose do remédio, toca um aviso e a Vital lembra em voz alta. As consultas são lembradas na véspera, uma hora antes e quinze minutos antes."],
  [/\b(vital|voz|falar|alexa|assistente de voz|microfone)\b/,
    "A Vital é a assistente de voz do painel. É só dizer \"Vital\" e fazer a pergunta, por exemplo: \"Vital, que remédio falta hoje?\". Ela responde no alto-falante e também lembra remédios, consultas e alertas dos sensores."],
  [/\b(login|entrar|cadastro|cadastrar|conta|senha|google|painel|dashboard)\b/,
    "Para usar o painel, crie uma conta na página Login, com e-mail e senha ou com a sua conta Google. Depois é só entrar e cadastrar remédios, consultas e lembretes. A família também pode acompanhar entrando na mesma conta."],
  [/\b(instala|instalacao|configura|configurar|como usa|como funciona|usar|funciona)\b/, GENERIC,
    "Funciona em quatro passos: primeiro cadastramos os dados, remédios e compromissos; depois conectamos os sensores; aí você acompanha tudo pelo painel; e recebe os avisos na hora certa. A instalação já está incluída em todos os planos."],
  [/\b(raspberry|tela|aparelho|equipamento|hardware|polegadas|touch)\b/,
    "O VitalCare é uma tela touch screen de 14 polegadas ligada a um Raspberry Pi 3, com alto-falante, microfone e os sensores de gás, temperatura e batimentos com oxímetro. Fica sobre uma mesa ou móvel da casa."],
  [/\b(equipe|quem fez|quem criou|criadores|alunos|tcc|unasp|escola)\b/,
    "O VitalCare é um Trabalho de Conclusão de Curso de estudantes do UNASP: Beatriz Floel, no design e no projeto; Davi Evangelista, no software; Lucas Nunes, no hardware e na eletrônica; e Giovanna Migliorini, na documentação e na gestão."],
  [/\b(contato|email|e mail|telefone|whatsapp|falar com)\b/,
    `Você pode falar com a equipe pelo e-mail ${PROPOSTA.email}.`],
  [/\b(jogo|game|alem da memoria)\b/,
    "No site tem o jogo \"Além da Memória\", uma aventura de investigação em 2D: você é um cuidador que usa o VitalCare para encontrar um idoso que saiu da área segura. Ele fica na página Jogo."],
  [/\b(garantia|assistencia tecnica|conserto|defeito)\b/,
    `Ainda não tenho as informações de garantia aqui. Escreva para a equipe no e-mail ${PROPOSTA.email} que eles explicam direitinho.`],
  [/\b(o que e|vitalcare|serve|para que)\b/, GENERIC,
    "O VitalCare é um sistema de monitoramento e assistência para idosos em casa. Ele reúne numa tela só data, horário e clima, lembretes de remédios e consultas, sensores de gás e temperatura, e medição de batimentos e oxigenação, com avisos na tela e por voz."]
];

const GREETING = /^(oi|ola|ei|e ai|bom dia|boa tarde|boa noite|tudo bem|como vai|opa)\b/;
const THANKS = /\b(obrigad|valeu|agradeco|brigad)/;

export function siteAnswer(text) {
  const q = normalize(text);
  const matches = SITE_FAQ.filter(([pattern]) => pattern.test(` ${q} `)).map((rule) => ({ generic: rule.length === 3, answer: rule.at(-1) }));
  const specific = matches.filter((match) => !match.generic);
  const found = (specific.length ? specific : matches).map((match) => match.answer);
  if (found.length) return found.slice(0, 2).join(" ");
  if (THANKS.test(q)) return "De nada! Se tiver outra dúvida sobre o VitalCare, é só perguntar.";
  if (GREETING.test(q)) return "Olá! Posso explicar como o VitalCare funciona, os planos e preços, os sensores, o painel e a assistente de voz. O que você quer saber?";
  return `Ainda não sei responder essa pergunta. Posso falar sobre os planos e preços, a entrega, os sensores, o painel e a assistente de voz. Se preferir, escreva para a equipe: ${PROPOSTA.email}.`;
}

/* ---------- Vital (painel): rotina da pessoa ---------- */
// "08:30" -> "8h30", "20:00" -> "20h"
function spokenTime(time) {
  const [h, m] = String(time || "").split(":").map(Number);
  if (Number.isNaN(h)) return String(time || "");
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function listPhrase(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

function minutesAgo(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function dayLabel(isoDate, today) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { diff, label: diff === 0 ? "hoje" : diff === 1 ? "amanhã" : `${weekday}, dia ${d}` };
}

function average(points, key, minutes) {
  const values = (points || []).filter((point) => point[key] !== null && point[key] !== undefined);
  const last = values.at(-1);
  if (!last || minutesAgo(last.at) > 10) return null;
  const since = new Date(last.at).getTime() - minutes * 60000;
  const recent = values.filter((point) => new Date(point.at).getTime() >= since).map((point) => Number(point[key]));
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

const fmt = (value, digits = 0) => Number(value).toFixed(digits).replace(".", ",");

function heartText(data) {
  const bpm = average(data.heart?.history, "bpm", 5);
  if (bpm === null) return "Não tenho uma leitura recente dos batimentos. Apoie o dedo no sensor por alguns segundos e me pergunte de novo.";
  const verdict = bpm < 60 ? "um pouco abaixo do normal, que em repouso é de 60 a 100" : bpm > 100 ? "acima do normal, que em repouso é de 60 a 100. Sente-se e descanse um pouco" : "dentro do normal";
  return `Seus batimentos estão em média ${fmt(bpm)} por minuto, ${verdict}.`;
}

function oxygenText(data) {
  const spo2 = average(data.heart?.history, "spo2", 5);
  if (spo2 === null) return "Não tenho uma leitura recente da oxigenação. Apoie o dedo no sensor por alguns segundos e me pergunte de novo.";
  const verdict = spo2 >= 95 ? "dentro do normal" : spo2 >= 90 ? "um pouco baixa. Sente-se, respire devagar e meça de novo" : "baixa. Se houver falta de ar, ligue agora para o SAMU, no 192";
  return `Sua oxigenação está em média ${fmt(spo2)} por cento, ${verdict}.`;
}

function houseTempText(data) {
  const celsius = average(data.temperature?.history, "celsius", 30);
  if (celsius === null) return "O sensor de temperatura da casa não mandou leitura recente.";
  const verdict = celsius < 18 ? "Está frio, vale se agasalhar" : celsius <= 26 ? "Está agradável" : celsius <= 30 ? "Está quente, beba água" : "Está muito quente, beba água e deixe o ar circular";
  return `A temperatura média da casa está em ${fmt(celsius, 1)} graus. ${verdict}.`;
}

function gasText(data) {
  const gas = data.gas;
  if (!gas || minutesAgo(gas.updatedAt) > 10) return "O sensor de gás não mandou leitura recente.";
  if (gas.level > 200) return "Atenção! O sensor detectou gás em nível perigoso. Não acenda luzes nem fósforos, abra as janelas, saia de casa e ligue para os Bombeiros, no 193.";
  if (gas.level > 50) return "O sensor detectou um pouco de gás. Verifique se o fogão está desligado e o botijão fechado, e abra as janelas.";
  return "O sensor de gás está normal, não detectei vazamento.";
}

function nowTime(context) {
  const match = String(context.agora || "").match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function medicinesText(data, context) {
  if (!data.medications.length) return "Você ainda não tem remédios cadastrados. Dá para cadastrar no painel, pelo botão \"+ Adicionar\".";
  const pending = data.medications.filter((med) => med.takenOn !== context.hoje);
  if (!pending.length) return "Você já tomou todos os remédios de hoje. Muito bem!";
  const items = pending.map((med) => `${med.name}${med.dose ? `, ${med.dose},` : ""} às ${spokenTime(med.time)}`);
  return `Hoje ainda ${pending.length === 1 ? "falta" : "faltam"} ${listPhrase(items)}.`;
}

function appointmentsText(data, context) {
  const now = nowTime(context);
  const upcoming = data.appointments
    .map((item) => ({ ...item, day: dayLabel(item.date, context.hoje) }))
    .filter((item) => item.day.diff > 0 || (item.day.diff === 0 && (!now || item.time >= now)))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (!upcoming.length) return "Não encontrei consultas marcadas. Dá para cadastrar no painel, pelo botão \"+ Adicionar\".";
  const [next] = upcoming;
  const more = upcoming.length > 1 ? ` Depois disso, você tem mais ${upcoming.length - 1} ${upcoming.length === 2 ? "consulta" : "consultas"} agendadas.` : "";
  return `Sua próxima consulta é ${next.title}${next.doctor ? ` com ${next.doctor}` : ""}, ${next.day.label} às ${spokenTime(next.time)}.${more}`;
}

function remindersText(data) {
  if (!data.reminders.length) return "Você não tem lembretes cadastrados.";
  return `Seus lembretes de todo dia são: ${listPhrase(data.reminders.map((item) => `${item.title} às ${spokenTime(item.time)}`))}.`;
}

// Acha o remédio citado na frase pelo nome (ou pela primeira palavra do nome)
function findMedicine(q, medications) {
  return medications.find((med) => {
    const name = normalize(med.name);
    const first = name.split(" ")[0];
    return name && (q.includes(name) || (first.length >= 4 && q.includes(first)));
  });
}

/* Devolve { reply, takeMedicationId? }: quando a pessoa diz que tomou um remédio, quem chama marca no painel */
export function vitalAnswer(text, data, context, userName) {
  const q = normalize(text);
  const name = userName && userName !== "a pessoa" ? userName : "";
  const has = (pattern) => pattern.test(` ${q} `);

  if (has(/\b(dor no peito|falta de ar|desmai|infarto|socorro|me ajuda|cai |caiu|queda|machuquei|passando mal)/)) {
    return { reply: "Ligue agora para o SAMU, no 192, ou peça para alguém ligar. Se puder, sente-se e fique em um lugar seguro até a ajuda chegar." };
  }

  if (has(/\b(tomei|ja tomei|tomado|tomada)\b/)) {
    const med = findMedicine(q, data.medications);
    if (med && med.takenOn === context.hoje) return { reply: `O remédio ${med.name} já estava marcado como tomado hoje.` };
    if (med) return { reply: `Pronto, marquei o remédio ${med.name} como tomado. Muito bem${name ? `, ${name}` : ""}!`, takeMedicationId: med.id };
    const pending = data.medications.filter((item) => item.takenOn !== context.hoje);
    if (!pending.length) return { reply: "Todos os remédios de hoje já estão marcados como tomados." };
    return { reply: `Qual remédio você tomou? Ainda ${pending.length === 1 ? "falta" : "faltam"} ${listPhrase(pending.map((item) => item.name))}.` };
  }

  if (has(/\b(remedio|remedios|medicamento|medicamentos|comprimido|comprimidos|pilula|tomar)\b/)) return { reply: medicinesText(data, context) };
  if (has(/\b(consulta|consultas|medico|medica|doutor|doutora|exame|exames|dentista)\b/)) return { reply: appointmentsText(data, context) };
  if (has(/\b(lembrete|lembretes|compromisso|compromissos|agenda)\b/)) return { reply: `${remindersText(data)} ${appointmentsText(data, context)}` };
  if (has(/\b(batimento|batimentos|coracao|pulso|frequencia|cardiac)/)) return { reply: heartText(data) };
  if (has(/\b(oxigen|saturacao|oximetro|spo2|respira)/)) return { reply: oxygenText(data) };
  if (has(/\b(gas|vazamento|cheiro)\b/)) return { reply: gasText(data) };
  if (has(/\b(clima|chover|chuva|chovendo|sol|la fora|previsao|tempo hoje|vento)\b/)) {
    return { reply: context.clima ? `O clima agora: ${context.clima}.` : "Não consegui ver o clima agora. Confira se o painel está com a localização ligada." };
  }
  if (has(/\b(temperatura|calor|frio|quente|esfriar|graus)\b/)) {
    return { reply: `${houseTempText(data)}${context.clima ? ` Lá fora: ${context.clima}.` : ""}` };
  }
  if (has(/\b(sensor|sensores|como estou|minha saude|meus sinais|sinais vitais)\b/)) {
    return { reply: `${heartText(data)} ${oxygenText(data)} ${houseTempText(data)} ${gasText(data)}` };
  }
  if (has(/\b(que horas|horas sao|hora e|horario agora)\b/)) {
    const time = nowTime(context);
    return { reply: time ? `Agora são ${spokenTime(time)}.` : "Não consegui ver a hora agora." };
  }
  if (has(/\b(que dia|data de hoje|hoje e|dia e hoje|dia da semana)\b/)) {
    return { reply: `Hoje é ${String(context.agora || "").split(",").slice(0, 2).join(",") || "um ótimo dia"}.` };
  }
  if (has(/\b(obrigad|valeu|brigad)/)) return { reply: `De nada${name ? `, ${name}` : ""}! Estou sempre por aqui.` };
  if (has(/\b(quem e voce|seu nome|o que voce faz|o que voce sabe|me ajuda com o que)\b/)) {
    return { reply: "Eu sou a Vital, a assistente do seu painel. Posso falar dos seus remédios, consultas, lembretes, clima, batimentos, oxigenação, temperatura da casa e gás. É só me chamar." };
  }
  if (GREETING.test(q)) {
    return { reply: `Oi${name ? `, ${name}` : ""}! Estou aqui. Quer saber dos seus remédios, das consultas ou de como está a casa?` };
  }

  // Perguntas sobre o produto (preço, como funciona...)
  const faq = SITE_FAQ.find(([pattern]) => pattern.test(` ${q} `));
  if (faq) return { reply: faq.at(-1) };

  return { reply: "Desculpe, ainda não sei responder isso. Posso falar dos seus remédios, consultas, lembretes, clima e sensores. Por exemplo: Vital, que remédio falta hoje?" };
}
