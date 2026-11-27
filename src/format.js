const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const n3 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const bad = (v) => v == null || Number.isNaN(v);
export const money = (v, dp = 0) => (bad(v) ? "—" : (dp ? inr2 : inr0).format(v));
export const signed = (v, dp = 0) => (bad(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v), dp));
export const pct = (v, dp = 1) => (bad(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp) + "%");
export const num = (v) => (bad(v) ? "—" : n2.format(v));
export const units = (v) => (bad(v) ? "—" : n3.format(v));
export const shortDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—");
export function compactINR(v) {
  const a = Math.abs(v);
  if (a >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return "₹" + (v / 1e5).toFixed(1) + " L";
  if (a >= 1e3) return "₹" + (v / 1e3).toFixed(0) + "k";
  return "₹" + Math.round(v);
}
export function ago(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}
