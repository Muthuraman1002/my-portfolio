// Made-up holdings and prices so you can try the app before connecting anything.
import { addDays, todayISO } from "./analytics";

function rng(seed) { // mulberry32
  let a = 0; for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

function tradingDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const wd = new Date(d + "T00:00:00Z").getUTCDay(); if (wd && wd < 6) out.push(d); }
  return out;
}
function walk(seed, p0, mu, sig, days, market) {
  const r = rng(seed), dt = 1 / 252, out = [];
  let p = p0;
  days.forEach((d, i) => {
    if (i) p *= Math.exp((mu - sig * sig / 2) * dt + sig * Math.sqrt(dt) * (market ? 0.8 : 1) * gauss(r) + (market ? 0.6 * market[i] : 0));
    out.push([d, +p.toFixed(2)]);
  });
  return out;
}

export const STOCKS = [
  ["RELIANCE", "Reliance Industries", "Energy", 40, 2380, 2310, 0.1, 0.24, 640],
  ["HDFCBANK", "HDFC Bank", "Banking", 60, 1540, 1495, 0.08, 0.2, 520],
  ["INFY", "Infosys", "IT", 55, 1610, 1480, 0.02, 0.26, 700],
  ["TCS", "Tata Consultancy Services", "IT", 12, 3720, 3350, 0.03, 0.22, 600],
  ["ITC", "ITC", "FMCG", 220, 410, 395, 0.12, 0.18, 450],
  ["TATAMOTORS", "Tata Motors", "Auto", 90, 905, 640, -0.45, 0.38, 380],
  ["SUNPHARMA", "Sun Pharmaceutical", "Pharma", 35, 1290, 1050, 0.22, 0.22, 330],
  ["ITBEES", "Nippon India ETF Nifty IT", "ETF", 300, 38.7, 34, 0.04, 0.24, 260],
];
const EXTRA = [["BAJFINANCE", "Bajaj Finance", "Finance", 6900, 0.12, 0.3], ["ICICIBANK", "ICICI Bank", "Banking", 980, 0.18, 0.22], ["LT", "Larsen & Toubro", "Infra", 3300, 0.16, 0.24], ["MARUTI", "Maruti Suzuki", "Auto", 10400, 0.14, 0.24]];
const FUNDS = [
  ["900001", "Tata Small Cap Fund - Direct Plan - Growth", "Equity Scheme - Small Cap Fund", 28, 0.18, 0.22, 5000, 34, 0],
  ["900002", "Tata Digital India Fund - Direct Plan - Growth", "Equity Scheme - Sectoral/ Thematic", 41, 0.06, 0.24, 3000, 28, 25000],
  ["900003", "Tata ELSS Fund - Direct Plan - Growth", "Equity Scheme - ELSS", 36, 0.13, 0.17, 0, 0, 50000],
  ["900004", "Tata Nifty 50 Index Fund - Direct Plan - Growth", "Other Scheme - Index Funds", 130, 0.11, 0.15, 4000, 20, 0],
  ["900005", "Tata Money Market Fund - Direct Plan - Growth", "Debt Scheme - Money Market Fund", 4300, 0.072, 0.006, 0, 0, 60000],
];

let DEMO = null;
export function demo() {
  if (DEMO) return DEMO;
  const today = todayISO(), days = tradingDays(addDays(today, -365 * 4), today);
  const nifty = walk("NIFTY", 16000, 0.11, 0.15, days);
  const mkt = nifty.map((x, i) => (i ? Math.log(x[1] / nifty[i - 1][1]) : 0));
  const series = {}, list = [];
  [...STOCKS, ...EXTRA.map((e) => [e[0], e[1], e[2], 0, 0, e[3], e[4], e[5], 0])].forEach((s, i) => {
    let ser = walk(s[0], s[5], s[6], s[7], days, mkt);
    if (s[3]) { const idx = Math.max(0, ser.length - 1 - Math.floor((s[8] * 5) / 7)); const f = s[4] / ser[idx][1]; ser = ser.map(([d, p]) => [d, +(p * f).toFixed(2)]); }
    const id = `nse_cm|${1000 + i}`;
    series[id] = ser;
    list.push({ id, segment: "nse_cm", token: String(1000 + i), symbol: s[0], name: s[1], sector: s[2], held: s[3], avg: s[4], ago: s[8] });
  });
  const navs = {}, metas = {};
  FUNDS.forEach(([code, name, cat, p0, mu, sig]) => {
    navs[code] = code === "900004" ? nifty.map(([d, c], i) => [d, +((c * p0) / nifty[0][1] * (1 - 0.002 * i / 252)).toFixed(4)]) : walk(code, p0, mu, sig, days);
    metas[code] = { scheme_name: name, scheme_category: cat, fund_house: "Tata Mutual Fund" };
  });
  const schemes = FUNDS.map(([code, name, , , , , sip, months, lump]) => {
    const h = navs[code], at = (d) => { let v = h[0][1]; for (const [x, p] of h) { if (x > d) break; v = p; } return v; };
    const tx = [];
    if (lump) { const d = addDays(today, -Math.floor(30.4 * Math.max(months, 30) + 40)); const n = at(d); tx.push({ date: d, type: "PURCHASE", desc: "Purchase", amount: lump, units: +(lump / n).toFixed(3), nav: n }); }
    const [ty, tm] = today.split("-").map(Number);
    for (let m = months - 1; m >= 0; m--) {
      if (code === "900002" && m < 2) continue; // a SIP that stopped
      const k = ty * 12 + tm - 1 - m, d = `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}-05`;
      if (d > today) continue;
      const n = at(d); tx.push({ date: d, type: "PURCHASE_SIP", desc: "SIP Purchase", amount: sip, units: +(sip / n).toFixed(3), nav: n });
    }
    if (code === "900005") { const d = addDays(today, -200), n = at(d); tx.push({ date: d, type: "REDEMPTION", desc: "Redemption", amount: -20000, units: -+(20000 / n).toFixed(3), nav: n }); }
    tx.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { key: `DEMO-${code}`, folio: `1098${code.slice(-3)}/42`, amc: "Tata Mutual Fund", name, isin: "", code, units: tx.reduce((a, t) => a + t.units, 0), transactions: tx, source: "demo" };
  });
  DEMO = { series, list, nifty, navs, metas, schemes };
  return DEMO;
}

export function demoHoldings() {
  const D = demo();
  return D.list.filter((s) => s.held).map((s) => {
    const ser = D.series[s.id];
    return { id: s.id, segment: s.segment, token: s.token, symbol: s.symbol, name: s.name, sector: s.sector, quantity: s.held, avgPrice: s.avg, cost: s.held * s.avg, closePrice: ser[ser.length - 2][1] };
  });
}
export function demoQuote(id) {
  const ser = demo().series[id]; if (!ser) return null;
  const last = ser[ser.length - 1][1], prev = ser[ser.length - 2][1], yr = ser.slice(-252).map((x) => x[1]);
  return { ltp: last, change: last - prev, pctChange: (last / prev - 1) * 100, prevClose: prev, yearHigh: Math.max(...yr), yearLow: Math.min(...yr) };
}
export function demoBuyDate(symbol) {
  const D = demo(), s = D.list.find((x) => x.symbol === symbol); if (!s) return null;
  const ser = D.series[s.id]; return ser[Math.max(0, ser.length - 1 - Math.floor((s.ago * 5) / 7))][0];
}
