// Parser for CAMS / KFintech "Detailed" Consolidated Account Statements (CAS).
// Works on positioned text from pdf.js: pages = [[{str, x, y, w}]].
// Rules ported from the open-source `casparser` project (MIT licence).

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = /^\s*(\d{1,2})[-\s]*([A-Za-z]{3})[-\s]*(\d{4})\b/;
const NUM_RE = /^\(?-?[\d,]*\d\.\d+\)?$|^\(?-?\d{1,3}(?:,\d{2,3})+\)?$/;
const FOLIO_RE = /Folio\s+No\s*:\s*(\d+(?:\s*\/\s*\d+)?)(?:.*?PAN\s*:\s*([A-Z]{5}\d{4}[A-Z]))?/i;
const ISIN_RE = /\bINF[0-9A-Z]{8}\d\b/;
const RTA_RE = /\b(CAMS|KFINTECH|KFIN|KARVY)\b/i;
const OPEN_RE = /Opening\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i;
const CLOSE_RE = /Closing\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i;
const NAV_RE = /NAV\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i;
const VAL_RE = /(?:Valuation|Market\s+Value)\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i;
const COST_RE = /Total\s+Cost\s+Value\s*:?\s*([\d,.]+)/i;
const PERIOD_RE = /(\d{2}-[A-Za-z]{3}-\d{4})\s+To\s+(\d{2}-[A-Za-z]{3}-\d{4})/i;
const AMC_RE = /^(.+?\s+(?:MF|Mutual\s*Fund|Fund\s*House))$/i;
const CODE_PREFIX_RE = /^\s*(?=[A-Z0-9 ]{0,40}[A-Z])[A-Z0-9]+(?: [A-Z0-9]+)*-/i;

export function isoDate(s) {
  const m = DATE_RE.exec(s || "");
  if (!m) return null;
  const mo = MON[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

function num(s) {
  if (s == null) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const v = parseFloat(s.replace(/[(),\s-]/g, ""));
  if (isNaN(v)) return null;
  return neg ? -v : v;
}

// Group text items into lines (top to bottom). Wide gaps become tabs.
export function toLines(pages) {
  const lines = [];
  pages.forEach((items, p) => {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      let row = rows.find((r) => Math.abs(r.y - it.y) <= 2.2);
      if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let text = "", lastEnd = null;
      const cells = [];
      for (const it of r.items) {
        const gap = lastEnd == null ? 0 : it.x - lastEnd;
        if (lastEnd == null || gap > 6) { if (lastEnd != null) text += "\t"; cells.push({ str: it.str.trim(), x: it.x }); }
        else { if (gap > 0.8) text += " "; cells[cells.length - 1].str = (cells[cells.length - 1].str + (gap > 0.8 ? " " : "") + it.str).trim(); }
        text += it.str;
        lastEnd = it.x + (it.w || 0);
      }
      lines.push({ text: text.replace(/ +/g, " ").trim(), cells, x: r.items[0].x, page: p });
    }
  });
  return lines;
}

export function transactionType(desc, units) {
  const d = (desc || "").toLowerCase();
  if (/(?:div\.|dividend|idcw).*?@\s*rs\.\s*[\d.]+/.test(d)) return /reinvest/.test(d) ? "DIVIDEND_REINVEST" : "DIVIDEND_PAYOUT";
  if (units == null) {
    if (d.includes("stt")) return "STT_TAX";
    if (d.includes("stamp")) return "STAMP_DUTY_TAX";
    if (d.includes("tds")) return "TDS_TAX";
    return "MISC";
  }
  const stp = /\bs\s*t\s*p\b|systematic\s+transfer/.test(d);
  if (units > 0) {
    if (d.includes("gift")) return "GIFT_IN";
    if (d.includes("switch") || stp) return d.includes("merger") ? "SWITCH_IN_MERGER" : "SWITCH_IN";
    if (d.includes("segregat")) return "SEGREGATION";
    if (d.includes("sip") || d.includes("systematic") || /instal+ment/.test(d) || /sys.+?invest/.test(d)) return "PURCHASE_SIP";
    return "PURCHASE";
  }
  if (units < 0) {
    if (d.includes("gift")) return "GIFT_OUT";
    if (/reversal|rejection|dishonoured|mismatch|insufficient\s+balance|payment\s+not\s+received/.test(d)) return "REVERSAL";
    if (d.includes("switch") || stp) return d.includes("merger") ? "SWITCH_OUT_MERGER" : "SWITCH_OUT";
    return "REDEMPTION";
  }
  return "UNKNOWN";
}

export function cleanSchemeName(raw) {
  let s = raw.split(/\s*-?\s*ISIN\s*:/i)[0];
  s = s.split(/\(\s*Advisor\s*:/i)[0].split(/Registrar\s*:/i)[0];
  s = s.replace(CODE_PREFIX_RE, "");
  s = s.replace(/\((formerly|erstwhile)[^)]*\)/gi, "").replace(/\((Demat|Non-Demat).*/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[^a-zA-Z0-9_)]+$/, "").trim();
}

const isLabel = (t) =>
  OPEN_RE.test(t) || CLOSE_RE.test(t) || /Folio\s+No/i.test(t) || /ISIN\s*:/i.test(t) || /Registrar\s*:/i.test(t) || /Nominee\s+\d/i.test(t);

export function parseCAS(pages) {
  const lines = toLines(pages);
  const all = lines.map((l) => l.text).join("\n");
  if (!/consolidated\s+account\s+(statement|summary)/i.test(all))
    throw new Error("This doesn't look like a CAMS or KFintech consolidated account statement.");
  if (!/Opening\s+Unit\s+Balance/i.test(all))
    throw new Error("This looks like a Summary statement. Request the Detailed CAS, which includes your transactions.");
  const pm = PERIOD_RE.exec(all);
  const period = pm ? { from: isoDate(pm[1]), to: isoDate(pm[2]) } : null;

  const folios = [];
  const warnings = [];
  let amc = null, folio = null, scheme = null, header = [], inTxns = false, txnX = null, lastTxn = null;

  const startScheme = () => {
    const text = header.join(" ").replace(/\s+/g, " ");
    const name = cleanSchemeName(text);
    if (!name) { warnings.push(`Couldn't read a fund name near: ${text.slice(0, 80)}`); scheme = null; return null; }
    const isin = (ISIN_RE.exec(text) || [])[0] || "";
    const after = text.split(/Registrar\s*:/i)[1] || text;
    const rta = ((RTA_RE.exec(after) || [])[1] || "").toUpperCase();
    scheme = { scheme: name, isin, rta, open: 0, close: null, valuation: {}, transactions: [] };
    folio.schemes.push(scheme);
    return scheme;
  };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], t = L.text;

    const fm = FOLIO_RE.exec(t);
    if (fm) {
      folio = { folio: fm[1].replace(/\s+/g, " "), amc: amc || "", pan: fm[2] || "", schemes: [] };
      folios.push(folio);
      header = []; inTxns = false; scheme = null;
      continue;
    }
    if (!t.includes(":") && t.length < 70 && AMC_RE.test(t) && !DATE_RE.test(t) && !inTxns) { amc = t.trim(); continue; }
    if (!folio) continue;

    const om = OPEN_RE.exec(t);
    if (om) {
      if (!scheme || scheme.transactions.length || scheme.close != null) startScheme();
      if (scheme) scheme.open = num(om[1]) || 0;
      inTxns = !!scheme; header = []; lastTxn = null;
      continue;
    }
    const cm = CLOSE_RE.exec(t);
    if (cm && scheme) {
      scheme.close = num(cm[1]);
      const tail = t + " " + (lines[i + 1] ? lines[i + 1].text : "");
      const nm = NAV_RE.exec(tail), vm = VAL_RE.exec(tail), cv = COST_RE.exec(tail);
      scheme.valuation = {
        date: nm ? isoDate(nm[1]) : vm ? isoDate(vm[1]) : null,
        nav: nm ? num(nm[2]) : null, value: vm ? num(vm[2]) : null, cost: cv ? num(cv[1]) : null,
      };
      inTxns = false; header = []; lastTxn = null;
      continue;
    }

    if (!inTxns) {
      // Scheme header text, possibly over several lines. Skip column headings, holder and nominee lines.
      if (/^Date\b.*\b(Transaction|Amount)\b/i.test(t) || /^\(INR\)/.test(t) || /Nominee\s+\d/i.test(t)) continue;
      const looksHeader = /ISIN\s*:|Registrar\s*:|Advisor\s*:/i.test(t) || CODE_PREFIX_RE.test(t);
      if (looksHeader || (header.length && header.length < 3 && !/ISIN|Registrar/i.test(header.join(" ")))) {
        header.push(t.replace(/\t/g, " "));
      }
      continue;
    }

    // Inside a transaction table
    const iso = isoDate(t);
    if (iso) {
      const parts = t.split("\t")
        .flatMap((p) => p.split(/\s+(?=\(?-?[\d,]*\d\.\d+\)?(?:\s|$))/))
        .map((s) => s.trim()).filter(Boolean);
      parts[0] = parts[0].replace(DATE_RE, "").trim();
      if (!parts[0]) parts.shift();
      const nums = [];
      while (parts.length && NUM_RE.test(parts[parts.length - 1]) && nums.length < 4) nums.unshift(parts.pop());
      const desc = parts.join(" ").replace(/\s+/g, " ").trim();
      let amount = null, units = null, nav = null, balance = null;
      if (nums.length >= 4) [amount, units, nav, balance] = nums.slice(-4).map(num);
      else if (nums.length === 3) [amount, units, nav] = nums.map(num);
      else if (nums.length === 2) [amount, units] = nums.map(num);
      else if (nums.length === 1) amount = num(nums[0]);
      lastTxn = { date: iso, description: desc, amount, units, nav, balance, type: transactionType(desc, units) };
      scheme.transactions.push(lastTxn);
      if (txnX == null && L.cells[1]) txnX = L.cells[1].x;
      continue;
    }
    // Wrapped description: text only, under the Transaction column
    if (lastTxn && !isLabel(t) && !/\d\.\d/.test(t) && (txnX == null || Math.abs(L.x - txnX) < 25)) {
      lastTxn.description = `${lastTxn.description} ${t.replace(/\t/g, " ")}`.trim();
      lastTxn.type = transactionType(lastTxn.description, lastTxn.units);
      continue;
    }
    // A new scheme starts inside the same folio
    if (/ISIN\s*:|Registrar\s*:/i.test(t) || CODE_PREFIX_RE.test(t)) {
      inTxns = false; header = [t.replace(/\t/g, " ")]; scheme = null; lastTxn = null;
    }
  }

  for (const f of folios) for (const s of f.schemes) {
    if (s.close == null) s.close = s.transactions.reduce((a, x) => a + (x.units || 0), s.open || 0);
  }
  const kept = folios.filter((f) => f.schemes.length);
  if (!kept.length) throw new Error("No funds found in this statement. Make sure it's the Detailed CAS.");
  return { period, folios: kept, warnings };
}
