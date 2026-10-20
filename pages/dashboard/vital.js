/* ================= Vital — assistente de voz do painel =================
   - Fica ouvindo a palavra "Vital". Ex.: "Vital, que remédio falta hoje?" ou "Vital" ... (pausa) ... pergunta.
   - Responde em voz alta (alto-falante) e também por escrito no cartão da Vital.
   - Avisa em voz alta: hora dos remédios, consultas (véspera, 1 hora e 15 minutos antes),
     lembretes diários e alertas dos sensores (gás, batimentos, oxigenação e temperatura da casa),
     com alarme sonoro nos alertas graves.
   Usa o reconhecimento de voz do navegador (Google Chrome ou Microsoft Edge) e a voz do sistema.
   Depende do script principal do painel (state, api, today, weather, loadDashboard...). */
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const PREF_KEY = "vc-vital-voz";
  const SPOKEN_KEY = "vc-vital-avisos";
  const WAKE_RE = /\b(?:vital|vitau|vitao|vitar|vitall)\b/;
  const QUESTION_WINDOW_MS = 9000;      // depois de "Vital", quanto tempo espera a pergunta
  const HISTORY_RESET_MS = 10 * 60000;  // conversa "esquece" depois de 10 min parada
  const MED_REPEAT_MS = 3 * 60000;      // repete o aviso do remédio enquanto não confirmar
  const MED_MAX_REPEATS = 3;
  const SNOOZE_MS = 10 * 60000;         // "Lembrar mais tarde"
  // de quanto em quanto tempo a Vital repete um alerta de sensor enquanto ninguém tocar em "Entendi"
  const SENSOR_REPEAT_MS = { "gas-bad": 2 * 60000, bad: 5 * 60000, warn: 20 * 60000 };
  const ALARM_REPEAT_MS = 30000;        // bipe dos alertas graves (gás em perigo, oxigenação/batimentos muito fora)

  const el = {};
  let voiceOn = readPref();
  let recognition = null;
  let listening = false;       // reconhecimento ligado
  let mode = "wake";           // "wake" (esperando "Vital") ou "question" (esperando a pergunta)
  let questionTimer = null;
  let busy = false;            // esperando a resposta da IA
  let speaking = false;
  let audioUnlocked = false;   // o navegador só fala depois de um toque/clique na página
  let pendingSpeech = [];
  let history = [];
  let lastExchangeAt = 0;
  let restartDelay = 300;
  let recognitionBroken = false;
  const sensorAlertAt = {};
  let audioContext = null;
  let alarmTimer = null;
  const medRepeat = {};        // id -> { count, timer }
  const snoozed = {};          // id -> horário (ms) para avisar de novo

  /* ---------- utilidades ---------- */
  function readPref() {
    try { return localStorage.getItem(PREF_KEY) !== "off"; } catch (e) { return true; }
  }
  function savePref() {
    try { localStorage.setItem(PREF_KEY, voiceOn ? "on" : "off"); } catch (e) {}
  }
  function normalize(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s%]/g, " ").replace(/\s+/g, " ").trim();
  }
  function firstName() {
    const user = getCurrentUser();
    return String(user?.name || "").trim().split(/\s+/)[0] || "";
  }
  function spokenTime(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h} horas`;
  }

  // Avisos já falados hoje (não repetir ao recarregar a página)
  function spokenSet() {
    try {
      const saved = JSON.parse(localStorage.getItem(SPOKEN_KEY) || "{}");
      return saved.day === today() ? new Set(saved.keys) : new Set();
    } catch (e) { return new Set(); }
  }
  function markSpoken(key) {
    const set = spokenSet();
    set.add(key);
    try { localStorage.setItem(SPOKEN_KEY, JSON.stringify({ day: today(), keys: [...set] })); } catch (e) {}
  }
  function wasSpoken(key) {
    return spokenSet().has(key);
  }

  /* ---------- voz (alto-falante) ---------- */
  let voice = null;
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices().filter((item) => /^pt[-_]BR/i.test(item.lang));
    const preferred = [/google/i, /francisca|thalita|leticia|luciana|maria/i, /natural|online/i];
    voice = preferred.map((re) => voices.find((item) => re.test(item.name))).find(Boolean) || voices[0] || null;
  }
  if (synth) {
    pickVoice();
    synth.addEventListener?.("voiceschanged", pickVoice);
  }

  // Abreviações e unidades por extenso, para a voz ler de forma natural
  const SPEECH_WORDS = [
    [/\bDra\.\s*/g, "Doutora "], [/\bDr\.\s*/g, "Doutor "], [/\bSra\.\s*/g, "Senhora "], [/\bSr\.\s*/g, "Senhor "],
    [/(\d)\s*mg\b/gi, "$1 miligramas"], [/(\d)\s*ml\b/gi, "$1 mililitros"], [/(\d)\s*bpm\b/gi, "$1 batimentos por minuto"],
    [/(\d)\s*ppm\b/gi, "$1 partes por milhão"], [/(\d)\s*°\s*C\b/g, "$1 graus"], [/(\d)\s*°/g, "$1 graus"],
    [/\bSpO2\b/gi, "saturação de oxigênio"], [/\bSAMU\b/g, "Samu"], [/\bkm\/h\b/gi, "quilômetros por hora"]
  ];
  function forSpeech(text) {
    return SPEECH_WORDS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), String(text));
  }

  // Divide em frases (o Chrome corta falas muito longas) e fala uma de cada vez
  function speak(text) {
    return new Promise((resolve) => {
      if (!synth || !voiceOn || !text) return resolve();
      if (!audioUnlocked) {
        pendingSpeech.push(text);
        showUnlockHint(true);
        return resolve();
      }
      const parts = forSpeech(text).replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || [text];
      synth.cancel();
      speaking = true;
      pauseRecognition();
      setStatus("speaking");
      let index = 0;
      const next = () => {
        if (index >= parts.length || !voiceOn) {
          speaking = false;
          setStatus(busy ? "thinking" : mode === "question" ? "listening" : "idle");
          resumeRecognition();
          return resolve();
        }
        const utterance = new SpeechSynthesisUtterance(parts[index++].trim());
        utterance.lang = "pt-BR";
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.onend = next;
        utterance.onerror = next;
        synth.speak(utterance);
      };
      next();
    });
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    } catch (e) { /* sem alarme sonoro, a voz e a tela continuam avisando */ }
    showUnlockHint(false);
    if (synth) {
      // fala "vazia" para o navegador liberar o áudio
      const warmup = new SpeechSynthesisUtterance(" ");
      warmup.volume = 0;
      synth.speak(warmup);
    }
    if (voiceOn) startRecognition();
    const queued = pendingSpeech.splice(0);
    if (queued.length) speak(queued.join(" "));
  }

  /* ---------- reconhecimento de voz ---------- */
  function setupRecognition() {
    if (!Recognition) return null;
    const rec = new Recognition();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      if (mode === "question" && interim) showHeard(interim, true);
      if (!finalText.trim() || busy || speaking) return;
      handleHeard(finalText.trim());
    };
    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recognitionBroken = true;
        setStatus("blocked");
      } else if (event.error === "network") {
        recognitionBroken = true;
        setStatus("unsupported", "O reconhecimento de voz deste navegador não está disponível (precisa de internet e do Google Chrome ou Microsoft Edge). Você pode escrever a pergunta abaixo.");
      } else if (event.error === "audio-capture") {
        recognitionBroken = true;
        setStatus("unsupported", "Nenhum microfone encontrado. Conecte um microfone ou escreva a pergunta abaixo.");
      }
    };
    rec.onend = () => {
      listening = false;
      // o Chrome encerra sozinho de tempos em tempos: religa enquanto a Vital estiver ativa
      if (voiceOn && !speaking && !busy && !recognitionBroken && audioUnlocked) {
        setTimeout(startRecognition, restartDelay);
        restartDelay = Math.min(restartDelay * 2, 5000);
      }
    };
    rec.onstart = () => {
      listening = true;
      restartDelay = 300;
      if (!speaking && !busy) setStatus(mode === "question" ? "listening" : "idle");
    };
    return rec;
  }

  function startRecognition() {
    if (!recognition || listening || speaking || busy || !voiceOn || recognitionBroken) return;
    try { recognition.start(); } catch (e) { /* já estava ligando */ }
  }
  function pauseRecognition() {
    if (recognition && listening) {
      try { recognition.abort(); } catch (e) {}
    }
  }
  function resumeRecognition() {
    if (!busy && !speaking) startRecognition();
  }

  function handleHeard(text) {
    const normal = normalize(text);
    if (mode === "question") {
      clearTimeout(questionTimer);
      mode = "wake";
      ask(text);
      return;
    }
    const match = normal.match(WAKE_RE);
    if (!match) return;
    // o que veio depois de "Vital" é a pergunta
    const after = normal.slice(match.index + match[0].length).trim();
    if (after.split(" ").filter(Boolean).length >= 2) {
      ask(after);
    } else {
      mode = "question";
      setStatus("listening");
      showHeard("", true);
      speak(firstName() ? `Oi, ${firstName()}. Pode falar.` : "Oi. Pode falar.");
      clearTimeout(questionTimer);
      questionTimer = setTimeout(() => {
        mode = "wake";
        if (!busy && !speaking) setStatus("idle");
      }, QUESTION_WINDOW_MS);
    }
  }

  /* ---------- conversa com a IA ---------- */
  function contextNow() {
    const now = new Date();
    const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let clima = "";
    if (typeof weather !== "undefined" && weather) {
      const info = WEATHER_CODES.find((item) => item.codes.includes(weather.code));
      clima = `${info ? info.text + ", " : ""}${Math.round(weather.temp)}°C${state.location?.city ? " em " + state.location.city : ""}, umidade ${Math.round(weather.humidity)}%`;
    }
    return { hoje: today(), agora: `${formatDate(now)}, ${time}`, clima };
  }

  async function ask(question) {
    question = String(question || "").trim();
    if (!question || busy) return;
    if (Date.now() - lastExchangeAt > HISTORY_RESET_MS) history = [];
    busy = true;
    pauseRecognition();
    setStatus("thinking");
    showHeard(question, false);
    showReply("");
    history.push({ role: "user", content: question });
    try {
      const data = await api("/api/assistente/painel", {
        method: "POST",
        body: JSON.stringify({ messages: history.slice(-12), contexto: contextNow(), nome: firstName() })
      });
      history.push({ role: "assistant", content: data.reply });
      lastExchangeAt = Date.now();
      showReply(data.reply);
      if (data.changed) loadDashboard().catch(() => {});
      busy = false;
      await speak(data.reply);
    } catch (error) {
      history.pop();
      busy = false;
      showReply(error.message, true);
      await speak(error.message);
    } finally {
      busy = false;
      if (!speaking) {
        setStatus("idle");
        resumeRecognition();
      }
    }
  }

  /* ---------- cartão da Vital na tela ---------- */
  const STATUS = {
    off: ["Vital desativada", "Ative para conversar por voz e ouvir os lembretes."],
    idle: ["Diga “Vital” para falar comigo", "Ex.: “Vital, que remédio falta hoje?”"],
    listening: ["Estou ouvindo…", "Pode fazer sua pergunta."],
    thinking: ["Pensando…", "Só um instante."],
    speaking: ["Falando…", ""],
    blocked: ["Microfone bloqueado", "Libere o microfone no cadeado da barra de endereço e recarregue a página. Você também pode escrever abaixo."],
    unsupported: ["Voz indisponível", "Este navegador não reconhece voz. Use o Google Chrome ou o Microsoft Edge, ou escreva a pergunta abaixo."]
  };

  function setStatus(name, detail) {
    if (!el.root) return;
    const [title, hint] = STATUS[name] || STATUS.idle;
    el.root.dataset.state = name;
    el.title.textContent = title;
    el.hint.textContent = detail || hint;
  }
  function showHeard(text, interim) {
    el.heard.hidden = !text;
    el.heard.textContent = text ? `Você: ${text}` : "";
    el.heard.classList.toggle("interim", Boolean(interim));
  }
  function showReply(text, isError) {
    el.reply.hidden = !text;
    el.reply.textContent = text || "";
    el.reply.classList.toggle("error", Boolean(isError));
  }
  function showUnlockHint(show) {
    if (el.unlock) el.unlock.hidden = !show || audioUnlocked;
  }

  function setVoice(on) {
    voiceOn = on;
    savePref();
    el.toggle.setAttribute("aria-pressed", String(on));
    el.toggle.textContent = on ? "Desativar voz" : "Ativar voz";
    if (on) {
      recognitionBroken = false;
      unlockAudio();
      setStatus(Recognition ? "idle" : "unsupported");
      startRecognition();
    } else {
      synth?.cancel();
      speaking = false;
      pauseRecognition();
      setStatus("off");
    }
  }

  function buildCard() {
    const root = document.createElement("section");
    root.className = "vital-assist";
    root.setAttribute("aria-label", "Vital, assistente de voz");
    root.innerHTML = `
      <button class="vital-orb" type="button" aria-label="Abrir ou fechar a Vital" aria-expanded="false">
        <span class="vital-ring"></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
      </button>
      <div class="vital-card" hidden>
        <div class="vital-head">
          <div>
            <strong class="vital-title"></strong>
            <p class="vital-hint"></p>
          </div>
          <button class="vital-close" type="button" aria-label="Fechar">×</button>
        </div>
        <button class="vital-unlock" type="button" hidden>Toque aqui para ativar o som da Vital</button>
        <p class="vital-heard" hidden></p>
        <p class="vital-reply" hidden aria-live="polite"></p>
        <form class="vital-form">
          <label class="sr-only" for="vitalInput">Escreva para a Vital</label>
          <input id="vitalInput" type="text" maxlength="500" placeholder="Ou escreva sua pergunta…" autocomplete="off" />
          <button class="vital-send" type="submit" aria-label="Enviar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7Z"/><path d="m11 13 9-9"/></svg>
          </button>
        </form>
        <div class="vital-actions">
          <button class="vital-talk" type="button">Falar agora</button>
          <button class="vital-toggle" type="button" aria-pressed="true"></button>
        </div>
      </div>`;
    document.body.appendChild(root);

    el.root = root;
    el.orb = root.querySelector(".vital-orb");
    el.card = root.querySelector(".vital-card");
    el.title = root.querySelector(".vital-title");
    el.hint = root.querySelector(".vital-hint");
    el.heard = root.querySelector(".vital-heard");
    el.reply = root.querySelector(".vital-reply");
    el.unlock = root.querySelector(".vital-unlock");
    el.toggle = root.querySelector(".vital-toggle");
    el.talk = root.querySelector(".vital-talk");
    el.input = root.querySelector("#vitalInput");

    const open = (show) => {
      el.card.hidden = !show;
      el.orb.setAttribute("aria-expanded", String(show));
      try { localStorage.setItem("vc-vital-aberta", show ? "sim" : "nao"); } catch (e) {}
    };
    el.orb.addEventListener("click", () => open(el.card.hidden));
    root.querySelector(".vital-close").addEventListener("click", () => open(false));
    el.unlock.addEventListener("click", unlockAudio);
    el.toggle.addEventListener("click", () => setVoice(!voiceOn));
    el.talk.addEventListener("click", () => {
      if (!voiceOn) setVoice(true);
      unlockAudio();
      if (!Recognition || recognitionBroken) {
        el.input.focus();
        return;
      }
      synth?.cancel();
      speaking = false;
      mode = "question";
      clearTimeout(questionTimer);
      questionTimer = setTimeout(() => { mode = "wake"; if (!busy && !speaking) setStatus("idle"); }, QUESTION_WINDOW_MS);
      setStatus("listening");
      startRecognition();
    });
    root.querySelector(".vital-form").addEventListener("submit", (event) => {
      event.preventDefault();
      unlockAudio();
      const text = el.input.value;
      el.input.value = "";
      ask(text);
    });

    el.toggle.setAttribute("aria-pressed", String(voiceOn));
    el.toggle.textContent = voiceOn ? "Desativar voz" : "Ativar voz";
    if (!Recognition) setStatus("unsupported");
    else setStatus(voiceOn ? "idle" : "off");
    let startOpen = true;
    try { startOpen = localStorage.getItem("vc-vital-aberta") !== "nao"; } catch (e) {}
    open(startOpen);
    if (voiceOn) showUnlockHint(true);
  }

  /* ---------- avisos (tela + voz) ---------- */
  function toast(title, text, tone) {
    const box = document.getElementById("vitalToasts");
    const item = document.createElement("div");
    item.className = `vital-toast${tone ? " " + tone : ""}`;
    item.setAttribute("role", "status");
    item.innerHTML = `<div><strong></strong><p></p></div><button type="button" aria-label="Fechar aviso">×</button>`;
    item.querySelector("strong").textContent = title;
    item.querySelector("p").textContent = text;
    item.querySelector("button").addEventListener("click", () => item.remove());
    box.appendChild(item);
    setTimeout(() => item.remove(), 90000);
  }

  function announce(key, title, text, spoken, tone) {
    if (key && wasSpoken(key)) return;
    if (key) markSpoken(key);
    toast(title, text, tone);
    speak(spoken || text);
  }

  // Remédio: chamado pelo painel quando abre o aviso "Hora do remédio"
  function onMedicineDue(med) {
    const name = firstName();
    const dose = med.dose ? `, ${med.dose}` : "";
    const sayIt = () => speak(`${name ? name + ", " : ""}está na hora do remédio ${med.name}${dose}. Quando tomar, toque em "Já tomei" ou diga: Vital, já tomei.`);
    clearInterval(medRepeat[med.id]?.timer);
    medRepeat[med.id] = { count: 1, timer: null };
    sayIt();
    medRepeat[med.id].timer = setInterval(() => {
      const current = state.medications.find((item) => item.id === med.id);
      const stillOpen = !document.getElementById("medicineReminder").classList.contains("hidden");
      if (!current || isTaken(current) || !stillOpen || medRepeat[med.id].count >= MED_MAX_REPEATS) {
        clearInterval(medRepeat[med.id].timer);
        return;
      }
      medRepeat[med.id].count++;
      sayIt();
    }, MED_REPEAT_MS);
  }
  function onMedicineDone(id) {
    clearInterval(medRepeat[id]?.timer);
    delete snoozed[id];
    synth?.cancel();
  }
  function onMedicineSnooze(med) {
    clearInterval(medRepeat[med.id]?.timer);
    snoozed[med.id] = Date.now() + SNOOZE_MS;
    synth?.cancel();
    speak("Tudo bem, eu lembro de novo daqui a 10 minutos.");
  }

  function minutesUntil(isoDate, hhmm) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const [h, min] = hhmm.split(":").map(Number);
    return Math.round((new Date(y, m - 1, d, h, min) - new Date()) / 60000);
  }

  // Verificado a cada 30 segundos
  function checkSchedule() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const name = firstName();
    const hi = name ? `${name}, ` : "";

    // remédios adiados ("Lembrar mais tarde")
    for (const [id, when] of Object.entries(snoozed)) {
      if (Date.now() < when) continue;
      delete snoozed[id];
      const med = state.medications.find((item) => String(item.id) === id);
      if (med && !isTaken(med)) showMedicineReminder(med);
    }

    // consultas: véspera (às 19h), 1 hora antes e 15 minutos antes
    for (const item of state.appointments) {
      const minutes = minutesUntil(item.date, item.time);
      const who = item.doctor ? ` com ${item.doctor}` : "";
      const base = `consulta-${item.id}-${item.date}-${item.time}`;
      const inMinutes = minutes >= 55 ? "uma hora" : minutes === 1 ? "1 minuto" : `${minutes} minutos`;
      if (minutes > 0 && minutes <= 15) {
        announce(`${base}-15`, `Consulta em ${inMinutes}`, `${item.title}${who} às ${item.time}.`,
          `${hi}lembrete: daqui a ${inMinutes} você tem ${item.title}${who}.`, "warm");
      } else if (minutes > 15 && minutes <= 60) {
        announce(`${base}-60`, `Consulta em ${inMinutes}`, `${item.title}${who} às ${item.time}.`,
          `${hi}lembrete: daqui a ${inMinutes}, às ${spokenTime(item.time)}, você tem ${item.title}${who}.`, "warm");
      } else if (minutes > 60 && item.date !== today() && minutes <= 36 * 60 && now.getHours() >= 19) {
        announce(`${base}-vespera`, "Consulta amanhã", `${item.title}${who} às ${item.time}.`,
          `${hi}lembrete: amanhã, às ${spokenTime(item.time)}, você tem ${item.title}${who}.`);
      }
    }

    // lembretes diários no horário
    for (const item of state.reminders) {
      if (item.time !== hhmm) continue;
      announce(`lembrete-${item.id}-${item.time}`, `Lembrete: ${item.title}`, item.detail || `Horário: ${item.time}.`,
        `${hi}lembrete: ${item.title}.${item.detail ? " " + item.detail + "." : ""}`);
    }
  }

  // Alarme: 3 bipes agudos (toca mesmo com a voz desativada)
  function beep() {
    if (!audioContext) return;
    if (audioContext.state === "suspended") audioContext.resume();
    const start = audioContext.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const at = start + i * 0.45;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  }

  function stopAlarm() {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }

  // Chamado a cada atualização dos sensores com os alertas ativos que a pessoa ainda não marcou "Entendi"
  // alert = { key, kind, tone: "warn" | "bad", title, text, spoken }
  function checkSensors(alerts) {
    const grave = alerts.some((alert) => alert.tone === "bad");
    const alarmStarted = grave && !alarmTimer;
    if (alarmStarted) {
      beep();
      alarmTimer = setInterval(beep, ALARM_REPEAT_MS);
    } else if (!grave) {
      stopAlarm();
    }

    for (const key of Object.keys(sensorAlertAt)) {
      if (!alerts.some((alert) => alert.key === key)) delete sensorAlertAt[key];   // normalizou: avisa de novo se voltar
    }
    // graves primeiro (gás em perigo antes de tudo), numa fala só para uma não cortar a outra
    const due = alerts
      .filter((alert) => Date.now() - (sensorAlertAt[alert.key] || 0) >= (SENSOR_REPEAT_MS[alert.key] || SENSOR_REPEAT_MS[alert.tone]))
      .sort((a, b) => (b.key === "gas-bad") - (a.key === "gas-bad") || (b.tone === "bad") - (a.tone === "bad"));
    if (!due.length) return;
    due.forEach((alert) => { sensorAlertAt[alert.key] = Date.now(); });
    const text = due.map((alert) => alert.spoken).join(" ");
    setTimeout(() => speak(text), alarmStarted ? 1500 : 0);   // espera os bipes terminarem
  }

  /* ---------- início ---------- */
  function init() {
    buildCard();
    recognition = setupRecognition();
    // Qualquer toque na tela libera o som (exigência dos navegadores)
    ["pointerdown", "keydown", "touchstart"].forEach((type) => document.addEventListener(type, unlockAudio, { once: true, passive: true }));
    setInterval(checkSchedule, 30000);
    setTimeout(checkSchedule, 4000);
  }

  // simulateHeard: usado só em testes, para simular o que o microfone ouviu
  window.VitalVoice = { init, onMedicineDue, onMedicineDone, onMedicineSnooze, checkSensors, stopAlarm, speak, ask, simulateHeard: handleHeard };
}());
