import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useData } from "../data";
import { tone, useTheme } from "../theme";
import { Button, Card, Field, H, Notice, Row, Segmented, Sheet, T } from "../components/ui";
import { money } from "../format";

// NSE/BSE regular session, 9:15 to 15:30 IST on weekdays. Exchange holidays aren't known here,
// so on a holiday the order still goes as a normal order and Kotak or the exchange rejects it.
export function marketOpen(now = Date.now()) {
  const ist = new Date(now + 5.5 * 3600e3);
  const day = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

const STATUS = { complete: "Bought", traded: "Bought", open: "Waiting to be filled", "open pending": "Sent to exchange", "put order req received": "Sent to exchange", "after market order req received": "Queued for the next session", rejected: "Rejected", cancelled: "Cancelled" };
const statusText = (o) => STATUS[o.status] || o.status || "Unknown";
const statusTone = (t, o) => (/complete|traded/.test(o.status) ? t.gain : /rejected|cancel/.test(o.status) ? t.loss : t.flag);

// item: { id, symbol, name, segment, token, tradingSymbol? }, ltp: latest price
export function BuySheet({ item, ltp, onClose }) {
  const data = useData();
  const t = useTheme();
  const open = marketOpen();
  const [step, setStep] = useState("form"); // form | review | done
  const [qty, setQty] = useState("1");
  const [type, setType] = useState("L");
  const [price, setPrice] = useState(ltp ? ltp.toFixed(2) : "");
  const [amo, setAmo] = useState(!open);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);

  const q = Number(qty), p = parseFloat(price);
  const unit = type === "L" ? p : ltp;
  const value = q > 0 && unit > 0 ? q * unit : null;
  const warnings = [];
  if (type === "MKT") warnings.push("A market order buys at whatever price sellers are asking when it reaches the exchange, which can be higher than the price shown here.");
  if (type === "L" && ltp && p > ltp * 1.05) warnings.push(`Your limit is ${((p / ltp - 1) * 100).toFixed(1)}% above the last price. It will likely fill right away near the market price, but you've allowed up to ${money(p, 2)}.`);
  if (type === "L" && ltp && p < ltp * 0.9) warnings.push("Your limit is well below the last price, so the order may not fill today. Unfilled day orders are cancelled at the close.");
  if (value && value >= 100000) warnings.push(`This order is worth about ${money(value)}.`);
  if (amo) warnings.push("The market is closed, so this goes as an after-market order and is sent when the next session opens.");

  const review = () => {
    setErr(null);
    if (!(Number.isInteger(q) && q > 0)) return setErr("Enter a whole number of shares.");
    if (type === "L" && !(p > 0)) return setErr("Enter the highest price you're willing to pay.");
    if (type === "MKT" && amo) return setErr("After-market orders must be limit orders here. Switch to Limit.");
    setStep("review");
  };
  const place = async () => {
    setBusy(true); setErr(null);
    try { setRes(await data.buyShares(item, { qty: q, type, price: p, amo })); setStep("done"); }
    catch (e) {
      const unsure = /couldn't reach|didn't confirm/i.test(e.message);
      setErr(unsure ? `${e.message} The order may or may not have gone through. Check Orders in the Kotak Neo app before trying again.` : e.message);
    } finally { setBusy(false); }
  };
  const recheck = async () => {
    try { const list = await data.todaysOrders(); const o = list && list.find((x) => x.no === res.orderNo); if (o) setRes({ ...res, order: o }); } catch (e) { setErr(e.message); }
  };

  return (
    <Sheet visible onClose={onClose} title={`Buy ${item.symbol}`}>
      <T muted>{item.name}</T>
      <T size={13} muted style={{ marginBottom: 12 }}>Last price {money(ltp, 2)} · Delivery (CNC) · {open ? "Market open" : "Market closed"}</T>

      {step === "form" && <>
        <Segmented value={type} onChange={(v) => { setType(v); if (v === "MKT") setAmo(false); else if (!open) setAmo(true); }} options={[["L", "Limit"], ["MKT", "Market"]]} />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Field label="Quantity" keyboardType="number-pad" value={qty} onChangeText={setQty} /></View>
          {type === "L" && <View style={{ flex: 1 }}><Field label="Highest price (₹)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View>}
        </View>
        <Row label={type === "L" ? "Most you'll pay" : "Approximate cost"} value={value ? money(value, 2) : "—"} last />
        <T size={12} muted style={{ marginTop: 4, marginBottom: 12 }}>Plus brokerage, STT, exchange charges and stamp duty. Kotak checks your available funds.</T>
        {err && <Notice tone="error">{err}</Notice>}
        <Button title="Review order" onPress={review} />
      </>}

      {step === "review" && <>
        <Card style={{ borderWidth: 1, borderColor: t.line }}>
          <H>Check before you buy</H>
          <Row label="Buy" value={`${q} × ${item.symbol}`} />
          <Row label="Exchange" value={(item.segment || item.id.split("|")[0]).startsWith("bse") ? "BSE" : "NSE"} />
          <Row label="Order type" value={type === "L" ? `Limit at ${money(p, 2)}` : "Market price"} />
          <Row label="Product" value="Delivery (CNC)" />
          <Row label="Validity" value={amo ? "After-market, next session" : "Today only"} />
          <Row label={type === "L" ? "Most you'll pay" : "Approximate cost"} value={money(value, 2)} color={t.brand} last />
        </Card>
        {warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
        {err && <Notice tone="error">{err}</Notice>}
        <Button title="Confirm with Face ID and buy" loading={busy} onPress={place} />
        <Button kind="ghost" title="Change order" style={{ marginTop: 10 }} disabled={busy} onPress={() => { setErr(null); setStep("form"); }} />
        <T size={12} muted style={{ marginTop: 10, lineHeight: 17 }}>This places a real order with Kotak Securities from your account. Only buy orders can be placed from this app. To cancel or change an order, use the Kotak Neo app.</T>
      </>}

      {step === "done" && res && <>
        <Notice tone={res.order && /rejected/.test(res.order.status) ? "error" : "info"}>Order sent to Kotak. Order number {res.orderNo}.</Notice>
        {res.order ? <>
          <Row label="Status" value={statusText(res.order)} color={statusTone(t, res.order)} />
          {res.order.reason && /rejected/.test(res.order.status) ? <Row label="Reason" value={res.order.reason} color={t.loss} /> : null}
          {res.order.avgPrice ? <Row label="Average price" value={money(res.order.avgPrice, 2)} /> : null}
          <Row label="Symbol" value={res.order.symbol || res.tradingSymbol} last />
        </> : <T muted>Status not available yet.</T>}
        <Button kind="ghost" title="Check status again" style={{ marginTop: 12 }} onPress={recheck} />
        {err && <Notice tone="error">{err}</Notice>}
        <T size={12} muted style={{ marginTop: 10 }}>Shares bought today appear in your holdings after settlement, usually the next trading day.</T>
        <Button title="Done" style={{ marginTop: 12 }} onPress={() => { data.refresh(); onClose(); }} />
      </>}
    </Sheet>
  );
}

// Today's orders from Kotak, shown on the Shares tab while buying is on.
export function OrdersCard() {
  const data = useData();
  const t = useTheme();
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => data.todaysOrders().then((o) => { setOrders(o); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [data.status.asOf]); // eslint-disable-line
  if (!orders && !err) return null;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <H>Today's orders</H>
        <Pressable onPress={load} hitSlop={8}><T size={13} color={t.brand}>Refresh</T></Pressable>
      </View>
      {err && <T muted>{err}</T>}
      {orders && !orders.length && <T muted>No orders today.</T>}
      {(orders || []).slice(0, 10).map((o) => (
        <View key={o.no} style={{ paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T weight="700">{o.side === "S" ? "Sell" : "Buy"} {o.qty} {o.symbol}</T>
            <T size={13} weight="600" color={statusTone(t, o)}>{statusText(o)}</T>
          </View>
          <T size={12} muted>{o.type === "MKT" ? "Market" : `Limit ${money(o.price, 2)}`}{o.avgPrice ? ` · filled at ${money(o.avgPrice, 2)}` : ""}{o.amo ? " · after-market" : ""}</T>
          {o.reason && /rejected/.test(o.status) ? <T size={12} color={t.loss}>{o.reason}</T> : null}
        </View>
      ))}
      <Pressable onPress={() => Linking.openURL("https://www.kotaksecurities.com/")}><T size={12} muted style={{ marginTop: 6 }}>Cancel or change orders in the Kotak Neo app.</T></Pressable>
    </Card>
  );
}
