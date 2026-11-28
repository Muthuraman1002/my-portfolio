import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useData } from "../data";
import { useTheme, tone } from "../theme";
import { Button, Card, Field, H, Notice, Row, Segmented, Sheet, SignalList, T, Tile, Tiles } from "../components/ui";
import { LineChart } from "../components/charts";
import { money, num, pct, shortDate, signed, units, ago } from "../format";
import * as M from "../market";
import { BuySheet } from "./Buy";
import { todayISO } from "../analytics";

function News({ query }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { let on = true; M.news(query).then((x) => on && setItems(x)).catch(() => on && setErr("Couldn't load news. Check your internet connection.")); return () => { on = false; }; }, [query]);
  const t = useTheme();
  if (err) return <T muted>{err}</T>;
  if (!items) return <T muted>Loading news…</T>;
  if (!items.length) return <T muted>No recent news.</T>;
  return items.map((n, i) => (
    <Pressable key={i} onPress={() => Linking.openURL(n.link)} style={{ paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
      <T weight="500">{n.title}</T>
      <T size={12} muted>{[n.source, ago(n.ts)].filter(Boolean).join(", ")}</T>
    </Pressable>
  ));
}

const RANGES = [["63", "3M"], ["126", "6M"], ["252", "1Y"], ["504", "2Y"]];

function addToCompare(data, item) {
  const list = data.user.watchlist || [];
  if (list.some((x) => x.id === item.id)) return "Already in your comparison.";
  data.saveWatchlist([...list.slice(-5), { id: item.id, symbol: item.symbol, name: item.name }]);
  return "Added to Compare on the Overview tab.";
}

// ---------------------------------------------------------------- wishlist
function WishlistBox({ item, ltp }) {
  const data = useData();
  const t = useTheme();
  const w = data.wishItem(item.id);
  const cats = data.user.wishCategories || [];
  const [cat, setCat] = useState(w ? w.category : cats[0] || "");
  const [newCat, setNewCat] = useState("");
  const [buy, setBuy] = useState(w && w.buyBelow ? String(w.buyBelow) : "");
  const [msg, setMsg] = useState("");
  const chosen = newCat.trim() || cat;

  const add = async () => {
    if (!chosen) return setMsg("Pick a category or type a new one.");
    await data.addToWishlist(item, chosen, ltp);
    const b = parseFloat(buy);
    if (b > 0) await data.updateWishItem(item.id, { buyBelow: b });
    setNewCat(""); setCat(chosen); setMsg(`Added to ${chosen}.`);
  };
  const save = async () => {
    const b = parseFloat(buy);
    await data.updateWishItem(item.id, { category: chosen, buyBelow: b > 0 ? b : null });
    setNewCat(""); setCat(chosen); setMsg("Saved");
  };

  return (
    <>
      {w && <T size={13} muted style={{ marginBottom: 8 }}>Added {shortDate(w.addedAt)}{w.addedPrice ? ` at ${money(w.addedPrice, 2)}` : ""}.</T>}
      <T size={13} muted style={{ marginBottom: 6 }}>Category</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {cats.map((c) => (
          <Pressable key={c} onPress={() => { setCat(c); setNewCat(""); }}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: chosen === c ? t.brand : t.line, backgroundColor: chosen === c ? t.brandSoft : "transparent" }}>
            <T size={13} weight={chosen === c ? "700" : "400"} color={chosen === c ? t.brand : undefined}>{c}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Or a new category" value={newCat} onChangeText={setNewCat} autoCapitalize="words" placeholder="e.g. Banking" /></View>
        <View style={{ flex: 1 }}><Field label="Buy at or below (₹)" keyboardType="decimal-pad" value={buy} onChangeText={setBuy} placeholder="Optional" /></View>
      </View>
      {w ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Save" onPress={save} style={{ flex: 1 }} />
          <Button kind="ghost" danger title="Remove" onPress={async () => { await data.removeFromWishlist(item.id); setMsg("Removed from your wishlist."); }} style={{ flex: 1 }} />
        </View>
      ) : <Button title={chosen ? `Add to ${chosen}` : "Add to wishlist"} onPress={add} />}
      {msg ? <T size={13} color={t.gain} style={{ marginTop: 6 }}>{msg}</T> : null}
    </>
  );
}

// ---------------------------------------------------------------- stock
export function StockSheet({ item, onClose }) {
  const data = useData();
  const t = useTheme();
  const hd = item && data.shares ? data.shares.holdings.find((h) => h.id === item.id) : null;
  const wrow = item && data.wishView ? data.wishView.rows.find((w) => w.id === item.id) : null;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [range, setRange] = useState("252");
  const [plan, setPlan] = useState({ target: "", stop: "", note: "" });
  const [lots, setLots] = useState([]);
  const [msg, setMsg] = useState("");
  const [buying, setBuying] = useState(false);
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (!item) return;
    setD(null); setErr(null); setMsg("");
    data.stockDetail(item).then(setD).catch((e) => setErr(e.message));
    if (hd) {
      setPlan({ target: hd.levels.target ? String(hd.levels.target) : "", stop: hd.levels.stop ? String(hd.levels.stop) : "", note: hd.levels.note || "" });
      setLots(hd.lots.map((l) => ({ date: l.date, qty: String(l.qty), price: String(+(+l.price).toFixed(2)) })));
    }
  }, [item && item.id]); // eslint-disable-line

  if (!item) return null;
  const ltp = hd ? hd.ltp : d && d.ltp;
  const q = d ? d.quote : {};
  const dayPct = hd ? hd.dayPct : q.pctChange;
  const ind = (hd && hd.ind) || (d && d.ind) || {};
  const n = +range;
  const labels = d ? d.dates.slice(-n) : [];
  const series = d ? [
    { label: "Price", data: d.close.slice(-n), color: t.brand },
    { label: "50-day avg", data: d.sma50.slice(-n), color: t.flag, width: 1.3 },
    { label: "200-day avg", data: d.sma200.slice(-n), color: t.muted, width: 1.3 },
    ...(hd ? [{ label: "Your avg cost", data: labels.map(() => hd.avgPrice), color: t.loss, dash: "5,4", width: 1.2 }] : []),
    ...(hd && hd.levels.target ? [{ label: "Target", data: labels.map(() => hd.levels.target), color: t.gain, dash: "2,3", width: 1.2 }] : []),
    ...(hd && hd.levels.stop ? [{ label: "Stop", data: labels.map(() => hd.levels.stop), color: t.loss, dash: "2,3", width: 1.2 }] : []),
  ] : [];
  const lotQty = lots.reduce((a, l) => a + (+l.qty || 0), 0);

  const savePlan = async () => {
    const tg = parseFloat(plan.target), st = parseFloat(plan.stop);
    await data.saveLevels(item.id, { ...(tg > 0 ? { target: tg } : {}), ...(st > 0 ? { stop: st } : {}), ...(plan.note.trim() ? { note: plan.note.trim() } : {}) });
    setMsg("Plan saved");
  };
  const saveLots = async () => {
    const rows = [];
    for (const l of lots) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || l.date > todayISO()) return setMsg("Use dates like 2024-06-15, not in the future.");
      if (!(+l.qty > 0) || !(+l.price > 0)) return setMsg("Each purchase needs a quantity and price above zero.");
      rows.push({ date: l.date, qty: +l.qty, price: +l.price });
    }
    await data.saveLots(item.id, rows.sort((a, b) => (a.date < b.date ? -1 : 1)));
    setMsg("Purchases saved");
  };

  const canBuy = data.user.settings.allowBuying && !data.isDemo && /^(nse|bse)_cm\|/.test(item.id);
  const inWish = !!data.wishItem(item.id);
  const dayAbs = hd ? hd.dayChange : q.change;
  const pos52 = ind.low52 && ind.high52 && ltp ? Math.max(0, Math.min(1, (ltp - ind.low52) / (ind.high52 - ind.low52 || 1))) : null;
  const footer = (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: t.surface }}>
      <Button kind="ghost" title={inWish ? "In your wishlist" : "Add to wishlist"} style={{ flex: 1 }} onPress={() => setOpen((o) => ({ ...o, wish: true }))} />
      {canBuy ? <Button title={`Buy ${item.symbol}`} style={{ flex: 1 }} disabled={!ltp} onPress={() => setBuying(true)} />
        : <Button kind="ghost" title="Add to compare" style={{ flex: 1 }} onPress={() => setMsg(addToCompare(data, item))} />}
    </View>
  );
  const fold = (key, title, summary, body) => (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
      <Pressable onPress={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}>
        <T weight="600" style={{ flex: 1 }}>{title}</T>
        <T size={13} muted numberOfLines={1} style={{ maxWidth: "60%" }}>{summary}</T>
        <T size={16} color={t.muted}>  {open[key] ? "▾" : "›"}</T>
      </Pressable>
      {open[key] ? <View style={{ paddingBottom: 14 }}>{body}</View> : null}
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title={item.symbol} footer={footer}>
      <T size={13} muted>{item.name}{hd && hd.sector ? ` · ${hd.sector}` : ""}</T>
      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <T size={30} weight="800" style={{ letterSpacing: -0.5 }}>{money(ltp, 2)}</T>
        {dayPct != null && <T size={14} weight="600" color={tone(t, dayPct)}>{dayAbs != null ? `${signed(dayAbs, 2)} ` : ""}({pct(dayPct, 2)}) today</T>}
      </View>
      {err && <Notice tone="error">{err}</Notice>}
      {buying && <BuySheet item={hd ? { ...item, ...hd } : item} ltp={ltp} onClose={() => setBuying(false)} />}

      <Tiles>
        {hd ? <>
          <Tile label="Your value" value={money(hd.value)} sub={`${units(hd.quantity)} shares`} />
          <Tile label="Profit" value={signed(hd.pnl)} color={tone(t, hd.pnl)} sub={`${pct(hd.pnlPct)} on ${money(hd.avgPrice, 2)} avg`} />
          <Tile label="Since you bought" value={pct(hd.sinceFirst)} color={tone(t, hd.sinceFirst)} sub={hd.niftySinceFirst != null ? `Nifty 50 ${pct(hd.niftySinceFirst)} same time` : null} />
        </> : <>
          <Tile label="1 month" value={pct(ind.ret1m)} color={tone(t, ind.ret1m)} />
          <Tile label="1 year" value={pct(ind.ret1y)} color={tone(t, ind.ret1y)} />
          <Tile label="RSI (14-day)" value={ind.rsi14 == null ? "—" : ind.rsi14.toFixed(0)} sub={ind.rsi14 >= 70 ? "rallied hard" : ind.rsi14 <= 30 ? "sold off hard" : "neutral range"} />
        </>}
        <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: t.ground, borderRadius: 10, padding: 10 }}>
          <T size={12} muted>52-week range</T>
          <T size={15} weight="700" style={{ marginTop: 2 }} numberOfLines={1}>{ind.low52 ? `${money(ind.low52)} – ${money(ind.high52)}` : "—"}</T>
          {pos52 != null && <View style={{ height: 4, backgroundColor: t.line, borderRadius: 2, marginTop: 6 }}><View style={{ width: `${Math.max(3, pos52 * 100)}%`, height: 4, backgroundColor: pos52 < 0.15 ? t.flag : t.brand, borderRadius: 2 }} /></View>}
        </View>
      </Tiles>

      <View style={{ marginTop: 16 }}><Segmented small options={RANGES} value={range} onChange={setRange} /></View>
      <View style={{ marginTop: 10 }}>{d ? <LineChart labels={labels} series={series} yFmt={(v) => "₹" + num(v)} /> : <T muted>Loading chart…</T>}</View>

      {hd && hd.signals.length > 0 && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={hd.signals} /></>}
      {!hd && wrow && !(data.wishView && data.wishView.needLogin) && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={wrow.signals} /></>}

      <View style={{ marginTop: 12 }}>
        {hd && fold("plan", "Your plan", [hd.levels.target ? `Target ${money(hd.levels.target)}` : "", hd.levels.stop ? `Stop ${money(hd.levels.stop)}` : ""].filter(Boolean).join(" · ") || "Set a target or stop", <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="Target price (₹)" keyboardType="decimal-pad" value={plan.target} onChangeText={(v) => setPlan({ ...plan, target: v })} /></View>
            <View style={{ flex: 1 }}><Field label="Stop price (₹)" keyboardType="decimal-pad" value={plan.stop} onChangeText={(v) => setPlan({ ...plan, stop: v })} /></View>
          </View>
          <Field label="Why you hold it" multiline value={plan.note} onChangeText={(v) => setPlan({ ...plan, note: v })} />
          <Button title="Save plan" onPress={savePlan} />
        </>)}
        {hd && fold("lots", "Your purchases", `${hd.lots.length} buy${hd.lots.length === 1 ? "" : "s"} since ${shortDate(hd.firstBuy)}${hd.lotsEstimated ? " (estimated)" : ""}`, <>
          {hd.lotsEstimated && <Notice tone="warn">This uses an estimated date. Enter when you actually bought, so your returns and chart are exact.</Notice>}
          {Math.abs(lotQty - hd.quantity) > 1e-6 && <Notice tone="warn">These add up to {num(lotQty)} shares; your account shows {num(hd.quantity)}.</Notice>}
          {lots.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-end" }}>
              <View style={{ flex: 1.4 }}><Field label={i ? " " : "Date"} placeholder="2024-06-15" value={l.date} onChangeText={(v) => setLots(lots.map((x, j) => (j === i ? { ...x, date: v } : x)))} /></View>
              <View style={{ flex: 1 }}><Field label={i ? " " : "Qty"} keyboardType="decimal-pad" value={l.qty} onChangeText={(v) => setLots(lots.map((x, j) => (j === i ? { ...x, qty: v } : x)))} /></View>
              <View style={{ flex: 1.2 }}><Field label={i ? " " : "Price (₹)"} keyboardType="decimal-pad" value={l.price} onChangeText={(v) => setLots(lots.map((x, j) => (j === i ? { ...x, price: v } : x)))} /></View>
              <Pressable accessibilityLabel="Remove purchase" onPress={() => setLots(lots.filter((_, j) => j !== i))} style={{ paddingBottom: 22, paddingHorizontal: 4 }}><T muted size={20}>×</T></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button kind="ghost" title="Add purchase" style={{ flex: 1 }} onPress={() => setLots([...lots, { date: "", qty: "", price: "" }])} />
            <Button title="Save purchases" style={{ flex: 1 }} onPress={saveLots} />
          </View>
        </>)}
        {fold("wish", "Wishlist", inWish ? `In ${data.wishItem(item.id).category}` : "Not added", <WishlistBox key={item.id} item={item} ltp={ltp} />)}
        {fold("nums", "Key numbers", "returns, averages, RSI", <>
          <Row label="1 month" value={pct(ind.ret1m)} color={tone(t, ind.ret1m)} />
          <Row label="3 months" value={pct(ind.ret3m)} color={tone(t, ind.ret3m)} />
          <Row label="1 year" value={pct(ind.ret1y)} color={tone(t, ind.ret1y)} />
          <Row label="50 / 200-day average" value={ind.sma50 ? `${money(ind.sma50)} / ${ind.sma200 ? money(ind.sma200) : "—"}` : "—"} />
          <Row label="RSI (14-day)" value={ind.rsi14 == null ? "—" : ind.rsi14.toFixed(0)} />
          <Row label="Yearly volatility" value={ind.volatility == null ? "—" : ind.volatility.toFixed(0) + "%"} />
          {hd && <Row label="Share of your stocks" value={hd.weight.toFixed(1) + "%"} last />}
        </>)}
        {fold("news", "News", "last 14 days", <News query={M.stockNewsQuery(item.symbol, item.name)} />)}
      </View>
      {msg ? <T color={t.gain} style={{ marginTop: 8 }}>{msg}</T> : null}
      {canBuy && <Button kind="ghost" title="Add to compare" style={{ marginTop: 12 }} onPress={() => setMsg(addToCompare(data, item))} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- fund
const TXN = { PURCHASE: "Lump sum", PURCHASE_SIP: "SIP", REDEMPTION: "Withdrawal", SWITCH_IN: "Switch in", SWITCH_OUT: "Switch out", SWITCH_IN_MERGER: "Merger in", SWITCH_OUT_MERGER: "Merger out", DIVIDEND_PAYOUT: "Dividend paid", DIVIDEND_REINVEST: "Dividend reinvested", GIFT_IN: "Gift in", GIFT_OUT: "Gift out", REVERSAL: "Reversal" };
const monthYear = (ym) => (ym ? new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "");
const dayMonth = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// One year of transactions: a summary line that opens to the list.
function TxnYear({ year, items, open: initial }) {
  const t = useTheme();
  const [open, setOpen] = useState(initial);
  const inv = items.filter((x) => (x.units || 0) > 0).reduce((a, x) => a + Math.abs(x.amount || 0), 0);
  const out = items.filter((x) => (x.units || 0) < 0).reduce((a, x) => a + Math.abs(x.amount || 0), 0);
  const sips = items.filter((x) => x.type === "PURCHASE_SIP").length;
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11 }}>
        <T size={16} weight="700" style={{ width: 56 }}>{year}</T>
        <T size={13} muted style={{ flex: 1 }}>{[sips ? `${sips} SIP${sips === 1 ? "" : "s"}` : "", inv ? `${money(inv)} in` : "", out ? `${money(out)} out` : ""].filter(Boolean).join(" · ")}</T>
        <T size={16} color={t.muted}>{open ? "▾" : "▸"}</T>
      </Pressable>
      {open && items.map((x, i) => {
        const outFlow = (x.units || 0) < 0;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingLeft: 56 }}>
            <View style={{ flex: 1 }}>
              <T size={14} weight="600">{TXN[x.type] || x.type}{x.estimated ? <T size={10} weight="800" color={t.flag}>  ESTIMATED</T> : null}</T>
              <T size={12} muted>{dayMonth(x.date)}{x.nav ? ` · ${units(Math.abs(x.units))} units at ${money(x.nav, 2)}` : ""}</T>
            </View>
            <T size={14} weight="600" color={outFlow ? t.loss : undefined}>{outFlow ? "−" : ""}{money(Math.abs(x.amount || 0))}</T>
          </View>
        );
      })}
    </View>
  );
}

export function FundSheet({ fund: f, onClose }) {
  const data = useData();
  const t = useTheme();
  const [range, setRange] = useState("252");
  const [msg, setMsg] = useState("");
  if (!f) return null;
  // The valued copy includes SIP instalments added since the last statement.
  const scheme = ((data.fundView && data.fundView.schemes) || []).find((s) => s.key === f.key) || data.schemeByKey(f.key);
  const hist = (data.fundView && data.fundView.navs[f.code]) || [];
  const n = +range;
  const part = hist.slice(-n);
  const labels = part.map((x) => x[0]);
  const buys = new Set((scheme ? scheme.transactions : []).filter((x) => (x.units || 0) > 0).map((x) => x.date));
  const series = [
    { label: "NAV", data: part.map((x) => x[1]), color: t.mf },
    ...(f.avgNav ? [{ label: "Your avg cost", data: labels.map(() => f.avgNav), color: t.loss, dash: "5,4", width: 1.2 }] : []),
    { label: "You bought", data: part.map((x) => (buys.has(x[0]) ? x[1] : null)), color: t.gain, dots: true, hideLegend: false },
  ];
  // Transactions with units (purchases, withdrawals, switches), newest first, grouped by year.
  const txns = scheme ? [...scheme.transactions].filter((x) => x.units != null || x.type === "DIVIDEND_PAYOUT").sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const years = [];
  for (const x of txns) { const y = x.date.slice(0, 4); if (!years.length || years[years.length - 1][0] !== y) years.push([y, []]); years[years.length - 1][1].push(x); }
  const sips = (scheme && scheme.sips) || [];
  const beat = f.xirr != null && f.niftyXirr != null ? f.xirr - f.niftyXirr : null;

  return (
    <Sheet visible onClose={onClose} title={f.short}>
      <T size={13} muted>{f.name}{f.folio && f.folio !== "—" ? ` · folio ${f.folio}` : ""}</T>

      {/* headline: what it's worth and how it's done */}
      <View style={{ marginTop: 10, marginBottom: 12 }}>
        <T size={13} muted>Current value</T>
        <T size={32} weight="800" style={{ letterSpacing: -0.5 }}>{money(f.value)}</T>
        <T size={15} weight="700" color={tone(t, f.pnl)}>{signed(f.pnl)} ({pct(f.pnlPct)}) overall</T>
        <T size={12} muted style={{ marginTop: 2 }}>NAV {money(f.nav, 4)} on {shortDate(f.navDate)}{f.dayPct != null ? <T size={12} color={tone(t, f.dayPct)}>  {pct(f.dayPct, 2)} that day</T> : null}</T>
      </View>
      <Tiles>
        <Tile label="Invested" value={money(f.cost)} sub={f.first ? `since ${monthYear(f.first.slice(0, 7))}` : null} />
        <Tile label="Units" value={units(f.units)} sub={`${f.weight.toFixed(0)}% of your funds`} />
        <Tile label="Your average cost" value={f.avgNav ? money(f.avgNav, 2) : "—"} sub={f.avgNav ? `NAV is ${pct((f.nav / f.avgNav - 1) * 100)} vs this` : null} color={f.avgNav ? tone(t, f.nav - f.avgNav) : undefined} />
        <Tile label="Yearly return (XIRR)" value={pct(f.xirr)} color={tone(t, f.xirr)} sub={beat != null ? `${beat >= 0 ? "beats" : "trails"} Nifty 50 by ${Math.abs(beat).toFixed(1)} pts` : null} />
      </Tiles>

      <View style={{ marginTop: 16 }}><Segmented small options={RANGES.concat([["1300", "5Y"]])} value={range} onChange={setRange} /></View>
      <View style={{ marginTop: 10 }}>{part.length ? <LineChart labels={labels} series={series} yFmt={(v) => "₹" + num(v)} /> : <T muted>No NAV history for this fund.</T>}</View>

      {f.signals.length > 0 && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={f.signals} /></>}

      {sips.length > 0 && (
        <Card style={{ marginTop: 16, backgroundColor: t.brandSoft, borderColor: "transparent" }}>
          <H>{sips.length === 1 ? "Your SIP" : `Your ${sips.length} SIPs`}</H>
          {sips.map((p, i) => {
            const nx = scheme.nextSips && scheme.nextSips[i] ? scheme.nextSips[i] : null;
            return (
              <View key={i} style={{ paddingVertical: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.line }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T weight="700">{nx ? `${money(nx.amount)} a month` : "Ended"}</T>
                  {nx ? <T weight="600" color={t.brand}>next {dayMonth(nx.due)}</T> : null}
                </View>
                <T size={12} muted>
                  {`On the ${p.day}${["th", "st", "nd", "rd"][(p.day % 10 > 3 || [11, 12, 13].includes(p.day)) ? 0 : p.day % 10]} of each month`}
                  {p.topUp ? ` · goes up ${money(p.topUp)} every ${p.topUpEvery} months${nx && nx.nextTopUpMonth ? `, next in ${monthYear(nx.nextTopUpMonth)}` : ""}` : ""}
                  {p.to && p.to < "2090" ? ` · ends ${monthYear(p.to.slice(0, 7))}` : ""}
                </T>
              </View>
            );
          })}
          <T size={12} muted style={{ marginTop: 6, lineHeight: 17 }}>
            {scheme.estimatedInstalments ? `${scheme.estimatedInstalments} instalment${scheme.estimatedInstalments === 1 ? "" : "s"} after your statement of ${shortDate(scheme.statementTo)} ${scheme.estimatedInstalments === 1 ? "is" : "are"} estimated at the actual NAVs. ` : `Statement covers up to ${shortDate(scheme.statementTo)}. `}
            New instalments are added automatically until your next statement.
          </T>
        </Card>
      )}

      <H style={{ marginTop: 20 }}>Transactions</H>
      {years.length ? years.map(([y, items], i) => <TxnYear key={y} year={y} items={items} open={i === 0} />) : <T muted>No transactions.</T>}

      <H style={{ marginTop: 20 }}>About the fund</H>
      <Tiles>
        <Tile label="1 year" value={pct(f.ret1y)} color={tone(t, f.ret1y)} />
        <Tile label="3 years, yearly" value={pct(f.ret3y)} color={tone(t, f.ret3y)} />
        <Tile label="Biggest fall, past year" value={f.maxDd1y == null ? "—" : pct(f.maxDd1y)} />
        <Tile label="Held over 1 year" value={f.over1yPct.toFixed(0) + "%"} sub="of your units (lower tax)" />
      </Tiles>
      {f.category ? <T size={12} muted style={{ marginTop: 8 }}>{f.category}</T> : null}

      <H style={{ marginTop: 20 }}>Latest news</H>
      <News query={M.fundNewsQuery(f.name)} />
      {f.code ? <Button kind="ghost" title="Add to compare" style={{ marginTop: 16 }} onPress={() => setMsg(addToCompare(data, { id: "mf|" + f.code, symbol: f.short, name: f.name }))} /> : null}
      {f.source === "manual" && <Button kind="ghost" danger title="Remove this fund" style={{ marginTop: 10 }} onPress={async () => { await data.removeFund(f.key); onClose(); }} />}
      {msg ? <T color={t.gain} style={{ marginTop: 8 }}>{msg}</T> : null}
    </Sheet>
  );
}
