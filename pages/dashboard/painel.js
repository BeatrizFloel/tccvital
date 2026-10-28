/* ================= Funções comuns dos painéis =================
   Usado pelo painel do idoso (dashboard.html) e pelo do cuidador (cuidador.html).
   Cada página define o próprio `state` (medicamentos, sensores...). */
const API_CANDIDATES = [window.location.origin, "https://tccvital.vercel.app"]
  .filter((value, index, list) => value && value !== "null" && list.indexOf(value) === index);
let apiBase = null;

const SENSOR_STALE_MINUTES = 10;

function getCurrentUser() {
  const stored = localStorage.getItem("vitalcare-current-user");
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed && parsed.email ? parsed : null;
  } catch (error) {
    return null;
  }
}

function getToken() {
  const token = localStorage.getItem("vitalcare-token");
  return token && token !== "local-session-token" ? token : null;
}

function goToLogin() {
  localStorage.removeItem("vitalcare-current-user");
  localStorage.removeItem("vitalcare-token");
  window.location.href = "../login/login.html";
}

// Chama o servidor (tenta o próprio site e, se não for o do VitalCare, o da Vercel)
async function api(path, options = {}) {
  const bases = apiBase ? [apiBase] : API_CANDIDATES;
  let lastError = null;
  for (const base of bases) {
    let response;
    try {
      response = await fetch(base + path, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) }
      });
    } catch (error) {
      lastError = new Error("Servidor indisponível. Confira sua internet.");
      continue;
    }
    const data = await response.json().catch(() => undefined);
    if (data === undefined) { lastError = new Error("Servidor do VitalCare não encontrado."); continue; }
    apiBase = base;
    if (response.status === 401) { goToLogin(); throw new Error(data?.message || "Sessão expirada."); }
    if (!response.ok) throw new Error(data?.message || "Não foi possível salvar.");
    return data;
  }
  throw lastError || new Error("Servidor indisponível.");
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatDay(isoDate) {
  const [, month, day] = String(isoDate || "").split("-");
  return day && month ? `${day}/${month}` : "";
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function emptyNote(text) {
  return `<li class="empty-note">${text}</li>`;
}

function removeButton(list, id) {
  return `<button class="item-remove" type="button" data-remove="${list}" data-id="${id}" aria-label="Remover">×</button>`;
}

function isTaken(med) {
  return med.takenOn === today();
}

function minutesSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function setStatus(id, label, tone) {
  const badge = document.getElementById(id);
  badge.textContent = label;
  badge.className = `panel-badge status${tone ? ` tone-${tone}` : ""}`;
}

/* ---------- Sensores ---------- */
// Gás (somente pelo sensor)
function gasStatus(level) {
  if (level <= 50) return "Normal";
  if (level <= 200) return "Atenção";
  return "Perigo";
}

// Faixas de referência (repouso, adulto/idoso). Não substituem avaliação profissional.
function heartStatus(bpm) {
  if (bpm < 50) return ["Muito baixo", "bad"];
  if (bpm < 60) return ["Baixo", "warn"];
  if (bpm <= 100) return ["Normal", "good"];
  if (bpm <= 120) return ["Elevado", "warn"];
  return ["Muito alto", "bad"];
}

function oxygenStatus(spo2) {
  if (spo2 >= 95) return ["Normal", "good"];
  if (spo2 >= 90) return ["Atenção", "warn"];
  return ["Baixa", "bad"];
}

function temperatureStatus(celsius) {
  if (celsius < 18) return ["Frio", "warn"];
  if (celsius <= 26) return ["Agradável", "good"];
  if (celsius <= 30) return ["Quente", "warn"];
  return ["Muito quente", "bad"];
}

// O oxímetro pode mandar só bpm ou só spo2 numa leitura: pega o último valor de cada um
function seriesOf(reading, key) {
  return (reading?.history || []).filter((point) => hasValue(point[key])).map((point) => ({ value: point[key], at: point.at }));
}

// Média das leituras recentes: os alertas usam a média para não disparar por uma leitura isolada
// (dedo mal posicionado no oxímetro, sensor perto do fogão por um instante etc.)
const AVERAGE_MINUTES = { bpm: 5, spo2: 5, celsius: 30 };

function recentAverage(series, minutes) {
  const lastPoint = series.at(-1);
  if (!lastPoint || minutesSince(lastPoint.at) > SENSOR_STALE_MINUTES) return null;
  const since = new Date(lastPoint.at).getTime() - minutes * 60000;
  const values = series.filter((point) => new Date(point.at).getTime() >= since).map((point) => point.value);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/* ---------- Alertas dos sensores (tela + alarme + voz da Vital) ---------- */
// Gás: leitura atual (precisa avisar na hora). Batimentos, oxímetro e temperatura: média recente.
function sensorAlerts() {
  const alerts = [];
  const add = (kind, tone, title, text, spoken) => alerts.push({ key: `${kind}-${tone}`, kind, tone, title, text, spoken });

  const gas = state.gas;
  if (gas && hasValue(gas.level) && minutesSince(gas.updatedAt) <= SENSOR_STALE_MINUTES) {
    const label = gasStatus(gas.level);
    if (label === "Perigo") {
      add("gas", "bad", "Vazamento de gás!",
        `O sensor detectou ${gas.level} ppm de gás. Não acenda luzes, fósforos nem o fogão. Abra portas e janelas, saia de casa e ligue para os Bombeiros (193).`,
        "Atenção! Vazamento de gás detectado. Não acenda luzes nem fósforos. Abra portas e janelas, saia de casa e ligue para os Bombeiros, no 193.");
    } else if (label === "Atenção") {
      add("gas", "warn", "Cheiro de gás detectado",
        `O sensor detectou ${gas.level} ppm de gás. Verifique se o fogão está desligado e o botijão fechado, e abra as janelas.`,
        "Atenção: o sensor detectou cheiro de gás. Verifique se o fogão está desligado e o botijão fechado, e abra as janelas.");
    }
  }

  const bpm = recentAverage(seriesOf(state.heart, "bpm"), AVERAGE_MINUTES.bpm);
  if (bpm !== null) {
    const [label, tone] = heartStatus(bpm);
    const value = formatNumber(bpm);
    if (tone !== "good") {
      add("heart", tone, { "Muito baixo": "Batimentos muito baixos", Baixo: "Batimentos baixos", Elevado: "Batimentos acelerados", "Muito alto": "Batimentos muito acelerados" }[label],
        `Média dos últimos ${AVERAGE_MINUTES.bpm} minutos: ${value} bpm (o normal em repouso é de 60 a 100). Sente-se e descanse. Se sentir dor no peito, falta de ar ou tontura, ligue para o SAMU (192).`,
        `Atenção: seus batimentos estão ${bpm > 100 ? "acima" : "abaixo"} do normal, em média ${value} por minuto. Sente-se e descanse. Se sentir dor no peito, falta de ar ou tontura, ligue para o SAMU, no 192.`);
    }
  }

  const spo2 = recentAverage(seriesOf(state.heart, "spo2"), AVERAGE_MINUTES.spo2);
  if (spo2 !== null) {
    const [, tone] = oxygenStatus(spo2);
    const value = formatNumber(spo2);
    if (tone === "warn") {
      add("spo2", tone, "Oxigenação um pouco baixa",
        `Média dos últimos ${AVERAGE_MINUTES.spo2} minutos: ${value}% (o normal é 95% ou mais). Sente-se, respire devagar e meça de novo. Se houver falta de ar, ligue para o SAMU (192).`,
        `Atenção: sua oxigenação está um pouco baixa, em média ${value} por cento. Sente-se, respire devagar e meça de novo. Se houver falta de ar, ligue para o SAMU, no 192.`);
    } else if (tone === "bad") {
      add("spo2", tone, "Oxigenação baixa",
        `Média dos últimos ${AVERAGE_MINUTES.spo2} minutos: ${value}% (o normal é 95% ou mais). Se houver falta de ar, ligue agora para o SAMU (192) ou chame alguém.`,
        `Atenção! Sua oxigenação está baixa, em média ${value} por cento. Se houver falta de ar, ligue agora para o SAMU, no 192, ou chame alguém para ajudar.`);
    }
  }

  const celsius = recentAverage(seriesOf(state.temperature, "celsius"), AVERAGE_MINUTES.celsius);
  if (celsius !== null) {
    const [label, tone] = temperatureStatus(celsius);
    const value = formatNumber(celsius, 1);
    const intro = `A temperatura média da casa nos últimos ${AVERAGE_MINUTES.celsius} minutos está em ${value} graus.`;
    if (celsius < 18) {
      add("temp", tone, "Casa fria",
        `Temperatura média (${AVERAGE_MINUTES.celsius} min): ${value} °C. Agasalhe-se, feche as janelas e tome algo quente.`,
        `${intro} Está frio. Agasalhe-se, feche as janelas e tome algo quente.`);
    } else if (tone !== "good") {
      add("temp", tone, label === "Muito quente" ? "Casa muito quente" : "Casa quente",
        `Temperatura média (${AVERAGE_MINUTES.celsius} min): ${value} °C. Beba água, use roupas leves e deixe o ar circular.`,
        `${intro} Está ${label.toLowerCase()}. Beba água, use roupas leves e deixe o ar circular.`);
    }
  }
  return alerts;
}
