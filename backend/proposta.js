/* ================= Proposta VitalCare (e-mail automático do orçamento) =================
   EDITE AQUI os valores da proposta. Tudo que está entre [colchetes] no modelo
   é preenchido automaticamente com estes dados e com o que o cliente digitou. */
import { PLANOS } from "../shared/planos.js";

// Os PREÇOS dos planos ficam em /shared/planos.js (mesmo arquivo usado pelo site)
export const PROPOSTA = {

  // Frete por região, descoberta pelo CEP do cliente (R$) — CONFIRMAR os valores
  frete: {
    SP: 20,
    Sudeste: 30,
    Sul: 35,
    "Centro-Oeste": 40,
    Nordeste: 50,
    Norte: 60
  },

  pagamento: "à vista no Pix ou em até 3 parcelas sem juros no cartão",
  entrega: "em até 7 dias úteis após a confirmação",
  validadeDias: 15,                 // a proposta vale por X dias a partir do envio

  remetenteNome: "",                 // [Seu nome] — ex.: "Beatriz Floel". Vazio = assina só "Equipe VitalCare"
  telefone: "",                      // [telefone/WhatsApp] — ex.: "(11) 99999-9999". Vazio = só e-mail
  email: "vitalcarecontatar@gmail.com"
};

const REGIOES = {
  Norte: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  Nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MT", "MS"],
  Sudeste: ["ES", "MG", "RJ", "SP"],
  Sul: ["PR", "RS", "SC"]
};

export const FUNCOES = {
  medicamentos: "Lembretes de medicamentos",
  consultas: "Alertas de consultas e compromissos",
  clima: "Data, horário e clima na tela",
  gas: "Sensor de vazamento de gás",
  temperatura: "Sensor de temperatura ambiente",
  cardiaco: "Frequência cardíaca e saturação de oxigênio"
};

const brl = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// Consulta o CEP no ViaCEP (gratuito) para saber cidade/UF
export async function consultarCep(cep) {
  const digitos = String(cep || "").replace(/\D/g, "");
  if (digitos.length !== 8) return null;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: AbortSignal.timeout(6000) });
    const dados = await resposta.json();
    if (dados.erro) return null;
    return { cep: `${digitos.slice(0, 5)}-${digitos.slice(5)}`, cidade: dados.localidade, uf: dados.uf };
  } catch {
    return { cep: `${digitos.slice(0, 5)}-${digitos.slice(5)}`, cidade: "", uf: "" };
  }
}

function calcularFrete(local) {
  if (!local?.uf) return null;
  if (local.uf === "SP") return PROPOSTA.frete.SP;
  const regiao = Object.keys(REGIOES).find((nome) => REGIOES[nome].includes(local.uf));
  return regiao ? PROPOSTA.frete[regiao] : null;
}

// Monta o e-mail do cliente (assunto, texto e HTML) com as variáveis preenchidas
export function montarProposta({ nome, local }) {
  const validade = new Date(Date.now() + PROPOSTA.validadeDias * 86400000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const frete = calcularFrete(local);
  const destino = local?.cidade ? `${local.cidade}/${local.uf} (CEP ${local.cep})` : `CEP ${local?.cep || "informado"}`;
  const freteTexto = frete === null ? "a confirmar pela nossa equipe" : brl(frete);
  const contato = PROPOSTA.telefone ? `pelo telefone/WhatsApp ${PROPOSTA.telefone}` : `pelo e-mail ${PROPOSTA.email}`;
  const assinatura = [PROPOSTA.telefone, PROPOSTA.email].filter(Boolean).join(" | ");
  const assinaturaLinhas = [PROPOSTA.remetenteNome, "Equipe VitalCare", assinatura].filter(Boolean);

  const assunto = `Proposta VitalCare para ${nome} – segurança e tranquilidade em casa`;

  const paragrafos = [
    `Prezado(a) ${nome},`,
    "Agradecemos o seu interesse no VitalCare. É com satisfação que encaminhamos a proposta solicitada.",
    "Sabemos que, quando um familiar idoso vive em casa, a preocupação com sua segurança e bem-estar está sempre presente. Foi pensando nisso que desenvolvemos o VitalCare: um sistema de monitoramento e assistência domiciliar que reúne, em um único equipamento, os cuidados mais importantes do dia a dia.",
    "Por meio de uma tela touchscreen de fácil leitura, o VitalCare informa, no momento exato, qual medicamento deve ser tomado, exibindo seu nome e sua imagem, com a possibilidade de um áudio personalizado. Também lembra consultas e compromissos e, conforme o pacote escolhido, emite alertas diante de um possível vazamento de gás, acompanha a temperatura do ambiente e orienta a medição de frequência cardíaca e saturação de oxigênio. Tudo isso com uma interface propositalmente simples, que exibe os avisos apenas quando necessário.",
    "Como cada família tem necessidades diferentes, o VitalCare está disponível em três pacotes:"
  ];

  const pacotes = PLANOS.map((plano) => ({
    titulo: `${plano.nome}${plano.recomendado ? " (o mais recomendado)" : ""} – ${brl(plano.preco)}`,
    texto: plano.resumo
  }));

  const condicoes = [
    `Frete para ${destino}: ${freteTexto}`,
    `Condições de pagamento: ${PROPOSTA.pagamento}`,
    `Entrega e instalação: ${PROPOSTA.entrega}`
  ];

  const finais = [
    "Caso haja alguma necessidade específica que não esteja contemplada nos pacotes acima, teremos prazer em elaborar uma configuração sob medida.",
    `Para confirmar o pedido, basta responder a este e-mail informando o pacote desejado ou entrar em contato ${contato}. Nossa equipe estará à disposição para agendar a instalação e esclarecer qualquer dúvida.`
  ];

  const ps = `P.S.: As condições desta proposta são válidas até ${validade}. Caso deseje garanti-las, recomendamos a confirmação dentro desse prazo.`;

  const texto = [
    ...paragrafos,
    pacotes.map((p) => `${p.titulo}\n${p.texto}`).join("\n\n"),
    condicoes.join("\n"),
    ...finais,
    `Atenciosamente,\n\n${assinaturaLinhas.join("\n")}`,
    ps
  ].join("\n\n");

  const p = (conteudo) => `<p style="margin:0 0 16px;line-height:1.6">${conteudo}</p>`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1E2433;font-size:15px;max-width:620px">
    ${paragrafos.map((item) => p(escapeHtml(item))).join("")}
    ${pacotes.map((pacote) => `
      <div style="margin:0 0 12px;padding:14px 16px;border-radius:12px;background:#FBEFB0">
        <strong style="color:#1F2A44">${escapeHtml(pacote.titulo)}</strong><br/>
        <span style="line-height:1.6">${escapeHtml(pacote.texto)}</span>
      </div>`).join("")}
    <p style="margin:18px 0 16px;line-height:1.8">${condicoes.map((item) => {
      const [rotulo, ...resto] = item.split(": ");
      return `<strong>${escapeHtml(rotulo)}:</strong> ${escapeHtml(resto.join(": "))}`;
    }).join("<br/>")}</p>
    ${finais.map((item) => p(escapeHtml(item))).join("")}
    ${p(`Atenciosamente,<br/><br/>${assinaturaLinhas.map((linha, i) => i === 0 ? `<strong>${escapeHtml(linha)}</strong>` : escapeHtml(linha)).join("<br/>")}`)}
    <p style="margin:0;line-height:1.6;color:#59657A;font-size:13px"><em>${escapeHtml(ps)}</em></p>
  </div>`;

  return { assunto, texto, html };
}

// Aviso para a equipe com os dados do cliente
export function montarAvisoEquipe({ nome, email, telefone, local, plano, funcoes, mensagem }) {
  const planoEscolhido = PLANOS.find((item) => item.id === plano);
  const linhas = [
    ["Nome", nome],
    ["E-mail", email],
    ["Telefone", telefone || "—"],
    ["Plano de interesse", planoEscolhido ? `${planoEscolhido.nome} (${brl(planoEscolhido.preco)})` : "Ainda não sabe"],
    ["CEP", local ? `${local.cep}${local.cidade ? ` – ${local.cidade}/${local.uf}` : ""}` : "—"],
    ["Funções de interesse", funcoes.length ? funcoes.map((chave) => FUNCOES[chave]).join(", ") : "—"],
    ["Mensagem", mensagem || "—"]
  ];
  return {
    assunto: `Novo pedido de orçamento — ${nome}`,
    texto: linhas.map(([rotulo, valor]) => `${rotulo}: ${valor}`).join("\n") + "\n\nA proposta já foi enviada automaticamente para o cliente.",
    html: `<div style="font-family:Arial,sans-serif;font-size:15px">
      <h2 style="color:#1F2A44">Novo pedido de orçamento</h2>
      ${linhas.map(([rotulo, valor]) => `<p><strong>${rotulo}:</strong> ${escapeHtml(valor).replace(/\n/g, "<br/>")}</p>`).join("")}
      <p style="color:#59657A">A proposta já foi enviada automaticamente para o cliente.</p>
    </div>`
  };
}
