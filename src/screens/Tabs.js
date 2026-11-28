import React, { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useData } from "../data";
import { tone, useTheme } from "../theme";
import { Big, Button, Card, Chip, H, Hero, Notice, Row, Segmented, Sheet, SignalList, SplitBar, T, Tile, Tiles } from "../components/ui";
import { Bars, LineChart, Spark } from "../components/charts";
import { compactINR, money, pct, shortDate, signed, units } from "../format";
import { addDays, todayISO } from "../analytics";
import { GOLD_IMPORT_DUTY, chennaiGold, globalMetals } from "../market";
import { OrdersCard } from "./Buy";
import { shortName } from "../mf";

export function Screen({ children }) {
  const data = useData();
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.ground }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={data.status.loading} onRefresh={data.refresh} tintColor={t.muted} />}>
      {data.status.error ? <Notice tone="error">{data.status.error}</Notice> : null}
      {children}
    </ScrollView>
  );
}

function Verdict({ x, nx, what }) {
  const t = useTheme();
  if (x == null || nx == null) return null;
  const gap = x - nx;
  return (
    <T weight="600" style={{ marginTop: 10, lineHeight: 21 }}>
      {what} earning <T weight="800" color={tone(t, x)}>{pct(x)}</T> a year. The same money in the Nifty 50 would be earning <T weight="800">{pct(nx)}</T>, so you're {Math.abs(gap).toFixed(1)} points a year {gap >= 0 ? "ahead" : "behind"}.
    </T>
  );
}

function PerfChart({ perf, color, label }) {
  const t = useTheme();
  const [r, setR] = useState("all");
  if (!perf) return null;
  let i0 = 0;
  if (r !== "all") { const cut = addDays(todayISO(), -+r); i0 = Math.max(0, perf.dates.findIndex((d) => d >= cut)); }
  const sl = (a) => a.slice(i0);
  return (
    <View style={{ marginTop: 12 }}>
      <Segmented small value={r} onChange={setR} options={[["all", "All"], ["365", "1Y"], ["182", "6M"], ["91", "3M"], ["30", "1M"]]} />
      <View style={{ marginTop: 8 }}>
        <LineChart labels={sl(perf.dates)} yFmt={compactINR} valueFmt={(v) => money(v)} series={[
          { label, data: sl(perf.value), color },
          { label: "Same money in Nifty 50", data: sl(perf.nifty), color: t.nifty, width: 1.6 },
          { label: "Money you put in", data: sl(perf.invested), color: t.inv, dash: "5,4", width: 1.4 },
        ]} />
      </View>
    </View>
  );
}

// ================================================================ Overview
// Value-weighted mix of two yearly returns (shares and funds), good enough for one headline number.
const blend = (pairs) => { const ok = pairs.filter(([x, w]) => x != null && w > 0); const w = ok.reduce((a, [, v]) => a + v, 0); return w ? ok.reduce((a, [x, v]) => a + x * v, 0) / w : null; };

export function Overview({ openStock, openFund, goTo }) {
  const data = useData();
  const t = useTheme();
  const s = data.shares && data.shares.summary, m = data.fundView && data.fundView.summary;
  const [allFlags, setAllFlags] = useState(false);
  const [chart, setChart] = useState("shares");
  const [gold, setGold] = useState(false);

  const signals = useMemo(() => {
    const rows = [];
    for (const h of (data.shares ? data.shares.holdings : [])) for (const x of h.signals) if (x.level !== "info") rows.push({ ...x, tag: h.symbol, open: () => openStock(h), v: h.value });
    for (const f of (data.fundView ? data.fundView.rows : [])) for (const x of f.signals) if (x.level !== "info") rows.push({ ...x, tag: f.short, open: () => openFund(f), v: f.value });
    const o = { alert: 0, watch: 1 };
    return rows.sort((a, b) => o[a.level] - o[b.level] || b.v - a.v);
  }, [data.shares, data.fundView]); // eslint-disable-line

  if (!s && !m) {
    return (
      <Screen>
        <Hero label="My portfolio" value="Let's get started" />
        <Card>
          <H>Connect your accounts</H>
          <T muted style={{ marginBottom: 14 }}>Connect Kotak Neo for your shares, and import a CAMS or Tata statement for your mutual funds. Or look around with made-up data first.</T>
          <Button title="Connect accounts" onPress={() => goTo("accounts")} />
          <Button kind="ghost" title="Try with demo data" style={{ marginTop: 10 }} onPress={() => data.setDemo(true)} />
        </Card>
        {data.status.loading ? <T muted>Loading…</T> : null}
        <GoldStrip onPress={() => setGold(true)} />
        {gold && <GoldSheet onClose={() => setGold(false)} />}
      </Screen>
    );
  }
  const sv = s ? s.value : 0, mv = m ? m.value : 0, total = sv + mv;
  const day = (s ? s.dayPnl : 0) + (m ? m.dayChange : 0);
  const pnl = (s ? s.pnl : 0) + (m ? m.pnl : 0), cost = (s ? s.cost : 0) + (m ? m.cost : 0);
  const sp = data.shares && data.shares.perf, fp = data.fundView && data.fundView.perf;
  const x = blend([[sp && sp.xirr, sv], [fp && fp.xirr, mv]]);
  const nx = blend([[sp && sp.niftyXirr, sv], [fp && fp.niftyXirr, mv]]);
  const nexts = ((data.fundView && data.fundView.schemes) || []).flatMap((f) => (f.nextSips || []).filter(Boolean));
  const monthlySip = nexts.reduce((a, n) => a + n.amount, 0);
  const nextDue = nexts.map((n) => n.due).sort()[0];
  const shown = allFlags ? signals : signals.slice(0, 3);
  const perf = chart === "funds" ? fp : sp;

  return (
    <Screen>
      <Hero label="Everything you own" value={money(total)} sub={`${signed(day)} today  ·  ${signed(pnl)} overall (${pct(cost ? (pnl / cost) * 100 : 0)})`}>
        {s && m ? (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              <View style={{ width: `${(sv / total) * 100}%`, backgroundColor: "#FFFFFF" }} />
              <View style={{ flex: 1, backgroundColor: "#8FD3DC" }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <T size={12} color="#FFFFFF" style={{ opacity: 0.9 }}>Shares {compactINR(sv)} · {((sv / total) * 100).toFixed(0)}%</T>
              <T size={12} color="#FFFFFF" style={{ opacity: 0.9 }}>Funds {compactINR(mv)} · {((mv / total) * 100).toFixed(0)}%</T>
            </View>
          </View>
        ) : null}
      </Hero>
      {data.isDemo && <Notice tone="warn">You're looking at made-up demo data. Connect your accounts in the Accounts tab to see your own.</Notice>}

      <Tiles style={{ marginBottom: 12 }}>
        <Tile third onCard label="Yearly return" value={pct(x)} color={tone(t, x)} sub="XIRR" />
        <Tile third onCard label="vs Nifty 50" value={x != null && nx != null ? `${x - nx >= 0 ? "+" : "−"}${Math.abs(x - nx).toFixed(1)} pts` : "—"} color={x != null && nx != null ? tone(t, x - nx) : undefined} sub={x != null && nx != null ? (x >= nx ? "ahead" : "behind") : ""} />
        <Tile third onCard label="SIPs a month" value={monthlySip ? compactINR(monthlySip) : "—"} sub={nextDue ? `next ${new Date(nextDue + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "none set up"} />
      </Tiles>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <H>Needs your attention</H>
          {signals.length > 3 && <Pressable onPress={() => setAllFlags(!allFlags)} hitSlop={8}><T size={13} weight="600" color={t.brand}>{allFlags ? "Show fewer" : `See all ${signals.length}`}</T></Pressable>}
        </View>
        <SignalList items={shown} max={50} />
      </Card>

      <GoldStrip onPress={() => setGold(true)} />

      {(sp || fp) && (
        <Card>
          <H>Your money vs the Nifty 50</H>
          {sp && fp && <Segmented small value={chart} onChange={setChart} options={[["shares", "Shares"], ["funds", "Funds"]]} />}
          {perf && <Verdict x={perf.xirr} nx={perf.niftyXirr} what={chart === "funds" || !sp ? "Your funds are" : "Your shares are"} />}
          <PerfChart perf={perf} color={chart === "funds" || !sp ? t.mf : t.brand} label={chart === "funds" || !sp ? "Your funds" : "Your shares"} />
        </Card>
      )}

      <Compare />
      <T size={12} muted style={{ marginTop: 6, lineHeight: 17 }}>Flags describe what the numbers show. They aren't buy or sell advice. Check with a SEBI-registered adviser before big decisions.</T>
      {gold && <GoldSheet onClose={() => setGold(false)} />}
    </Screen>
  );
}

// ================================================================ Gold and silver
const usd = (v) => (v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const withChange = (text, p) => (p == null ? text : `${text}  ${pct(p, 2)}`);

// COMEX, MCX and the Chennai estimate, refreshed every minute while shown.
function useMetals() {
  const data = useData();
  const [st, setSt] = useState({ g: null, mcx: null, chennai: null, at: null });
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [a, b] = await Promise.all([globalMetals().catch(() => null), data.mcxMetals().catch(() => null)]);
      const c = await chennaiGold(b && b.gold ? b.gold.ltp : null, a).catch(() => null);
      if (!live) return;
      setSt((p) => ({ g: a || p.g, mcx: b, chennai: c || p.chennai, at: Date.now() }));
    };
    load();
    const id = setInterval(load, 60e3);
    return () => { live = false; clearInterval(id); };
  }, [data.mcxMetals, data.status.asOf]); // eslint-disable-line
  return st;
}

// One line on the Overview: today's 22 carat rate and the 1-month projection. Tap for the full card.
function GoldStrip({ onPress }) {
  const t = useTheme();
  const { chennai: c } = useMetals();
  const month = c && c.projection ? c.projection.ahead.find((a) => a.days === 30) : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Gold and silver details"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? t.brandSoft : t.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12 })}>
      <View style={{ flex: 1 }}>
        <T size={12} muted>Gold in Chennai, 22 carat</T>
        <T size={18} weight="700">{c ? perGram(c.k22) : "Loading…"}</T>
      </View>
      {month && (
        <View style={{ alignItems: "flex-end" }}>
          <T size={12} muted>trend, 1 month</T>
          <T size={15} weight="600" color={tone(t, month.k22 - c.k22)}>{perGram(month.k22)}</T>
        </View>
      )}
      <T size={20} color={t.muted}>›</T>
    </Pressable>
  );
}

function GoldSheet({ onClose }) {
  const t = useTheme();
  const data = useData();
  const { g, mcx, chennai, at } = useMetals();
  const gold = mcx && mcx.gold, silver = mcx && mcx.silver;
  const exp = g && g.expected;
  const gap = gold && exp ? gold.ltp - exp : null;
  const mcxNote = data.isDemo ? "Not in demo" : "Log in to Kotak";
  return (
    <Sheet visible onClose={onClose} title="Gold and silver">
      <ChennaiGold c={chennai} />
      <Card>
        <H>Markets</H>
        <Row label="Gold, MCX (10 g)" value={gold ? withChange(money(gold.ltp), gold.pctChange) : mcxNote} color={gold ? tone(t, gold.pctChange) : t.muted} />
        <Row label="Silver, MCX (1 kg)" value={silver ? withChange(money(silver.ltp), silver.pctChange) : mcxNote} color={silver ? tone(t, silver.pctChange) : t.muted} />
        <Row label="COMEX gold ($/oz)" value={g && g.gold ? withChange(usd(g.gold.price), g.gold.pctChange) : "—"} color={g && g.gold ? tone(t, g.gold.pctChange) : undefined} />
        <Row label="COMEX silver ($/oz)" value={g && g.silver ? withChange(usd(g.silver.price), g.silver.pctChange) : "—"} color={g && g.silver ? tone(t, g.silver.pctChange) : undefined} />
        <Row label="US dollar in rupees" value={g && g.usdInr ? withChange(money(g.usdInr.price, 2), g.usdInr.pctChange) : "—"} />
        <Row label="Expected gold (10 g)" value={exp ? withChange(money(exp), g.expectedPct) : "—"} color={t.brand} last />
        {gap != null && (
          <T size={13} weight="600" style={{ marginTop: 8, lineHeight: 19 }}>
            MCX gold is {money(Math.abs(gap))} ({Math.abs((gap / exp) * 100).toFixed(1)}%) {gap >= 0 ? "above" : "below"} the expected rate.
          </T>
        )}
        <T size={12} muted style={{ marginTop: 8, lineHeight: 17 }}>
          Expected gold = COMEX gold × US dollar in rupees ÷ 31.1035 g per ounce × 10 g, plus {Math.round(GOLD_IMPORT_DUTY * 100)}% import duty, before 3% GST. Jewellers' rates also add making charges.
          {gold ? ` MCX: ${gold.contract}.` : ""}{at ? ` Updated ${new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}, refreshes every minute.` : ""}
        </T>
      </Card>
    </Sheet>
  );
}

const perGram = (v) => (v == null ? "—" : money(v) + "/g");
const inDays = (d) => (d === 7 ? "In 1 week" : d === 30 ? "In 1 month" : `In ${d} days`);

function ChennaiGold({ c }) {
  const t = useTheme();
  const p = c && c.projection;
  return (
    <Card>
      <H>Gold rate in Chennai</H>
      {!c ? <T muted>Loading…</T> : (
        <>
          <T muted size={13}>22 carat, today</T>
          <Big color={t.brand}>{perGram(c.k22)}</Big>
          <Row label="22 carat (8 g sovereign)" value={money(c.k22 * 8)} />
          <Row label="24 carat" value={c.pctChange != null ? withChange(perGram(c.k24), c.pctChange) : perGram(c.k24)} color={c.pctChange != null ? tone(t, c.pctChange) : undefined} />
          <Row label="22 carat with 3% GST" value={perGram(c.k22Gst)} last={!p} />
          {p && p.ahead.map((a, i) => (
            <Row key={a.days} label={`Projected 22 carat, ${inDays(a.days).toLowerCase()}`} value={`${perGram(a.k22)}  (${money(a.low)}–${money(a.high)})`}
              color={tone(t, a.k22 - c.k22)} last={i === p.ahead.length - 1} />
          ))}
          {p && (
            <T size={13} weight="600" style={{ marginTop: 8, lineHeight: 19 }}>
              Over the last 60 trading days gold has trended {p.monthlyPct >= 0 ? "up" : "down"} about {Math.abs(p.monthlyPct).toFixed(1)}% a month.
            </T>
          )}
          <T size={12} muted style={{ marginTop: 8, lineHeight: 17 }}>
            Estimated from {c.source === "MCX" ? "MCX gold" : "COMEX gold and the rupee, plus import duty"}. There is no free official Chennai feed, so jewellers' boards can differ by around 1–2%. Rates exclude GST and making charges unless stated.
            Projections only extend the recent trend (range: one standard deviation). They are not forecasts.
          </T>
        </>
      )}
    </Card>
  );
}

function Compare() {
  const data = useData();
  const t = useTheme();
  const [period, setPeriod] = useState("1Y");
  const [res, setRes] = useState(null);
  const items = data.user.watchlist && data.user.watchlist.length ? data.user.watchlist
    : (data.shares ? [...data.shares.holdings].sort((a, b) => b.value - a.value).slice(0, 2).map((h) => ({ id: h.id, symbol: h.symbol, name: h.name })) : []);
  const key = items.map((i) => i.id).join(",") + period;
  useEffect(() => { let on = true; data.compare(items, period).then((r) => on && setRes(r)).catch(() => {}); return () => { on = false; }; }, [key, data.isDemo]); // eslint-disable-line
  return (
    <Card>
      <H>Compare returns</H>
      <Segmented small value={period} onChange={setPeriod} options={["1M", "3M", "6M", "1Y", "3Y"].map((p) => [p, p])} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 10 }}>
        {(res ? res.series : []).map((s, i) => (
          <View key={s.id} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.line, borderRadius: 20, paddingLeft: 10, paddingRight: s.id === "nifty" ? 10 : 4, paddingVertical: 3 }}>
            <T size={13} color={s.id === "nifty" ? t.nifty : t.series[(i - 1) % t.series.length]}>● </T><T size={13}>{s.label}</T>
            {s.id !== "nifty" && <Pressable accessibilityLabel={`Remove ${s.label}`} hitSlop={8} onPress={() => data.saveWatchlist(items.filter((x) => x.id !== s.id))}><T muted size={16}>  ×</T></Pressable>}
          </View>
        ))}
      </View>
      {res && res.dates.length ? (
        <LineChart labels={res.dates} yFmt={(v) => pct(v, 0)} valueFmt={(v) => pct(v, 1)}
          series={res.series.map((s, i) => ({ label: s.label, data: s.values, color: s.id === "nifty" ? t.nifty : t.series[(i - 1) % t.series.length], width: s.id === "nifty" ? 2.4 : 1.8 }))} />
      ) : <T muted>Loading…</T>}
      <T size={12} muted style={{ marginTop: 6 }}>Add stocks or funds with "Add to compare" in their detail view.</T>
    </Card>
  );
}

// ================================================================ Shares
const SORTS = [["value", "Value"], ["pnlPct", "P&L %"], ["dayPct", "Today"], ["vsNifty", "vs Nifty"]];
const FILTERS = [["all", "All"], ["up", "Gainers"], ["down", "Losers"], ["flags", "Flags"]];

// A tappable box that looks like a search field and opens the stock search.
function SearchBox({ text, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="search" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 12 }}>
      <Svg width={16} height={16} viewBox="0 0 24 24"><Circle cx="11" cy="11" r="7" stroke={t.muted} strokeWidth={2} fill="none" /><Path d="M20 20l-4-4" stroke={t.muted} strokeWidth={2} /></Svg>
      <T muted>{text}</T>
    </Pressable>
  );
}

export function Shares({ openStock, goTo }) {
  const data = useData();
  const t = useTheme();
  const [sort, setSort] = useState("value");
  const [filter, setFilter] = useState("all");
  const [searching, setSearching] = useState(false);
  const sh = data.shares;
  if (!sh) {
    return (
      <Screen>
        <Hero label="Shares" value="Not connected" />
        <Card>
          <H>Your shares</H>
          <T muted style={{ marginBottom: 12 }}>{data.hasKotak ? "Log in to Kotak Neo to load your holdings." : "Connect your Kotak Neo account to see your holdings here."}</T>
          <Button title={data.hasKotak ? "Refresh" : "Connect Kotak Neo"} onPress={() => (data.hasKotak ? data.refresh() : goTo("accounts"))} />
        </Card>
      </Screen>
    );
  }
  const s = sh.summary, p = sh.perf;
  const flagsOf = (h) => h.signals.filter((x) => x.level !== "info");
  const counts = { all: sh.holdings.length, up: sh.holdings.filter((h) => h.dayPct > 0).length, down: sh.holdings.filter((h) => h.dayPct < 0).length, flags: sh.holdings.filter((h) => flagsOf(h).length).length };
  const keep = (h) => filter === "all" || (filter === "up" ? h.dayPct > 0 : filter === "down" ? h.dayPct < 0 : flagsOf(h).length > 0);
  const val = (h) => h[sort] ?? -1e18;
  const rows = sh.holdings.filter(keep).sort((a, b) => val(b) - val(a));
  const sectors = (s.sectors || []).slice(0, 5);
  const rest = (s.sectors || []).slice(5).reduce((a, x) => a + x[1], 0);
  const split = rest > 0.5 ? [...sectors, ["Others", rest]] : sectors;
  return (
    <Screen>
      <Hero label="Shares" value={money(s.value)} sub={`${signed(s.dayPnl)} today (${pct(s.dayPct, 2)})${sh.nifty ? `  ·  Nifty ${pct(sh.nifty.pctChange, 2)}` : ""}`} />
      <SearchBox text="Check any stock, e.g. RELIANCE" onPress={() => setSearching(true)} />

      <Tiles style={{ marginBottom: 12 }}>
        <Tile third onCard label="Invested" value={compactINR(s.cost)} />
        <Tile third onCard label="Overall" value={pct(s.pnlPct)} color={tone(t, s.pnl)} sub={signed(s.pnl)} />
        <Tile third onCard label="XIRR" value={p ? pct(p.xirr) : "—"} color={p ? tone(t, p.xirr) : undefined} sub={p && p.niftyXirr != null ? `Nifty ${pct(p.niftyXirr)}` : ""} />
      </Tiles>

      {split.length > 0 && (
        <Card>
          <T weight="700" style={{ marginBottom: 8 }}>By sector</T>
          <SplitBar items={split.map(([, w], i) => ({ value: w, color: t.alloc[i % t.alloc.length] }))} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 4, marginTop: 8 }}>
            {split.map(([name, w], i) => <T key={name} size={12} muted><T size={12} color={t.alloc[i % t.alloc.length]}>● </T>{name} {w.toFixed(0)}%</T>)}
          </View>
        </Card>
      )}

      {data.user.settings.allowBuying && !data.isDemo && <OrdersCard />}

      <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {FILTERS.map(([k, label]) => <Chip key={k} label={`${label} ${counts[k]}`} on={filter === k} onPress={() => setFilter(k)} />)}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented small value={sort} onChange={setSort} options={SORTS} /></ScrollView>
        </View>
        <View style={{ marginTop: 8 }}>
          {!rows.length && <T muted style={{ padding: 16 }}>Nothing here right now.</T>}
          {rows.map((h) => {
            const flags = flagsOf(h);
            return (
              <Pressable key={h.id} onPress={() => openStock(h)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                <View style={{ flex: 1 }}>
                  <T weight="700">{h.symbol}{flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>  ●</T> : null}</T>
                  <T size={12} muted numberOfLines={1}>{units(h.quantity)} shares · {h.sector} · {h.weight.toFixed(0)}%</T>
                </View>
                <Spark values={h.spark} width={48} />
                <View style={{ alignItems: "flex-end" }}>
                  <T weight="700">{money(h.value)}</T>
                  <T size={12}><T size={12} color={tone(t, h.dayPct)}>{pct(h.dayPct, 1)} today</T>  <T size={12} weight="600" color={tone(t, h.pnl)}>{pct(h.pnlPct)}</T></T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {p && (
        <Card>
          <H>Your shares vs the Nifty 50</H>
          <Verdict x={p.xirr} nx={p.niftyXirr} what="Your shares are" />
          <PerfChart perf={p} color={t.brand} label="Your holdings" />
          <T size={12} muted style={{ marginTop: 6 }}>From your first purchase on {shortDate(p.start)}. Only shares you hold today.{p.estimated ? ` ${p.estimated} holding${p.estimated > 1 ? "s use" : " uses"} an estimated buy date — add real dates in each holding.` : ""}</T>
        </Card>
      )}
      <StockSearch visible={searching} onClose={() => setSearching(false)} onPick={(r) => { setSearching(false); openStock(r); }} />
    </Screen>
  );
}

function StockSearch({ visible, onClose, onPick }) {
  const data = useData();
  const t = useTheme();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const h = setTimeout(() => data.searchStocks(q).then((r) => { setRes(r); setErr(null); }).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(h);
  }, [q]); // eslint-disable-line
  return (
    <Sheet visible={visible} onClose={onClose} title="Check any stock">
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Symbol or company name" placeholderTextColor={t.muted} autoCapitalize="characters" autoCorrect={false}
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.ground, color: t.ink, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 10 }} />
      {err && <Notice tone="error">{err}</Notice>}
      {res.map((r) => {
        const own = data.shares && data.shares.holdings.some((h) => h.id === r.id);
        return (
          <Pressable key={r.id} onPress={() => onPick(r)} style={{ paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
            <T weight="700">{r.symbol}</T><T size={13} muted numberOfLines={1}>{own ? "You hold this · " : ""}{r.name}</T>
          </Pressable>
        );
      })}
      {q.trim().length >= 2 && !res.length && !err ? <T muted>No matching stock.</T> : null}
    </Sheet>
  );
}

// ================================================================ Wishlist
// "Ready to buy": at or below your buy price. The rest are "watching", nearest to your price first.
function WishRow({ w, onPress, owned }) {
  const t = useTheme();
  const flags = w.signals.filter((x) => x.level !== "info");
  const gap = w.buyBelow && w.ltp ? (w.ltp / w.buyBelow - 1) * 100 : null; // % above the buy price
  const right = gap == null
    ? (w.sinceAdded != null ? <T size={12} color={tone(t, w.sinceAdded)}>{pct(w.sinceAdded)} since added</T> : null)
    : gap <= 0 ? <T size={12} weight="600" color={t.gain}>{gap > -0.05 ? "at your price" : `${Math.abs(gap).toFixed(1)}% below your price`}</T>
      : <T size={12} muted>{gap.toFixed(1)}% to go</T>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T weight="700">{w.symbol}{flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>  ●</T> : null}</T>
        <T weight="700">{w.ltp ? money(w.ltp, 2) : "—"}</T>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
        <T size={12} muted numberOfLines={1} style={{ flex: 1 }}>{[owned ? "You hold this" : "", w.category, w.buyBelow ? `buy at ${money(w.buyBelow)}` : "no buy price set"].filter(Boolean).join(" · ")}</T>
        {right}
      </View>
      {gap != null && gap > 0 && (
        <View style={{ height: 4, backgroundColor: t.line, borderRadius: 2, marginTop: 6 }}>
          <View style={{ width: `${Math.max(4, Math.min(100, 100 - gap * 4))}%`, height: 4, backgroundColor: t.flag, borderRadius: 2 }} />
        </View>
      )}
    </Pressable>
  );
}

export function Wishlist({ openStock, goTo }) {
  const data = useData();
  const t = useTheme();
  const [cat, setCat] = useState("all");
  const [searching, setSearching] = useState(false);
  const wv = data.wishView;
  const all = wv ? wv.rows : (data.user.wishlist || []).map((w) => ({ ...w, ind: {}, signals: [], spark: [] }));
  const cats = [...new Set([...(data.user.wishCategories || []), ...all.map((w) => w.category)])];
  const count = (c) => all.filter((w) => w.category === c).length;
  const rows = cat === "all" ? all : all.filter((w) => w.category === cat);
  const gapOf = (w) => (w.buyBelow && w.ltp ? w.ltp / w.buyBelow - 1 : null);
  const ready = rows.filter((w) => gapOf(w) != null && gapOf(w) <= 0).sort((a, b) => gapOf(a) - gapOf(b));
  const watching = rows.filter((w) => !ready.includes(w)).sort((a, b) => (gapOf(a) ?? 9) - (gapOf(b) ?? 9) || a.symbol.localeCompare(b.symbol));
  const readyAll = all.filter((w) => gapOf(w) != null && gapOf(w) <= 0).length;
  const signals = rows.flatMap((w) => w.signals.filter((x) => x.level !== "info").map((x) => ({ ...x, tag: w.symbol, open: () => openStock(w) })))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "alert" ? -1 : 1));
  const owned = (w) => data.shares && data.shares.holdings.some((h) => h.id === w.id);

  return (
    <Screen>
      <Hero label="Wishlist" value={`${all.length} stock${all.length === 1 ? "" : "s"}`} sub={all.length ? (readyAll ? `${readyAll} at your buy price` : "None at your buy price yet") : "Stocks you're thinking of buying"} />
      <SearchBox text="Add a stock, e.g. TCS" onPress={() => setSearching(true)} />
      {wv && wv.needLogin && all.length > 0 && (
        <Notice tone="warn">{data.hasKotak ? "Log in to Kotak Neo for live prices and signals. Pull down to refresh." : "Connect Kotak Neo in Accounts for live prices and signals."}</Notice>
      )}
      {!all.length ? (
        <Card>
          <H>Start your wishlist</H>
          <T muted style={{ marginBottom: 12 }}>Keep stocks you're thinking of buying here, grouped into categories. Set a buy price and the app moves the stock to "Ready to buy" when it gets there. Open a stock and tap "Add to wishlist".</T>
          <Button title="Find a stock" onPress={() => setSearching(true)} />
        </Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
            {[["all", `All ${all.length}`], ...cats.map((c) => [c, `${c} ${count(c)}`])].map(([k, label]) => (
              <Chip key={k} label={label} on={cat === k} onPress={() => setCat(k)} onLongPress={() => k !== "all" && !count(k) && data.removeWishCategory(k)} />
            ))}
          </ScrollView>

          {ready.length > 0 && (
            <Card style={{ paddingHorizontal: 0, paddingBottom: 4, borderColor: t.gain, borderWidth: 1.5 }}>
              <T size={13} weight="800" color={t.gain} style={{ paddingHorizontal: 16, paddingBottom: 6, letterSpacing: 0.3 }}>READY TO BUY</T>
              {ready.map((w) => <WishRow key={w.id} w={w} owned={owned(w)} onPress={() => openStock(w)} />)}
            </Card>
          )}
          {watching.length > 0 && (
            <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
              <T size={13} weight="800" muted style={{ paddingHorizontal: 16, paddingBottom: 6, letterSpacing: 0.3 }}>WATCHING</T>
              {watching.map((w) => <WishRow key={w.id} w={w} owned={owned(w)} onPress={() => openStock(w)} />)}
            </Card>
          )}

          <Card>
            <H>What stands out{cat === "all" ? "" : ` in ${cat}`}</H>
            {wv && wv.needLogin ? <T muted>Shown once prices load.</T> : <SignalList items={signals} />}
          </Card>
          <T size={12} muted style={{ marginHorizontal: 4 }}>Your wishlist is kept on this phone; Kotak Neo's Trade API can't read the watchlists in the Kotak Neo app. Long-press an empty category to delete it.</T>
        </>
      )}
      <StockSearch visible={searching} onClose={() => setSearching(false)} onPick={(r) => { setSearching(false); openStock(r); }} />
    </Screen>
  );
}

// ================================================================ Funds
const FSORTS = [["value", "Value"], ["xirr", "Your XIRR"], ["ret1y", "Fund 1Y"], ["pnlPct", "P&L %"], ["flags", "Flags"]];

export function Funds({ openFund, openImport, openManual }) {
  const data = useData();
  const t = useTheme();
  const [sort, setSort] = useState("value");
  const fv = data.fundView;
  const amc = data.user.settings.amcFilter;
  if (!fv) {
    return (
      <Screen>
        <Card>
          <H>{amc ? `${amc} mutual funds` : "Mutual funds"}</H>
          <T style={{ marginBottom: 6 }}>Tata Mutual Fund doesn't offer an API for investors. Import your CAMS statement (CAS) instead. It lists every SIP, purchase and redemption, so your returns are exact.</T>
          <T muted size={13} style={{ marginBottom: 14 }}>The PDF is read on this phone and isn't uploaded anywhere.</T>
          <Button title="Import CAMS statement" onPress={openImport} />
          <Button kind="ghost" title="Add a fund by hand" style={{ marginTop: 10 }} onPress={openManual} />
        </Card>
      </Screen>
    );
  }
  const m = fv.summary;
  const val = (f) => (sort === "flags" ? f.signals.filter((x) => x.level !== "info").length : f[sort] ?? -1e18);
  const rows = [...fv.rows].sort((a, b) => val(b) - val(a));
  // A fixed colour per fund (by size), so the split bar and the list agree whatever the sort.
  const byValue = [...fv.rows].sort((a, b) => b.value - a.value);
  const colorOf = (f) => t.alloc[byValue.findIndex((x) => x.key === f.key) % t.alloc.length];
  const sipOf = Object.fromEntries((fv.schemes || []).map((x) => [x.key, (x.nextSips || []).reduce((a, n) => a + (n ? n.amount : 0), 0)]));
  const est = (fv.schemes || []).reduce((a, x) => a + (x.estimatedInstalments || 0), 0);
  // SIPs due in the next calendar month that has any, grouped by date.
  const allNext = (fv.schemes || []).flatMap((x) => (x.nextSips || []).map((n, i) => n && ({ ...n, name: shortName(x.name), sip: x.sips[i] })).filter(Boolean));
  const firstMonth = allNext.map((n) => n.due.slice(0, 7)).sort()[0];
  const byDay = {};
  for (const n of allNext.filter((n) => n.due.slice(0, 7) === firstMonth)) {
    byDay[n.due] = byDay[n.due] || { due: n.due, total: 0, names: [] };
    byDay[n.due].total += n.amount;
    if (!byDay[n.due].names.includes(n.name)) byDay[n.due].names.push(n.name);
  }
  const upcoming = Object.values(byDay).sort((a, b) => (a.due < b.due ? -1 : 1));
  const upcomingMonth = firstMonth ? new Date(firstMonth + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long" }) : "";
  const topUps = [...new Set(allNext.filter((n) => n.due.slice(0, 7) === firstMonth && n.nextTopUpMonth === firstMonth && n.sip && n.sip.topUp).map((n) => n.name))];
  return (
    <Screen>
      <Hero color={t.bandMf} label={`${amc ? `${amc} mutual funds` : "Mutual funds"} · value on ${shortDate(byValue[0] ? byValue[0].navDate : null)}`} value={money(m.value)}
        sub={`${signed(m.pnl)} overall (${pct(m.pnlPct)}) on ${money(m.cost)} invested`}>
        <T size={12} color="#FFFFFF" style={{ opacity: 0.85, marginTop: 2 }}>Latest day {signed(m.dayChange)}{est ? `  ·  includes ${est} estimated SIP instalment${est === 1 ? "" : "s"}` : ""}</T>
      </Hero>

      {upcoming.length > 0 && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <T weight="700">Upcoming SIPs</T>
            <T size={12} muted>{money(upcoming.reduce((a, d) => a + d.total, 0))} in {upcomingMonth}</T>
          </View>
          <Tiles>
            {upcoming.map((d) => (
              <View key={d.due} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: t.ground, borderRadius: 10, padding: 10 }}>
                <T size={12} weight="700" color={t.mf}>{new Date(d.due + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</T>
                <T size={16} weight="700">{money(d.total)}</T>
                <T size={11} muted numberOfLines={2}>{d.names.join(", ")}</T>
              </View>
            ))}
          </Tiles>
          {topUps.length > 0 && <T size={12} muted style={{ marginTop: 8 }}>{topUps.join(" and ")} step{topUps.length === 1 ? "s" : ""} up this month (top-up).</T>}
        </Card>
      )}

      <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <H>Your {rows.length} fund{rows.length === 1 ? "" : "s"}</H>
            <T size={12} muted>tap a fund for details</T>
          </View>
          {/* How the money is split, with the same colour as each fund's dot below */}
          <SplitBar items={byValue.map((f) => ({ value: f.value, color: colorOf(f) }))} />
          <View style={{ height: 12 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented small value={sort} onChange={setSort} options={FSORTS} /></ScrollView>
        </View>
        <View style={{ marginTop: 8 }}>
          {rows.map((f) => {
            const flags = f.signals.filter((x) => x.level !== "info");
            const sip = sipOf[f.key];
            const kind = f.category ? f.category.split(" - ").pop().replace(/ Fund$/, "") : f.source === "manual" ? "Added by you" : "";
            return (
              <Pressable key={f.key} onPress={() => openFund(f)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorOf(f) }} />
                <View style={{ flex: 1 }}>
                  <T weight="700" numberOfLines={2}>{f.short}{flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>  ●</T> : null}</T>
                  <T size={12} muted numberOfLines={1}>{[kind, `${f.weight.toFixed(0)}% of funds`, sip ? `SIP ${money(sip)}/mo` : ""].filter(Boolean).join(" · ")}</T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T weight="700">{money(f.value)}</T>
                  <T size={12} weight="600" color={tone(t, f.pnl)}>{signed(f.pnl)} · {pct(f.pnlPct)}</T>
                  <T size={11} muted>XIRR {pct(f.xirr)}</T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
      {fv.perf && (
        <Card>
          <H>Your funds vs the Nifty 50</H>
          <Verdict x={fv.perf.xirr} nx={fv.perf.niftyXirr} what="Your funds are" />
          <PerfChart perf={fv.perf} color={t.mf} label="Your funds" />
        </Card>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button kind="ghost" title="Add by hand" style={{ flex: 1 }} onPress={openManual} />
        <Button title="Import statement" style={{ flex: 1 }} onPress={openImport} />
      </View>
      <T size={12} muted style={{ marginTop: 10 }}>
        {data.isDemo ? "These are made-up demo funds." : data.funds.importedAt ? `Statement imported ${new Date(data.funds.importedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Import a fresh one after new SIPs or redemptions. NAVs update by themselves.` : ""}
      </T>
    </Screen>
  );
}
