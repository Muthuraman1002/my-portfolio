import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useData } from "../data";
import { useTheme, tone } from "../theme";
import { Button, Card, Field, H, Notice, Row, Segmented, Sheet, SignalList, T } from "../components/ui";
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
      <H style={{ marginTop: 20 }}>{w ? "In your wishlist" : "Add to wishlist"}</H>
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

  return (
    <Sheet visible onClose={onClose} title={item.symbol}>
      <T muted>{item.name}</T>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginVertical: 8 }}>
        <T size={30} weight="800">{money(ltp, 2)}</T>
        {dayPct != null && <T color={tone(t, dayPct)}>{pct(dayPct, 2)} today</T>}
      </View>
      {err && <Notice tone="error">{err}</Notice>}
      {data.user.settings.allowBuying && !data.isDemo && /^(nse|bse)_cm\|/.test(item.id) && (
        <Button title={`Buy ${item.symbol}`} style={{ marginBottom: 12 }} disabled={!ltp} onPress={() => setBuying(true)} />
      )}
      {buying && <BuySheet item={hd ? { ...item, ...hd } : item} ltp={ltp} onClose={() => setBuying(false)} />}
      <Segmented small options={RANGES} value={range} onChange={setRange} />
      <View style={{ marginTop: 10 }}>{d ? <LineChart labels={labels} series={series} yFmt={(v) => "₹" + num(v)} /> : <T muted>Loading chart…</T>}</View>

      {hd && hd.signals.length > 0 && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={hd.signals} /></>}
      {!hd && wrow && !(data.wishView && data.wishView.needLogin) && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={wrow.signals} /></>}

      <H style={{ marginTop: 16 }}>Key numbers</H>
      {hd && <>
        <Row label="Your avg cost" value={money(hd.avgPrice, 2)} />
        <Row label="Profit / loss" value={`${signed(hd.pnl)} (${pct(hd.pnlPct)})`} color={tone(t, hd.pnl)} />
        <Row label="Share of your stocks" value={hd.weight.toFixed(1) + "%"} />
        <Row label="Since first buy" value={pct(hd.sinceFirst)} color={tone(t, hd.sinceFirst)} />
        <Row label="Nifty 50, same period" value={pct(hd.niftySinceFirst)} color={tone(t, hd.niftySinceFirst)} />
        <Row label="First bought" value={shortDate(hd.firstBuy) + (hd.lotsEstimated ? " (estimated)" : "")} />
      </>}
      <Row label="1 month" value={pct(ind.ret1m)} color={tone(t, ind.ret1m)} />
      <Row label="3 months" value={pct(ind.ret3m)} color={tone(t, ind.ret3m)} />
      <Row label="1 year" value={pct(ind.ret1y)} color={tone(t, ind.ret1y)} />
      <Row label="52-week range" value={ind.low52 ? `${money(ind.low52)} – ${money(ind.high52)}` : "—"} />
      <Row label="50 / 200-day average" value={ind.sma50 ? `${money(ind.sma50)} / ${ind.sma200 ? money(ind.sma200) : "—"}` : "—"} />
      <Row label="RSI (14-day)" value={ind.rsi14 == null ? "—" : ind.rsi14.toFixed(0)} />
      <Row label="Yearly volatility" value={ind.volatility == null ? "—" : ind.volatility.toFixed(0) + "%"} last />

      {hd && <>
        <H style={{ marginTop: 20 }}>Your plan</H>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Target price (₹)" keyboardType="decimal-pad" value={plan.target} onChangeText={(v) => setPlan({ ...plan, target: v })} /></View>
          <View style={{ flex: 1 }}><Field label="Stop price (₹)" keyboardType="decimal-pad" value={plan.stop} onChangeText={(v) => setPlan({ ...plan, stop: v })} /></View>
        </View>
        <Field label="Why you hold it" multiline value={plan.note} onChangeText={(v) => setPlan({ ...plan, note: v })} />
        <Button title="Save plan" onPress={savePlan} />

        <H style={{ marginTop: 20 }}>Your purchases</H>
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
      </>}
      {msg ? <T color={t.gain} style={{ marginTop: 8 }}>{msg}</T> : null}

      <WishlistBox key={item.id} item={item} ltp={ltp} />

      <H style={{ marginTop: 20 }}>Latest news</H>
      <News query={M.stockNewsQuery(item.symbol, item.name)} />
      <Button kind="ghost" title="Add to compare" style={{ marginTop: 16 }} onPress={() => setMsg(addToCompare(data, item))} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- fund
const TXN = { PURCHASE: "Purchase", PURCHASE_SIP: "SIP", REDEMPTION: "Redemption", SWITCH_IN: "Switch in", SWITCH_OUT: "Switch out", SWITCH_IN_MERGER: "Merger in", SWITCH_OUT_MERGER: "Merger out", DIVIDEND_PAYOUT: "Dividend paid", DIVIDEND_REINVEST: "Dividend reinvested", GIFT_IN: "Gift in", GIFT_OUT: "Gift out", REVERSAL: "Reversal" };

export function FundSheet({ fund: f, onClose }) {
  const data = useData();
  const t = useTheme();
  const [range, setRange] = useState("252");
  const [msg, setMsg] = useState("");
  if (!f) return null;
  // The valued copy includes SIP instalments added since the last statement.
  const scheme = ((data.fundView && data.fundView.schemes) || []).find((s) => s.key === f.key) || data.schemeByKey(f.key);
  const fmtMonth = (ym) => (ym ? new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "");
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
  const txns = scheme ? [...scheme.transactions].filter((x) => x.units != null || x.type === "DIVIDEND_PAYOUT").reverse() : [];
  return (
    <Sheet visible onClose={onClose} title={f.short}>
      <T muted>{f.name}{f.folio !== "—" ? `, folio ${f.folio}` : ""}</T>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginVertical: 8 }}>
        <T size={30} weight="800">{money(f.nav, 2)}</T>
        {f.dayPct != null && <T color={tone(t, f.dayPct)}>{pct(f.dayPct, 2)} on {shortDate(f.navDate)}</T>}
      </View>
      <Segmented small options={RANGES.concat([["1300", "5Y"]])} value={range} onChange={setRange} />
      <View style={{ marginTop: 10 }}>{part.length ? <LineChart labels={labels} series={series} yFmt={(v) => "₹" + num(v)} /> : <T muted>No NAV history for this fund.</T>}</View>

      {f.signals.length > 0 && <><H style={{ marginTop: 16 }}>What stands out</H><SignalList items={f.signals} /></>}

      <H style={{ marginTop: 16 }}>Key numbers</H>
      <Row label="Units" value={units(f.units)} />
      <Row label="Your avg cost" value={f.avgNav ? money(f.avgNav, 2) : "—"} />
      <Row label="Invested" value={money(f.cost)} />
      <Row label="Value" value={money(f.value)} />
      <Row label="Profit / loss" value={`${signed(f.pnl)} (${pct(f.pnlPct)})`} color={tone(t, f.pnl)} />
      <Row label="Your yearly return (XIRR)" value={pct(f.xirr)} color={tone(t, f.xirr)} />
      <Row label="Same money in Nifty 50" value={pct(f.niftyXirr)} color={tone(t, f.niftyXirr)} />
      <Row label="Fund 1 year" value={pct(f.ret1y)} color={tone(t, f.ret1y)} />
      <Row label="Fund 3 years (yearly)" value={pct(f.ret3y)} color={tone(t, f.ret3y)} />
      <Row label="Biggest fall, past year" value={f.maxDd1y == null ? "—" : pct(f.maxDd1y)} />
      <Row label="Units held over 1 year" value={f.over1yPct.toFixed(0) + "%"} />
      <Row label="Last SIP" value={f.lastSip ? shortDate(f.lastSip) : "None"} />
      <Row label="Category" value={f.category ? f.category.split(" - ").pop() : "—"} last />

      {scheme && scheme.sips && scheme.sips.length > 0 && <>
        <H style={{ marginTop: 20 }}>Your SIPs</H>
        {scheme.sips.map((p, i) => {
          const nx = scheme.nextSips && scheme.nextSips[i] ? scheme.nextSips[i] : null;
          return <Row key={i} label={`Day ${p.day} each month${p.topUp ? `, +${money(p.topUp)} every ${p.topUpEvery} months` : ""}`}
            value={nx ? `${money(nx.amount)} on ${shortDate(nx.due)}${nx.nextTopUpMonth && p.topUp ? ` · next top-up ${fmtMonth(nx.nextTopUpMonth)}` : ""}` : "Ended"} last={i === scheme.sips.length - 1} />;
        })}
        <T size={12} muted style={{ marginTop: 6, lineHeight: 17 }}>
          {scheme.estimatedInstalments ? `${scheme.estimatedInstalments} instalment${scheme.estimatedInstalments === 1 ? "" : "s"} since your statement of ${shortDate(scheme.statementTo)} ${scheme.estimatedInstalments === 1 ? "is" : "are"} estimated from these SIPs at the actual NAVs. ` : `Your statement covers up to ${shortDate(scheme.statementTo)}. `}
          New instalments are added automatically, at the next business day's NAV, until you import a newer statement. A missed payment won't show until then.
        </T>
      </>}

      <H style={{ marginTop: 20 }}>Your transactions</H>
      {txns.length ? txns.slice(0, 60).map((x, i) => (
        <View key={i} style={{ flexDirection: "row", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
          <T size={13} style={{ width: 78 }}>{shortDate(x.date)}</T>
          <T size={13} style={{ flex: 1 }}>{TXN[x.type] || x.type}{x.estimated ? <T size={11} weight="700" color={t.flag}>  ESTIMATED</T> : null}</T>
          <T size={13} color={tone(t, -(x.amount || 0))} style={{ width: 90, textAlign: "right" }}>{money(Math.abs(x.amount || 0))}</T>
          <T size={13} muted style={{ width: 78, textAlign: "right" }}>{x.units == null ? "—" : units(x.units)}</T>
        </View>
      )) : <T muted>No transactions.</T>}

      <H style={{ marginTop: 20 }}>Latest news</H>
      <News query={M.fundNewsQuery(f.name)} />
      {f.code ? <Button kind="ghost" title="Add to compare" style={{ marginTop: 16 }} onPress={() => setMsg(addToCompare(data, { id: "mf|" + f.code, symbol: f.short, name: f.name }))} /> : null}
      {f.source === "manual" && <Button kind="ghost" danger title="Remove this fund" style={{ marginTop: 10 }} onPress={async () => { await data.removeFund(f.key); onClose(); }} />}
      {msg ? <T color={t.gain} style={{ marginTop: 8 }}>{msg}</T> : null}
    </Sheet>
  );
}
