// Numbers that help you decide. None of this is a buy or sell recommendation.

export const todayISO = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date
export const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5;

export function sma(values, n) {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

export function smaSeries(values, n) {
  const out = [];
  let s = 0;
  values.forEach((v, i) => {
    s += v;
    if (i >= n) s -= values[i - n];
    out.push(i >= n - 1 ? s / n : null);
  });
  return out;
}

export function rsi(values, n = 14) {
  if (values.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export const ret = (c, days) => (c.length <= days || !c[c.length - days - 1] ? null : (c[c.length - 1] / c[c.length - days - 1] - 1) * 100);

export function cagr(c, days) {
  if (c.length <= days || !c[c.length - days - 1]) return null;
  return (Math.pow(c[c.length - 1] / c[c.length - days - 1], 252 / days) - 1) * 100;
}

export function volatility(closes, days = 252) {
  const c = closes.slice(-days - 1);
  if (c.length < 30) return null;
  const r = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

export function maxDrawdown(c) {
  let peak = -1, mdd = 0;
  for (const x of c) { peak = Math.max(peak, x); if (peak > 0) mdd = Math.min(mdd, x / peak - 1); }
  return mdd * 100;
}

// Last value on or before `day` in sorted [[date, value]]
export function priceOn(series, day) {
  if (!series || !series.length) return null;
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans][1] : null;
}

function crossRecent(fast, slow, lookback = 20) {
  const pairs = fast.map((f, i) => [f, slow[i]]).filter(([f, s]) => f != null && s != null);
  const recent = pairs.slice(-(lookback + 1));
  for (let i = recent.length - 1; i > 0; i--) {
    const [f0, s0] = recent[i - 1], [f1, s1] = recent[i];
    if (f0 <= s0 && f1 > s1) return "golden";
    if (f0 >= s0 && f1 < s1) return "death";
  }
  return null;
}

export function indicators(history, ltp) {
  let closes = history.map((x) => x[1]);
  if (ltp && closes.length) closes = history[history.length - 1][0] === todayISO() ? [...closes.slice(0, -1), ltp] : [...closes, ltp];
  if (!closes.length) return {};
  const yr = closes.slice(-252);
  const hi = Math.max(...yr), lo = Math.min(...yr), last = closes[closes.length - 1];
  return {
    sma50: sma(closes, 50), sma200: sma(closes, 200), rsi14: rsi(closes.slice(-120)),
    high52: hi, low52: lo, fromHigh52: (last / hi - 1) * 100, fromLow52: (last / lo - 1) * 100,
    ret1m: ret(closes, 21), ret3m: ret(closes, 63), ret6m: ret(closes, 126), ret1y: ret(closes, 252),
    volatility: volatility(closes), cross: crossRecent(smaSeries(closes, 50), smaSeries(closes, 200)),
  };
}

const ORDER = { alert: 0, watch: 1, info: 2 };
const rs = (v) => "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function stockSignals(h, ind, levels, weight, vsNifty) {
  const out = [];
  const pnlPct = h.avgPrice ? (h.ltp / h.avgPrice - 1) * 100 : 0;
  if (levels.stop && h.ltp <= levels.stop) out.push(["alert", "Hit your stop level", `Price ${rs(h.ltp)} is at or below your stop of ${rs(levels.stop)}.`]);
  if (levels.target && h.ltp >= levels.target) out.push(["alert", "Reached your target", `Price ${rs(h.ltp)} is at or above your target of ${rs(levels.target)}.`]);
  if (weight >= 25) out.push(["alert", "Large share of your portfolio", `${weight.toFixed(0)}% of your share money is in this one holding.`]);
  else if (weight >= 15) out.push(["watch", "Heavy weight", `${weight.toFixed(0)}% of your share money is in this holding.`]);
  if (pnlPct <= -20) out.push(["alert", "Down sharply from your cost", `${pnlPct.toFixed(1)}% below your average price of ${rs(h.avgPrice)}.`]);
  else if (pnlPct <= -10) out.push(["watch", "Below your cost", `${pnlPct.toFixed(1)}% below your average price.`]);
  if (Math.abs(h.dayPct || 0) >= 4) out.push(["watch", "Big move today", `${h.dayPct > 0 ? "+" : ""}${h.dayPct.toFixed(1)}% today. Check the news.`]);
  if (ind.cross === "death") out.push(["watch", "50-day average fell below 200-day", "Often read as a weakening long-term trend."]);
  else if (ind.cross === "golden") out.push(["info", "50-day average rose above 200-day", "Often read as a strengthening long-term trend."]);
  if (ind.sma200 && h.ltp < ind.sma200 && ind.cross !== "death") out.push(["info", "Trading below its 200-day average", `200-day average is ${rs(ind.sma200)}.`]);
  if (ind.rsi14 != null && ind.rsi14 >= 70) out.push(["watch", "Rallied hard recently", `14-day RSI is ${ind.rsi14.toFixed(0)} (above 70 is often called overbought).`]);
  else if (ind.rsi14 != null && ind.rsi14 <= 30) out.push(["watch", "Sold off hard recently", `14-day RSI is ${ind.rsi14.toFixed(0)} (below 30 is often called oversold).`]);
  if (ind.fromHigh52 != null && ind.fromHigh52 >= -3) out.push(["info", "Near its 52-week high", `${Math.abs(ind.fromHigh52).toFixed(1)}% below the 52-week high.`]);
  if (ind.fromLow52 != null && ind.fromLow52 <= 5) out.push(["watch", "Near its 52-week low", `${ind.fromLow52.toFixed(1)}% above the 52-week low.`]);
  if (vsNifty != null && vsNifty <= -15) out.push(["watch", "Lagging the Nifty 50", `${Math.abs(vsNifty).toFixed(0)} points behind the Nifty 50 since you bought.`]);
  return out.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]).map(([level, title, why]) => ({ level, title, why }));
}

// cashflows: [[isoDate, amount]] — money in negative, money out (and final value) positive
export function xirr(flows) {
  if (flows.length < 2 || flows.every((f) => f[1] >= 0) || flows.every((f) => f[1] <= 0)) return null;
  const t0 = flows.reduce((m, f) => (f[0] < m ? f[0] : m), flows[0][0]);
  const npv = (r) => flows.reduce((s, [d, a]) => s + a / Math.pow(1 + r, daysBetween(t0, d) / 365), 0);
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  let mid = 0;
  for (let i = 0; i < 200; i++) {
    mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-6) break;
    if (flo * f < 0) { hi = mid; fhi = f; } else { lo = mid; flo = f; }
  }
  return mid * 100;
}

// Shares: daily value vs money put in vs same cash in the Nifty 50
export function sharePerformance(holdings, lotsById, histories, bench) {
  const lots = [];
  for (const [id, ls] of Object.entries(lotsById)) for (const l of ls) lots.push([l.date, id, +l.qty, +l.price]);
  if (!lots.length || !bench.length) return null;
  lots.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const start = lots[0][0];
  const days = [...new Set([...bench.map((x) => x[0]), ...Object.values(histories).flatMap((h) => h.map((x) => x[0]))])].filter((d) => d >= start).sort();
  const held = {}; let invested = 0, niftyUnits = 0, li = 0;
  const out = { dates: [], value: [], invested: [], nifty: [] }, flows = [];
  for (const d of days) {
    while (li < lots.length && lots[li][0] <= d) {
      const [ld, id, q, p] = lots[li++];
      held[id] = (held[id] || 0) + q; invested += q * p;
      const bp = priceOn(bench, ld); if (bp) niftyUnits += (q * p) / bp;
      flows.push([ld, -q * p]);
    }
    let v = 0;
    for (const [id, q] of Object.entries(held)) v += q * (priceOn(histories[id], d) ?? lotsById[id][0].price);
    const bp = priceOn(bench, d);
    out.dates.push(d); out.value.push(v); out.invested.push(invested); out.nifty.push(bp ? niftyUnits * bp : null);
  }
  const live = holdings.filter((h) => lotsById[h.id]).reduce((s, h) => s + h.quantity * h.ltp, 0);
  if (out.value.length) out.value[out.value.length - 1] = live;
  const t = todayISO();
  out.xirr = xirr([...flows, [t, live]]);
  const nv = out.nifty[out.nifty.length - 1];
  out.niftyXirr = nv ? xirr([...flows, [t, nv]]) : null;
  out.start = start;
  return out;
}

// Wishlisted shares you don't own yet: w = { ltp, dayPct, buyBelow, addedPrice, sinceAdded, niftySince }
export function wishlistSignals(w, ind) {
  const out = [];
  const ltp = w.ltp;
  if (ltp && w.buyBelow) {
    const gap = (ltp / w.buyBelow - 1) * 100;
    if (gap <= 0) out.push(["alert", "At or below your buy price", `Price ${rs(ltp)} is at or below the ${rs(w.buyBelow)} you wanted to buy at.`]);
    else if (gap <= 3) out.push(["watch", "Close to your buy price", `${gap.toFixed(1)}% above your buy price of ${rs(w.buyBelow)}.`]);
  }
  if (Math.abs(w.dayPct || 0) >= 4) out.push(["watch", "Big move today", `${w.dayPct > 0 ? "+" : ""}${w.dayPct.toFixed(1)}% today. Check the news.`]);
  if (w.sinceAdded != null && w.sinceAdded <= -15) out.push(["watch", "Much cheaper than when you added it", `${Math.abs(w.sinceAdded).toFixed(1)}% below the ${rs(w.addedPrice)} it was at when you wishlisted it.`]);
  else if (w.sinceAdded != null && w.sinceAdded >= 15) out.push(["info", "Up a lot since you added it", `${w.sinceAdded.toFixed(1)}% above the ${rs(w.addedPrice)} it was at when you wishlisted it.`]);
  if (w.sinceAdded != null && w.niftySince != null && w.sinceAdded - w.niftySince >= 10) out.push(["info", "Beating the Nifty 50 since you added it", `${(w.sinceAdded - w.niftySince).toFixed(0)} points ahead of the Nifty 50.`]);
  if (ind.cross === "death") out.push(["watch", "50-day average fell below 200-day", "Often read as a weakening long-term trend."]);
  else if (ind.cross === "golden") out.push(["watch", "50-day average rose above 200-day", "Often read as a strengthening long-term trend."]);
  if (ind.sma200 && ltp && ltp < ind.sma200 && ind.cross !== "death") out.push(["info", "Trading below its 200-day average", `200-day average is ${rs(ind.sma200)}.`]);
  if (ind.rsi14 != null && ind.rsi14 >= 70) out.push(["watch", "Rallied hard recently", `14-day RSI is ${ind.rsi14.toFixed(0)} (above 70 is often called overbought), so buying now means buying after a run-up.`]);
  else if (ind.rsi14 != null && ind.rsi14 <= 30) out.push(["watch", "Sold off hard recently", `14-day RSI is ${ind.rsi14.toFixed(0)} (below 30 is often called oversold).`]);
  if (ind.fromHigh52 != null && ind.fromHigh52 >= -3) out.push(["info", "Near its 52-week high", `${Math.abs(ind.fromHigh52).toFixed(1)}% below the 52-week high.`]);
  if (ind.fromLow52 != null && ind.fromLow52 <= 5) out.push(["watch", "Near its 52-week low", `${ind.fromLow52.toFixed(1)}% above the 52-week low.`]);
  else if (ind.fromHigh52 != null && ind.fromHigh52 <= -30) out.push(["info", "Far below its 52-week high", `${Math.abs(ind.fromHigh52).toFixed(0)}% below the 52-week high.`]);
  return out.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]).map(([level, title, why]) => ({ level, title, why }));
}
