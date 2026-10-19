/* ================= Planos do VitalCare — FONTE ÚNICA DOS PREÇOS =================
   Este arquivo é usado pela página Produto (cards dos planos e formulário)
   e pelo servidor (e-mail automático da proposta). Mude o preço aqui e
   ele muda nos dois lugares. */
export const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    preco: 799.90,
    resumo: "Tela com data, horário e clima, lembretes de medicamentos e alertas de consultas e compromissos.",
    recursos: [
      "Tela touch screen de 14 polegadas",
      "Data, horário e clima da cidade",
      "Lembretes de medicamentos com foto",
      "Alertas de consultas e compromissos"
    ],
    funcoes: ["clima", "medicamentos", "consultas"]
  },
  {
    id: "seguranca",
    nome: "Segurança",
    preco: 899.90,
    resumo: "Todos os recursos do Essencial, acrescidos dos sensores de gás e de temperatura ambiente.",
    recursos: [
      "Tudo do plano Essencial",
      "Sensor de vazamento de gás",
      "Sensor de temperatura ambiente"
    ],
    funcoes: ["clima", "medicamentos", "consultas", "gas", "temperatura"]
  },
  {
    id: "completo",
    nome: "Completo",
    preco: 999.90,
    recomendado: true,
    resumo: "Todos os recursos anteriores, acrescidos do monitoramento de frequência cardíaca e saturação de oxigênio.",
    recursos: [
      "Tudo do plano Segurança",
      "Frequência cardíaca",
      "Saturação de oxigênio"
    ],
    funcoes: ["clima", "medicamentos", "consultas", "gas", "temperatura", "cardiaco"]
  }
];

export function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
