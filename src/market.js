// Public data sources: Nifty 50 history (Yahoo Finance), fund NAVs (mfapi.in / AMFI), news (Google News).
import { cached } from "./storage";

const H6 = 6 * 3600e3;

async function getJSON(url, what) {
  let r;
  try { r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }); } catch { throw new Error(`Couldn't load ${what}. Check your internet connection.`); }
  if (!r.ok) throw new Error(`Couldn't load ${what} (HTTP ${r.status}).`);
  return r.json();
}

// Daily closes from Yahoo Finance's public chart endpoint. ^NSEI is the Nifty 50.
export async function yahooHistory(ticker, from, to) {
  return cached(`y_${ticker}_${from}_${to}`, H6, async () => {
    const p1 = Math.floor(Date.parse(from) / 1000), p2 = Math.floor(Date.parse(to) / 1000) + 86400;
    try {
      const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d`, "Nifty 50 history");
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res) return [];
      const ts = res.timestamp || [], cl = (res.indicators.quote[0] || {}).close || [];
      const out = [];
      ts.forEach((t, i) => { if (cl[i] != null) out.push([new Date((t + 19800) * 1000).toISOString().slice(0, 10), cl[i]]); });
      return out;
    } catch { return []; }
  });
}

export async function niftyQuote() {
  try {
    const j = await getJSON("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=5d&interval=1d", "Nifty 50");
    const m = j.chart.result[0].meta;
    const prev = m.chartPreviousClose || m.previousClose;
    return { ltp: m.regularMarketPrice, pctChange: prev ? (m.regularMarketPrice / prev - 1) * 100 : null };
  } catch { return null; }
}

// ---- mutual funds
export async function navHistory(code) {
  if (!code) return { rows: [], meta: {} };
  return cached(`nav_${code}`, H6, async () => {
    const j = await getJSON(`https://api.mfapi.in/mf/${code}`, "fund NAVs");
    const rows = (j.data || []).map((x) => {
      const [d, m, y] = String(x.date).split("-");
      return [`${y}-${m}-${d}`, parseFloat(x.nav)];
    }).filter((r) => !isNaN(r[1])).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return { rows, meta: j.meta || {} };
  });
}

export async function searchFunds(q) {
  const j = await getJSON(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, "fund search");
  return (j || []).slice(0, 25).map((x) => ({ code: String(x.schemeCode), name: x.schemeName }));
}

// AMFI's daily NAV file maps ISINs (printed on your statement) to scheme codes.
export async function isinCodes(isins) {
  const want = new Set(isins.filter(Boolean));
  if (!want.size) return {};
  let text;
  try { text = await (await fetch("https://portal.amfiindia.com/spages/NAVAll.txt")).text(); } catch { return {}; }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(";");
    if (p.length < 6 || !/^\d+$/.test(p[0].trim())) continue;
    for (const i of [1, 2]) { const isin = (p[i] || "").trim(); if (want.has(isin)) out[isin] = p[0].trim(); }
  }
  return out;
}

// ---- news
const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const GENERIC = new Set(["limited", "ltd", "india", "industries", "the", "of", "and", "&", "co", "company", "corporation"]);

export function stockNewsQuery(symbol, name) {
  const words = (name || "").replace(/\./g, " ").split(/\s+/).filter((w) => w && !GENERIC.has(w.toLowerCase()));
  return `("${words.slice(0, 3).join(" ") || symbol}" OR "${symbol}") (share OR stock OR shares) when:14d`;
}
export function fundNewsQuery(name) {
  const core = name.split(" - ")[0].replace(/Direct Plan|Regular Plan|Growth/g, "").trim();
  return `("${core}" OR "Tata Mutual Fund" OR "Tata AMC") when:30d`;
}

export async function news(query) {
  return cached(`news_${query.slice(0, 80)}`, 30 * 60e3, async () => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const xml = await (await fetch(url)).text();
    const items = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const get = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block); return r ? decode(r[1]) : ""; };
      let title = get("title"); const source = get("source"); const link = get("link"); const pub = get("pubDate");
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
      if (title && /^https?:\/\//.test(link)) items.push({ title, source, link, ts: pub ? Date.parse(pub) : 0 });
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, 12);
  });
}

// ---- gold, silver and the rupee
// Live quotes from Yahoo Finance: GC=F is COMEX gold and SI=F COMEX silver (US$ per troy ounce); USDINR=X is ₹ per US$.
export async function yahooQuote(ticker) {
  try {
    const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`, ticker);
    const m = j.chart.result[0].meta;
    const prev = m.chartPreviousClose || m.previousClose;
    return { price: m.regularMarketPrice, prevClose: prev, pctChange: prev ? (m.regularMarketPrice / prev - 1) * 100 : null, at: m.regularMarketTime * 1000 };
  } catch { return null; }
}

export const TROY_OZ_GRAMS = 31.1035;
export const GOLD_IMPORT_DUTY = 0.06; // 5% basic customs duty + 1% AIDC (Union Budget, July 2024)

// What 10 g of gold should cost in India from COMEX gold and the rupee: the landed price before GST.
export const expectedGold10g = (comexUsdOz, usdInr, duty = GOLD_IMPORT_DUTY) =>
  comexUsdOz && usdInr ? (comexUsdOz * usdInr / TROY_OZ_GRAMS) * 10 * (1 + duty) : null;

export async function globalMetals() {
  const [gold, silver, usdInr] = await Promise.all(["GC=F", "SI=F", "USDINR=X"].map(yahooQuote));
  const expected = gold && usdInr ? expectedGold10g(gold.price, usdInr.price) : null;
  const expectedPrev = gold && usdInr && gold.prevClose && usdInr.prevClose ? expectedGold10g(gold.prevClose, usdInr.prevClose) : null;
  return { gold, silver, usdInr, expected, expectedPct: expected && expectedPrev ? (expected / expectedPrev - 1) * 100 : null };
}

// ---- gold in Chennai
// There's no free official feed for Chennai jewellers' rates, so the rate is worked out from the landed price:
// MCX gold when logged in to Kotak (already includes import duty), otherwise COMEX × rupee + duty.
// Like the rates jewellers publish, it excludes 3% GST and making charges. 22 carat is 91.6% pure.
export const GOLD_GST = 0.03;
export const PURITY_22K = 0.916;

// Daily landed price of 24-carat gold in ₹ per gram, from COMEX gold and the rupee.
export async function goldHistoryInr(days = 120) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const [g, fx] = await Promise.all([yahooHistory("GC=F", from, to), yahooHistory("USDINR=X", from, to)]);
  const fxBy = Object.fromEntries(fx);
  let lastFx = null;
  const out = [];
  for (const [d, c] of g) {
    if (fxBy[d]) lastFx = fxBy[d];
    if (lastFx) out.push([d, expectedGold10g(c, lastFx) / 10]);
  }
  return out;
}

// Least-squares trend through the log of the last `window` daily prices, projected forward.
// It only extends the recent trend: it is not a forecast, and gold can move against it at any time.
export function projectTrend(series, window = 60, aheadDays = [7, 30]) {
  const pts = series.slice(-window);
  if (pts.length < 20) return null;
  const t0 = Date.parse(pts[0][0]);
  const xs = pts.map(([d]) => (Date.parse(d) - t0) / 864e5), ys = pts.map(([, v]) => Math.log(v));
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0; // log change per day
  const resid = Math.sqrt(ys.reduce((a, y, i) => a + (y - (my + slope * (xs[i] - mx))) ** 2, 0) / Math.max(1, n - 2));
  return {
    monthlyPct: (Math.exp(slope * 30) - 1) * 100,
    ahead: aheadDays.map((d) => ({ days: d, factor: Math.exp(slope * d), band: resid * Math.sqrt(1 + d / window) })),
  };
}

// mcxGold10g: MCX gold (₹ per 10 g) or null. g: result of globalMetals().
export async function chennaiGold(mcxGold10g, g) {
  const landed10g = mcxGold10g || (g && g.expected);
  if (!landed10g) return null;
  const k24 = landed10g / 10, k22 = k24 * PURITY_22K;
  let projection = null;
  try { projection = projectTrend(await goldHistoryInr(120)); } catch {}
  return {
    source: mcxGold10g ? "MCX" : "COMEX",
    k24, k22, k24Gst: k24 * (1 + GOLD_GST), k22Gst: k22 * (1 + GOLD_GST),
    pctChange: g && g.expectedPct,
    projection: projection && {
      monthlyPct: projection.monthlyPct,
      ahead: projection.ahead.map((p) => ({ days: p.days, k22: k22 * p.factor, k24: k24 * p.factor, low: k22 * p.factor * Math.exp(-p.band), high: k22 * p.factor * Math.exp(p.band) })),
    },
  };
}
