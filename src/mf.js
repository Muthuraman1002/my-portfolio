// Mutual funds: positions from transactions, returns vs Nifty, flags.
import { addDays, cagr, maxDrawdown, priceOn, ret, todayISO, volatility, xirr } from "./analytics";

const ORDER = { alert: 0, watch: 1, info: 2 };

// Turn a parsed CAS into stored schemes, keeping only the chosen fund house.
export function schemesFromCAS(parsed, amcFilter = "Tata") {
  const flt = (amcFilter || "").trim().toLowerCase();
  const schemes = [];
  for (const f of parsed.folios) {
    if (flt && !(f.amc || "").toLowerCase().includes(flt) && !f.schemes.some((s) => s.scheme.toLowerCase().includes(flt))) continue;
    for (const s of f.schemes) {
      if ((s.close || 0) <= 0.0005 && !s.transactions.length) continue;
      schemes.push({
        key: `${f.folio}|${s.isin || s.scheme}`, folio: f.folio, amc: f.amc, name: s.scheme, isin: s.isin, code: "",
        units: s.close, casCost: s.valuation.cost, casNav: s.valuation.nav, casDate: s.valuation.date,
        statementTo: (parsed.period && parsed.period.to) || parsed.statementDate || null,
        transactions: s.transactions.map((t) => ({ date: t.date, type: t.type, desc: t.description, amount: t.amount, units: t.units, nav: t.nav })),
        source: "cas",
      });
    }
  }
  return schemes;
}

// ---- SIP instalments after the last statement, from the folio's SIP registrations.
// How Tata/CAMS process a monthly SIP (checked against real statements):
//  - the debit happens on the SIP day, or the next business day if that's a holiday;
//  - units are allotted at the NAV of the next business day after the debit;
//  - stamp duty of 0.005% is included in the amount: amount x 0.005 / 100.005, rounded (Rs 4,500 buys Rs 4,499.78 of units);
//  - a top-up raises the amount every `topUpEvery` months, counted from the SIP's start month.
// Business days are the days that have a NAV, so holidays are handled by the NAV history itself.
const pad2 = (n) => String(n).padStart(2, "0");
const STAMP = 0.00005;

export function sipAmountOn(sip, monthIndex) {
  return sip.amount + (sip.topUpEvery > 0 ? sip.topUp * Math.floor(monthIndex / sip.topUpEvery) : 0);
}

// sip: { day, from, to, amount, topUp, topUpEvery }; after: last date the statement covers; navRows: [[iso, nav]] ascending.
export function sipInstalments(sip, after, navRows) {
  const out = [];
  if (!navRows || !navRows.length || !sip.from) return out;
  const firstOnOrAfter = (d) => { const i = navRows.findIndex((r) => r[0] >= d); return i < 0 ? -1 : i; };
  let y = +sip.from.slice(0, 4), m = +sip.from.slice(5, 7);
  for (let k = 0; k < 1200; k++, m === 12 ? (m = 1, y++) : m++) {
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const due = `${y}-${pad2(m)}-${pad2(Math.min(sip.day, days))}`;
    if (due < sip.from) continue;
    if (sip.to && due > sip.to) break;
    const debit = firstOnOrAfter(due);
    if (debit < 0 || debit + 1 >= navRows.length) break; // NAV for the allotment day isn't out yet
    const [date, nav] = navRows[debit + 1];
    if (date <= after) continue;                          // already in the statement
    const gross = sipAmountOn(sip, k);
    const stamp = Math.round((gross * STAMP) / (1 + STAMP) * 100) / 100;
    const net = Math.round((gross - stamp) * 100) / 100;
    out.push({ date, type: "PURCHASE_SIP", desc: `SIP instalment, estimated (Rs ${gross})`, amount: net, units: Math.round((net / nav) * 1000) / 1000, nav, estimated: true });
    out.push({ date, type: "STAMP_DUTY_TAX", desc: "Stamp duty, estimated", amount: stamp, units: null, nav: null, estimated: true });
  }
  return out;
}

// The next instalment of a SIP on or after `today`: { due, amount } or null once it has ended.
export function nextSip(sip, today) {
  let y = +sip.from.slice(0, 4), m = +sip.from.slice(5, 7);
  for (let k = 0; k < 1200; k++, m === 12 ? (m = 1, y++) : m++) {
    const due = `${y}-${pad2(m)}-${pad2(Math.min(sip.day, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
    if (sip.to && due > sip.to) return null;
    if (due >= today && due >= sip.from) {
      const nextTop = sip.topUpEvery > 0 ? (() => { const n = Math.ceil((k + 1) / sip.topUpEvery) * sip.topUpEvery; const ym = new Date(Date.UTC(+sip.from.slice(0, 4), +sip.from.slice(5, 7) - 1 + n, 1)); return `${ym.getUTCFullYear()}-${pad2(ym.getUTCMonth() + 1)}`; })() : null;
      return { due, amount: sipAmountOn(sip, k), nextTopUpMonth: k % (sip.topUpEvery || 1) === 0 && k > 0 ? due.slice(0, 7) : nextTop };
    }
  }
  return null;
}

// Units, cost and lots by first-in-first-out (as CAMS and the tax rules count it), and investor cash flows.
// lots: [date, units, costPerUnit]; a redemption takes the oldest units first. Stamp duty adds to the cost of that day's purchase.
export function position(txns) {
  let units = 0;
  const lots = [], flows = [];
  for (const t of [...txns].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const amt = t.amount || 0, u = t.units;
    if (t.type === "STAMP_DUTY_TAX") {
      const lot = lots.length ? lots[lots.length - 1] : null;
      if (lot && lot[1] > 0) lot[2] += Math.abs(amt) / lot[1];
      flows.push([t.date, -Math.abs(amt)]);
      continue;
    }
    if (t.type === "DIVIDEND_PAYOUT") { flows.push([t.date, Math.abs(amt)]); continue; }
    if (u == null) continue;
    if (u > 0) {
      units += u; lots.push([t.date, u, Math.abs(amt) / u]);
      if (t.type !== "DIVIDEND_REINVEST") flows.push([t.date, -Math.abs(amt)]);
    } else if (u < 0) {
      let out = -u;
      units -= out;
      while (out > 1e-9 && lots.length) {
        const take = Math.min(out, lots[0][1]);
        lots[0][1] -= take; out -= take;
        if (lots[0][1] <= 1e-9) lots.shift();
      }
      flows.push([t.date, Math.abs(amt)]);
    }
  }
  const open = lots.filter((l) => l[1] > 1e-6);
  const cost = open.reduce((a, l) => a + l[1] * l[2], 0);
  return { units: Math.max(units, 0), cost: Math.max(cost, 0), lots: open, flows };
}

function niftyValue(flows, bench) {
  let units = 0;
  for (const [d, a] of [...flows].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const p = priceOn(bench, d);
    if (p) units = Math.max(0, units + -a / p);
  }
  return bench.length ? units * bench[bench.length - 1][1] : null;
}

export const shortName = (name) => {
  let n = name.replace(/^Tata\s+/, "");
  for (const cut of [" - Direct Plan", " Direct Plan", " - Regular Plan", " Regular Plan", " - Direct", " - Regular", " Fund"]) {
    const i = n.indexOf(cut);
    if (i > 0) n = n.slice(0, i);
  }
  return n.replace(/[\s-]+$/, "") || name;
};

export function fundRows(schemes, navs, metas, bench) {
  const rows = [];
  const today = todayISO();
  for (const s of schemes) {
    const hist = navs[s.code] || [];
    const meta = metas[s.code] || {};
    let { units, cost, lots, flows } = position(s.transactions);
    if (!s.transactions.length) { units = s.units || 0; cost = s.casCost || 0; }
    if (units <= 0.0005) continue;
    const latest = hist.length ? hist[hist.length - 1] : [s.casDate, s.casNav];
    const prev = hist.length > 1 ? hist[hist.length - 2][1] : null;
    const nav = latest[1] || 0, value = units * nav;
    const category = meta.scheme_category || "";
    const x = flows.length ? xirr([...flows, [today, value]]) : null;
    const nv = bench.length && flows.length ? niftyValue(flows, bench) : null;
    const niftyX = nv ? xirr([...flows, [today, nv]]) : null;
    const yearAgo = addDays(today, -365), threeAgo = addDays(today, -3 * 365);
    const older = lots.filter((l) => l[0] <= yearAgo).reduce((a, l) => a + l[1], 0);
    const locked = /ELSS/i.test(category + s.name) ? lots.filter((l) => l[0] > threeAgo).reduce((a, l) => a + l[1], 0) : 0;
    const closes = hist.map((h) => h[1]);
    const sips = s.transactions.filter((t) => t.type === "PURCHASE_SIP").map((t) => t.date);
    rows.push({
      key: s.key, folio: s.folio, name: s.name, short: shortName(s.name), code: s.code, category,
      units, cost, avgNav: units ? cost / units : null, nav, navDate: latest[0],
      dayPct: prev ? (nav / prev - 1) * 100 : null, dayChange: prev ? units * (nav - prev) : 0,
      value, pnl: value - cost, pnlPct: cost ? (value / cost - 1) * 100 : null,
      xirr: x, niftyXirr: niftyX, first: s.transactions[0] ? s.transactions[0].date : null,
      ret3m: ret(closes, 63), ret1y: ret(closes, 252), ret3y: cagr(closes, 756),
      volatility: volatility(closes), maxDd1y: closes.length ? maxDrawdown(closes.slice(-252)) : null,
      over1yPct: units ? (older / units) * 100 : 0, elssLocked: locked,
      lastSip: sips[sips.length - 1] || null, sipCount: sips.length,
      spark: closes.slice(-63), source: s.source, hasNav: hist.length > 0,
    });
  }
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  for (const r of rows) { r.weight = (r.value / total) * 100; r.signals = fundSignals(r); }
  return rows;
}

const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function fundSignals(r) {
  const out = [];
  const equity = !/debt|money market|liquid|overnight|gilt/i.test(r.category);
  const today = todayISO();
  if (r.weight >= 40 && equity) out.push(["watch", "Large share of your funds", `${r.weight.toFixed(0)}% of your fund money is in this one fund.`]);
  if (r.pnlPct != null && r.pnlPct <= -10) out.push(["watch", "Below what you paid", `${r.pnlPct.toFixed(1)}% below your average cost.`]);
  if (r.xirr != null && r.niftyXirr != null && equity && r.xirr - r.niftyXirr <= -4 && r.first && r.first <= addDays(today, -365))
    out.push(["watch", "Lagging the Nifty 50", `Earning ${r.xirr.toFixed(1)}% a year; the same money in the Nifty 50 earned ${r.niftyXirr.toFixed(1)}%.`]);
  if (r.sipCount >= 3 && r.lastSip && r.lastSip < addDays(today, -45))
    out.push(["alert", "SIP may have stopped", `No SIP instalment since ${fmtDate(r.lastSip)}. Check your mandate or bank balance.`]);
  if (r.elssLocked > 0.001) out.push(["info", "Some units are still locked in", `${r.elssLocked.toFixed(2)} ELSS units are under the 3-year lock-in.`]);
  if (r.maxDd1y != null && r.maxDd1y <= -20 && equity) out.push(["info", "Big fall in the past year", `Fell up to ${Math.abs(r.maxDd1y).toFixed(0)}% from its peak in the last 12 months.`]);
  if (!r.hasNav) out.push(["watch", "No live NAV", "Couldn't find this fund's NAV; showing the statement value."]);
  return out.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]).map(([level, title, why]) => ({ level, title, why }));
}

export function fundPerformance(schemes, navs, bench) {
  const ss = schemes.filter((s) => s.transactions.length);
  if (!ss.length) return null;
  const start = ss.reduce((m, s) => (s.transactions[0].date < m ? s.transactions[0].date : m), ss[0].transactions[0].date);
  const days = [...new Set([...ss.flatMap((s) => (navs[s.code] || []).map((x) => x[0])), ...bench.map((x) => x[0])])].filter((d) => d >= start).sort();
  if (!days.length) return null;
  const all = ss.flatMap((s) => s.transactions.map((t) => [t.date, s.key, t])).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const held = {}, cost = {}, codeOf = {};
  ss.forEach((s) => { held[s.key] = 0; cost[s.key] = 0; codeOf[s.key] = s.code; });
  let nu = 0, i = 0;
  const out = { dates: [], value: [], invested: [], nifty: [] };
  for (const d of days) {
    while (i < all.length && all[i][0] <= d) {
      const [td, key, t] = all[i++];
      const u = t.units, amt = Math.abs(t.amount || 0), bp = priceOn(bench, td);
      if (u != null && u > 0) { held[key] += u; cost[key] += amt; if (bp && t.type !== "DIVIDEND_REINVEST") nu += amt / bp; }
      else if (u != null && u < 0) {
        if (held[key] > 0) cost[key] -= cost[key] * Math.min(1, -u / held[key]);
        held[key] = Math.max(0, held[key] + u);
        if (bp) nu = Math.max(0, nu - amt / bp);
      }
    }
    let v = 0;
    for (const [k, q] of Object.entries(held)) if (q > 0) v += q * (priceOn(navs[codeOf[k]], d) || 0);
    const bp = priceOn(bench, d);
    out.dates.push(d); out.value.push(v);
    out.invested.push(Object.values(cost).reduce((a, b) => a + b, 0));
    out.nifty.push(bp ? nu * bp : null);
  }
  const flows = ss.flatMap((s) => position(s.transactions).flows);
  const t = todayISO();
  out.xirr = xirr([...flows, [t, out.value[out.value.length - 1]]]);
  const nv = out.nifty[out.nifty.length - 1];
  out.niftyXirr = nv ? xirr([...flows, [t, nv]]) : null;
  out.start = start;
  return out;
}

// A fund added by hand: units worked out from the NAV on each date if not given.
export function manualScheme(code, name, entries, hist) {
  const rows = entries.map((e) => {
    const nav = priceOn(hist, e.date);
    if (!nav) throw new Error(`No NAV on or before ${e.date} for this fund.`);
    const amt = Number(e.amount);
    if (!amt) throw new Error("Each entry needs an amount.");
    const units = e.units ? Number(e.units) : +(Math.abs(amt) / nav).toFixed(3);
    return { date: e.date, type: amt < 0 ? "REDEMPTION" : "PURCHASE", desc: "Added by you", amount: amt, units: amt < 0 ? -Math.abs(units) : units, nav };
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { key: `manual|${code}`, folio: "—", amc: "", name, isin: "", code: String(code), units: rows.reduce((a, r) => a + r.units, 0), transactions: rows, source: "manual" };
}
