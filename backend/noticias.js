/* ================= Notícias do dia (painel do idoso) =================
   Lê o feed público da Agência Brasil, que permite reproduzir as notícias citando a fonte.
   O navegador não consegue ler o feed direto, então o servidor busca e guarda por 20 minutos.
   Se a Agência Brasil estiver fora do ar, continua mostrando a última lista que conseguiu. */
const FEED_URL = "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml";
const CACHE_MS = 20 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_NEWS = 5;
const SUMMARY_CHARS = 170;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name]);
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]).trim() : "";
}

// A descrição vem em HTML (e às vezes com HTML escapado duas vezes): sobra só o texto
function plainText(html) {
  return decode(String(html).replace(/<figure[\s\S]*?<\/figure>/g, " ").replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function summaryOf(text) {
  if (text.length <= SUMMARY_CHARS) return text;
  const cut = text.slice(0, SUMMARY_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

const httpsUrl = (value) => (/^https:\/\//.test(value) ? value : "");

export function parseFeed(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const date = new Date(tag(item, "pubDate"));
      return {
        title: plainText(tag(item, "title")),
        link: httpsUrl(tag(item, "link")),
        image: httpsUrl(tag(item, "imagem-destaque")),
        summary: summaryOf(plainText(tag(item, "description"))),
        publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString()
      };
    })
    .filter((news) => news.title && news.link)
    .slice(0, MAX_NEWS);
}

export function registerNewsRoutes(app, dashboard) {
  let cache = { news: [], at: 0 };

  app.get(["/noticias", "/api/noticias"], dashboard.auth, async (_req, res) => {
    if (Date.now() - cache.at > CACHE_MS) {
      try {
        const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": "VitalCare/1.0" } });
        if (!response.ok) throw new Error(`feed respondeu ${response.status}`);
        const news = parseFeed(await response.text());
        if (news.length) cache = { news, at: Date.now() };
      } catch (error) {
        console.error("Notícias: não consegui ler o feed:", error.message);
      }
    }
    if (!cache.news.length) return res.status(503).json({ message: "Notícias indisponíveis agora." });
    return res.json({ news: cache.news, source: "Agência Brasil" });
  });
}
