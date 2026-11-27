// Read-only client for the Kotak Neo Trade API (documented at github.com/Kotak-Neo/Kotak-Neo).
// Reads login, holdings, quotes, history and the stock list. The only order call is placeBuy(): delivery (CNC)
// BUY orders only, never sell, modify or cancel. The app calls it only after an on-screen confirmation and Face ID.

const LOGIN_URL = "https://mis.kotaksecurities.com/login/1.0/tradeApiLogin";
const VALIDATE_URL = "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate";

let last = 0;
async function gate() { // Kotak allows ~10 requests/second; stay under 8
  const wait = last + 125 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

async function call(url, opts, what) {
  await gate();
  let r;
  try { r = await fetch(url, opts); } catch (e) { throw new Error(`${what}: couldn't reach Kotak. Check your internet connection.`); }
  const text = await r.text().catch(() => "");
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  const msg = errorMessage(body);
  if (body && !Array.isArray(body) && (body.stat === "Not_Ok" || String(body.status || "").toLowerCase() === "error")) {
    const err = new Error(`${what}: ${msg || "unknown error"}`);
    err.session = /session|token|auth/i.test(msg || "");
    throw err;
  }
  if (r.status === 401 || r.status === 403) { const e = new Error(`${what}: ${msg || "your Kotak session has expired. Log in again."}`); e.session = true; throw e; }
  if (r.status >= 400) {
    const detail = msg || (text && !body ? text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "");
    throw new Error(`${what}: HTTP ${r.status}${detail ? ` — ${detail}` : ""}`);
  }
  if (!body) throw new Error(`${what}: Kotak replied with HTTP ${r.status}.`);
  return body;
}

// Kotak replies with errors in several shapes; pull out whatever message is there.
function errorMessage(b) {
  if (!b || typeof b !== "object") return "";
  const e = Array.isArray(b.error) ? b.error[0] : b.error;
  const parts = [
    b.emsg, b.message, b.errMsg, b.Error, b.description,
    b.fault && b.fault.message,
    e && (typeof e === "string" ? e : e.message || e.msg),
    e && e.code ? `(code ${e.code})` : b.code ? `(code ${b.code})` : "",
  ].filter((x) => x && typeof x === "string");
  return [...new Set(parts)].join(" ");
}

const f = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const SEGMENTS = new Set(["nse_cm", "bse_cm", "nse_fo", "bse_fo", "cde_fo", "mcx_fo"]);
const validSymbol = (id) => {
  const [seg, tok, extra] = String(id || "").split("|");
  return extra === undefined && SEGMENTS.has(seg) && !!tok && !/^(undefined|null|0|NaN)$/.test(tok.trim());
};
const badSymbolError = (e) => /neo ?symbol|invalid (instrument|symbol)|HTTP 400/i.test(e.message || "");

export class Kotak {
  constructor({ accessToken, mobile, ucc }) {
    this.token = (accessToken || "").trim();
    let m = (mobile || "").replace(/\s+/g, "");
    if (m && !m.startsWith("+")) m = "+91" + m.replace(/^0+/, "");
    this.mobile = m;
    this.ucc = (ucc || "").trim();
    this.session = null; // { token, sid, baseUrl, greeting, at }
  }

  get loggedIn() { return !!(this.session && this.session.baseUrl); }

  async login(totp, mpin) {
    const headers = { Authorization: this.token, "neo-fin-key": "neotradeapi", "Content-Type": "application/json" };
    const s1 = await call(LOGIN_URL, { method: "POST", headers, body: JSON.stringify({ mobileNumber: this.mobile, ucc: this.ucc, totp: String(totp).trim() }) }, "Login");
    const d1 = s1.data || {};
    if (!d1.token || !d1.sid) throw new Error(s1.message || "Login failed. Check your mobile number, client code and the 6-digit code.");
    const s2 = await call(VALIDATE_URL, { method: "POST", headers: { ...headers, sid: d1.sid, Auth: d1.token }, body: JSON.stringify({ mpin: String(mpin).trim() }) }, "MPIN");
    const d2 = s2.data || {};
    if (!d2.token || !d2.baseUrl) throw new Error(s2.message || "MPIN check failed.");
    this.session = { token: d2.token, sid: d2.sid, baseUrl: d2.baseUrl.replace(/\/+$/, ""), greeting: d2.greetingName, at: Date.now() };
    return this.session;
  }

  restore(session) { if (session && session.baseUrl) this.session = session; }
  logout() { this.session = null; }

  sessionHeaders() { return { Auth: this.session.token, Sid: this.session.sid, "neo-fin-key": "neotradeapi", accept: "application/json" }; }
  marketHeaders() { return { Authorization: this.token, "Content-Type": "application/json" }; }
  need() { if (!this.loggedIn) { const e = new Error("Log in to Kotak Neo first."); e.session = true; throw e; } }

  async holdings() {
    this.need();
    const body = await call(`${this.session.baseUrl}/portfolio/v1/holdings`, { headers: this.sessionHeaders() }, "Holdings");
    return (body.data || []).filter((h) => f(h.quantity) > 0).map((h) => {
      const seg = h.exchangeSegment || "nse_cm";
      const sym = h.displaySymbol || h.symbol || h.commonScripCode;
      const qty = f(h.quantity), avg = f(h.averagePrice);
      // instrumentToken is the order-API token; quotes and history want the scrip-master pSymbol,
      // which holdings return as exchangeIdentifier. id stays on instrumentToken so saved lots still match.
      const pSymbol = String(h.exchangeIdentifier || h.instrumentToken || "").trim();
      return {
        id: `${seg}|${h.instrumentToken}`, quoteId: `${seg}|${pSymbol}`, segment: seg, token: pSymbol, symbol: sym,
        name: h.instrumentName || sym, sector: h.sector || "Others", quantity: qty, avgPrice: avg,
        cost: f(h.holdingCost) || qty * avg, closePrice: f(h.closingPrice),
      };
    });
  }

  // ids are "segment|pSymbol". One bad symbol makes Kotak reject the whole request with
  // HTTP 400 "Invalid neo symbol values", so bad-looking ids are dropped and a rejected
  // batch is retried one symbol at a time, skipping any symbol Kotak still refuses.
  async quotes(ids) {
    this.need();
    const out = {};
    const valid = [...new Set(ids)].filter(validSymbol);
    const read = (body) => {
      for (const q of Array.isArray(body) ? body : (body && body.data) || []) {
        if (!q || q.exchange_token == null) continue;
        const o = q.ohlc || {};
        out[`${q.exchange}|${q.exchange_token}`] = {
          ltp: f(q.ltp), change: f(q.change), pctChange: f(q.per_change), prevClose: f(o.close),
          yearHigh: f(q.year_high) || null, yearLow: f(q.year_low) || null,
        };
      }
    };
    const fetchQuotes = (list) => call(`${this.session.baseUrl}/script-details/1.0/quotes/neosymbol/${list.map(encodeURIComponent).join(",")}/all`, { headers: this.marketHeaders() }, "Prices");
    for (let i = 0; i < valid.length; i += 20) {
      const chunk = valid.slice(i, i + 20);
      try { read(await fetchQuotes(chunk)); }
      catch (e) {
        if (e.session || !badSymbolError(e)) throw e;
        for (const id of chunk) {
          try { read(await fetchQuotes([id])); }
          catch (e2) { if (e2.session || !badSymbolError(e2)) throw e2; console.warn(`Kotak has no quote for ${id}`); }
        }
      }
    }
    return out;
  }

  // Daily closes. Kotak allows at most 180 days per daily request, so ranges are split.
  async history(segment, token, from, to) {
    this.need();
    const series = {};
    let cur = from;
    while (cur <= to) {
      const end = new Date(Math.min(Date.parse(cur) + 179 * 864e5, Date.parse(to))).toISOString().slice(0, 10);
      const qs = `neosymbol=${encodeURIComponent(`${segment}|${token}`)}&fromdate=${cur}&todate=${end}&interval=D`;
      const body = await call(`${this.session.baseUrl}/market-data/1.0/historical/details?${qs}`, { headers: this.marketHeaders() }, "Price history");
      for (const c of (body.data && body.data.candles) || []) series[String(c[0]).slice(0, 10)] = f(c[4]);
      cur = new Date(Date.parse(end) + 864e5).toISOString().slice(0, 10);
    }
    return Object.entries(series).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  // Nearest-expiry MCX futures for the given commodities (e.g. GOLD, SILVER), from Kotak's MCX contract list.
  async mcxFutures(names) {
    this.need();
    const body = await call(`${this.session.baseUrl}/script-details/1.0/masterscrip/file-paths`, { headers: this.marketHeaders() }, "MCX contracts");
    const paths = (body.data && body.data.filesPaths) || [];
    const url = paths.find((p) => /\/mcx_fo[^/]*\.csv$/.test(p));
    if (!url) throw new Error("Kotak didn't return the MCX contract list.");
    const lines = (await (await fetch(url)).text()).split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.trim().replace(/;$/, ""));
    const iTok = head.indexOf("pSymbol"), iName = head.indexOf("pSymbolName"), iTs = head.indexOf("pTrdSymbol"), iType = head.indexOf("pInstType"), iExp = head.indexOf("lExpiryDate");
    const now = Date.now() / 1000, want = new Set(names), best = {};
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      const name = (c[iName] || "").trim();
      if (!want.has(name) || !(c[iType] || "").trim().startsWith("FUT")) continue;
      const exp = Number(c[iExp]);
      if (!(exp > now)) continue;
      if (!best[name] || exp < best[name].expiry) best[name] = { id: `mcx_fo|${(c[iTok] || "").trim()}`, token: (c[iTok] || "").trim(), symbol: (c[iTs] || "").trim(), expiry: exp };
    }
    return best;
  }

  // ---------- buying
  // Trading symbols (e.g. "ITBEES-EQ") by pSymbol for one segment, from Kotak's scrip master. Cached by the caller.
  async tradingSymbols(segment) {
    this.need();
    const body = await call(`${this.session.baseUrl}/script-details/1.0/masterscrip/file-paths`, { headers: this.marketHeaders() }, "Stock list");
    const url = ((body.data && body.data.filesPaths) || []).find((p) => new RegExp(`/${segment}[^/]*\\.csv$`).test(p));
    if (!url) throw new Error(`Kotak didn't return the ${segment} stock list.`);
    const lines = (await (await fetch(url)).text()).split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.trim().replace(/;$/, ""));
    const iSym = head.indexOf("pSymbol"), iTs = head.indexOf("pTrdSymbol");
    const out = {};
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      const k = (c[iSym] || "").trim(), ts = (c[iTs] || "").trim();
      if (k && ts) out[k] = ts;
    }
    return out;
  }

  // Delivery (CNC) buy. order: { segment, tradingSymbol, qty, type: "L" | "MKT", price, amo }
  // Returns Kotak's order number. Kotak rejects bad orders with stat "Not_Ok", which call() turns into an error.
  async placeBuy({ segment, tradingSymbol, qty, type, price, amo }) {
    this.need();
    if (!["nse_cm", "bse_cm"].includes(segment)) throw new Error("Only NSE and BSE shares can be bought here.");
    if (!tradingSymbol) throw new Error("Couldn't find this stock's trading symbol.");
    if (!(Number.isInteger(qty) && qty > 0)) throw new Error("Quantity must be a whole number above zero.");
    if (type === "L" && !(price > 0)) throw new Error("Enter a limit price.");
    const j = {
      am: amo ? "YES" : "NO", dq: "0", es: segment, mp: "0", pc: "CNC", pf: "N",
      pr: type === "L" ? price.toFixed(2) : "0", pt: type === "L" ? "L" : "MKT", qt: String(qty), rt: "DAY", tp: "0", ts: tradingSymbol, tt: "B",
    };
    const body = await call(`${this.session.baseUrl}/quick/order/rule/ms/place`, {
      method: "POST",
      headers: { ...this.sessionHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: `jData=${encodeURIComponent(JSON.stringify(j))}`,
    }, "Order");
    if (!body.nOrdNo) throw new Error(`Order: Kotak didn't confirm the order${errorMessage(body) ? ` — ${errorMessage(body)}` : ""}. Check the Kotak Neo app before trying again.`);
    return String(body.nOrdNo);
  }

  // Today's orders, newest first.
  async orders() {
    this.need();
    const body = await call(`${this.session.baseUrl}/quick/user/orders`, { headers: this.sessionHeaders() }, "Orders");
    return (body.data || []).map((o) => ({
      no: String(o.nOrdNo), status: String(o.ordSt || "").toLowerCase(), reason: o.rejRsn || "", symbol: o.trdSym, segment: o.exSeg,
      side: o.trnsTp, type: o.prcTp, qty: f(o.qty), filled: f(o.fldQty), price: f(o.prc), avgPrice: f(o.avgPrc), amo: o.ordGenTp === "AMO", at: o.ordDtTm || "",
    })).reverse();
  }

  // NSE stock list for "check any stock" (a CSV of a few MB, cached by the caller)
  async stockList() {
    this.need();
    const body = await call(`${this.session.baseUrl}/script-details/1.0/masterscrip/file-paths`, { headers: this.marketHeaders() }, "Stock list");
    const paths = (body.data && body.data.filesPaths) || [];
    const url = paths.find((p) => /\/nse_cm[^/]*\.csv$/.test(p));
    if (!url) throw new Error("Kotak didn't return an NSE stock list.");
    const text = await (await fetch(url)).text();
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.trim().replace(/;$/, ""));
    const ix = (k) => head.indexOf(k);
    const iSym = ix("pSymbol"), iTs = ix("pTrdSymbol"), iName = ix("pSymbolName"), iGrp = ix("pGroup");
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      if (c.length < head.length / 2) continue;
      const grp = iGrp >= 0 ? (c[iGrp] || "").trim() : "EQ";
      if (grp && !["EQ", "BE", "BZ", "SM", "ST"].includes(grp)) continue;
      const ts = (c[iTs] || "").trim();
      out.push({ id: `nse_cm|${(c[iSym] || "").trim()}`, segment: "nse_cm", token: (c[iSym] || "").trim(), tradingSymbol: ts, symbol: ts.replace(/-(EQ|BE)$/, ""), name: (c[iName] || ts).trim() });
    }
    return out;
  }
}
