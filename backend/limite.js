/* ================= Limite de tentativas (memória do servidor) =================
   Conta quantas vezes uma "chave" (IP, e-mail...) usou uma rota dentro de uma janela de tempo.
   Na Vercel cada instância tem a própria memória, então o limite é aproximado, mas já barra abuso. */

export function createLimiter({ max, windowMs }) {
  const hits = new Map();

  function recent(key) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    // true se ainda pode; conta a tentativa
    allow(key) {
      const list = recent(key);
      if (list.length >= max) return false;
      list.push(Date.now());
      hits.set(key, list);
      if (hits.size > 10000) hits.delete(hits.keys().next().value);
      return true;
    },
    // true se já passou do limite (sem contar uma tentativa nova)
    blocked(key) {
      return recent(key).length >= max;
    },
    // conta uma tentativa sem checar (ex.: senha errada)
    add(key) {
      const list = recent(key);
      list.push(Date.now());
      hits.set(key, list);
      if (hits.size > 10000) hits.delete(hits.keys().next().value);
    },
    reset(key) {
      hits.delete(key);
    }
  };
}

/* IP de quem fez o pedido.
   Na Vercel, o cabeçalho x-forwarded-for é preenchido pela própria Vercel (não dá para falsificar).
   Fora dela, qualquer um pode mandar esse cabeçalho, então usamos o IP da conexão. */
export function clientIp(req) {
  if (process.env.VERCEL === "1") {
    const forwarded = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || req.ip || "desconhecido";
}
