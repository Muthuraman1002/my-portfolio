import React, { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useData } from "../data";
import { tone, useTheme } from "../theme";
import { Big, Button, Card, H, Notice, Row, Segmented, Sheet, SignalList, T } from "../components/ui";
import { Bars, LineChart, Spark } from "../components/charts";
import { compactINR, money, pct, shortDate, signed, units } from "../format";
import { addDays, todayISO } from "../analytics";
import { GOLD_IMPORT_DUTY, chennaiGold, globalMetals } from "../market";
import { OrdersCard } from "./Buy";

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
export function Overview({ openStock, openFund, goTo }) {
  const data = useData();
  const t = useTheme();
  const s = data.shares && data.shares.summary, m = data.fundView && data.fundView.summary;
  const [mode, setMode] = useState("asset");

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
        <Card>
          <H>Get started</H>
          <T muted style={{ marginBottom: 14 }}>Connect your Kotak Neo account for your shares, and import your CAMS statement for your Tata mutual funds. Or look around with made-up data first.</T>
          <Button title="Connect accounts" onPress={() => goTo("accounts")} />
          <Button kind="ghost" title="Try with demo data" style={{ marginTop: 10 }} onPress={() => data.setDemo(true)} />
        </Card>
        {data.status.loading ? <T muted>Loading…</T> : null}
        <Metals />
      </Screen>
    );
  }
  const total = (s ? s.value : 0) + (m ? m.value : 0);
  const day = (s ? s.dayPnl : 0) + (m ? m.dayChange : 0);
  const pnl = (s ? s.pnl : 0) + (m ? m.pnl : 0), cost = (s ? s.cost : 0) + (m ? m.cost : 0);
  let alloc;
  if (mode === "asset") {
    alloc = [];
    if (s) alloc.push(["Shares", (s.value / total) * 100]);
    if (m) for (const [c, w] of m.categories) alloc.push([c, (w * m.value) / total]);
    alloc.sort((a, b) => b[1] - a[1]);
  } else alloc = s ? s.sectors : [];

  return (
    <Screen>
      {data.isDemo && <Notice tone="warn">You're looking at made-up demo data. Connect your accounts in the Accounts tab to see your own.</Notice>}
      <Card>
        <T muted size={13}>Everything you own</T>
        <Big>{money(total)}</Big>
        {s && m && (
          <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", marginVertical: 8, backgroundColor: t.ground }}>
            <View style={{ width: `${(s.value / total) * 100}%`, backgroundColor: t.brand }} />
            <View style={{ width: `${(m.value / total) * 100}%`, backgroundColor: t.mf }} />
          </View>
        )}
        {s && <Row label="Shares" value={money(s.value)} color={t.brand} />}
        {m && <Row label="Mutual funds" value={money(m.value)} color={t.mf} />}
        <Row label="Today" value={signed(day)} color={tone(t, day)} />
        <Row label="Total profit / loss" value={`${signed(pnl)} (${pct(cost ? (pnl / cost) * 100 : 0)})`} color={tone(t, pnl)} last />
      </Card>

      <Metals />

      <Card>
        <H>Needs your attention</H>
        <SignalList items={signals} />
      </Card>

      <Card>
        <H>Where your money is</H>
        <Segmented small value={mode} onChange={setMode} options={[["asset", "Shares and funds"], ...(s ? [["sector", "Share sectors"]] : [])]} />
        <View style={{ marginTop: 10 }}><Bars items={alloc.slice(0, 10)} heavyAt={mode === "sector" ? 30 : 101} /></View>
      </Card>

      <Compare />
      <T size={12} muted style={{ marginTop: 6, lineHeight: 17 }}>Flags describe what the numbers show. They aren't buy or sell advice. Check with a SEBI-registered adviser before big decisions.</T>
    </Screen>
  );
}

// ================================================================ Gold and silver
const usd = (v) => (v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const withChange = (text, p) => (p == null ? text : `${text}  ${pct(p, 2)}`);

function Metals() {
  const data = useData();
  const t = useTheme();
  const [g, setG] = useState(null);   // COMEX and the rupee
  const [mcx, setMcx] = useState(null);
  const [chennai, setChennai] = useState(null);
  const [at, setAt] = useState(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const [a, b] = await Promise.all([globalMetals().catch(() => null), data.mcxMetals().catch(() => null)]);
      const c = await chennaiGold(b && b.gold ? b.gold.ltp : null, a).catch(() => null);
      if (!live) return;
      if (a) setG(a);
      setMcx(b);
      if (c) setChennai(c);
      setAt(Date.now());
    };
    load();
    const id = setInterval(load, 60e3); // refresh every minute while this screen is open
    return () => { live = false; clearInterval(id); };
  }, [data.mcxMetals, data.status.asOf]); // eslint-disable-line

  const gold = mcx && mcx.gold, silver = mcx && mcx.silver;
  const exp = g && g.expected;
  const gap = gold && exp ? gold.ltp - exp : null;
  const mcxNote = data.isDemo ? "Not in demo" : "Log in to Kotak";

  return (
    <>
    <ChennaiGold c={chennai} />
    <Card>
      <H>Gold and silver</H>
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
    </>
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
const SORTS = [["value", "Value"], ["pnlPct", "P&L %"], ["dayPct", "Today"], ["vsNifty", "vs Nifty"], ["flags", "Flags"]];

export function Shares({ openStock, goTo }) {
  const data = useData();
  const t = useTheme();
  const [sort, setSort] = useState("value");
  const [searching, setSearching] = useState(false);
  const sh = data.shares;
  if (!sh) {
    return (
      <Screen>
        <Card>
          <H>Your shares</H>
          <T muted style={{ marginBottom: 12 }}>{data.hasKotak ? "Log in to Kotak Neo to load your holdings." : "Connect your Kotak Neo account to see your holdings here."}</T>
          <Button title={data.hasKotak ? "Refresh" : "Connect Kotak Neo"} onPress={() => (data.hasKotak ? data.refresh() : goTo("accounts"))} />
        </Card>
      </Screen>
    );
  }
  const s = sh.summary, p = sh.perf;
  const val = (h) => (sort === "flags" ? h.signals.filter((x) => x.level !== "info").length : h[sort] ?? -1e18);
  const rows = [...sh.holdings].sort((a, b) => val(b) - val(a));
  return (
    <Screen>
      <Pressable onPress={() => setSearching(true)} style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <T muted>Check any stock — e.g. RELIANCE</T>
      </Pressable>
      <Card>
        <T muted size={13}>Shares, current value</T>
        <Big>{money(s.value)}</Big>
        <Row label="Today" value={`${signed(s.dayPnl)} (${pct(s.dayPct, 2)})`} color={tone(t, s.dayPnl)} />
        <Row label="Total profit / loss" value={`${signed(s.pnl)} (${pct(s.pnlPct)})`} color={tone(t, s.pnl)} />
        <Row label="You invested" value={money(s.cost)} />
        <Row label="Nifty 50" value={sh.nifty ? `${sh.nifty.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${pct(sh.nifty.pctChange, 2)})` : "—"} color={sh.nifty ? tone(t, sh.nifty.pctChange) : undefined} last />
        {p && <Verdict x={p.xirr} nx={p.niftyXirr} what="Your shares are" />}
        <PerfChart perf={p} color={t.brand} label="Your holdings" />
        {p && <T size={12} muted style={{ marginTop: 6 }}>From your first purchase on {shortDate(p.start)}. Only shares you hold today.{p.estimated ? ` ${p.estimated} holding${p.estimated > 1 ? "s use" : " uses"} an estimated buy date — add real dates in each holding.` : ""}</T>}
      </Card>

      {data.user.settings.allowBuying && !data.isDemo && <OrdersCard />}

      <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <H>Holdings</H>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented small value={sort} onChange={setSort} options={SORTS} /></ScrollView>
        </View>
        <View style={{ marginTop: 8 }}>
          {rows.map((h) => {
            const flags = h.signals.filter((x) => x.level !== "info");
            return (
              <Pressable key={h.id} onPress={() => openStock(h)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                <View style={{ flex: 1.3 }}>
                  <T weight="700">{h.symbol} {flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>●</T> : null}</T>
                  <T size={12} muted numberOfLines={1}>{units(h.quantity)} × {money(h.avgPrice, 2)}</T>
                </View>
                <Spark values={h.spark} width={56} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <T weight="600">{money(h.value)}</T>
                  <T size={12} color={tone(t, h.pnl)}>{pct(h.pnlPct)}  <T size={12} color={tone(t, h.dayPct)}>{pct(h.dayPct, 1)} today</T></T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
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
const WSORTS = [["category", "Category"], ["flags", "Flags"], ["dayPct", "Today"], ["sinceAdded", "Since added"], ["toBuy", "Near buy price"]];

export function Wishlist({ openStock, goTo }) {
  const data = useData();
  const t = useTheme();
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("category");
  const [searching, setSearching] = useState(false);
  const wv = data.wishView;
  const all = wv ? wv.rows : (data.user.wishlist || []).map((w) => ({ ...w, ind: {}, signals: [], spark: [] }));
  const cats = [...new Set([...(data.user.wishCategories || []), ...all.map((w) => w.category)])];
  const count = (c) => all.filter((w) => w.category === c).length;
  const rows = cat === "all" ? all : all.filter((w) => w.category === cat);
  const flagsOf = (w) => w.signals.filter((x) => x.level !== "info");
  const toBuy = (w) => (w.buyBelow && w.ltp ? -(w.ltp / w.buyBelow - 1) : -1e9);
  const val = (w) => (sort === "flags" ? flagsOf(w).length : sort === "toBuy" ? toBuy(w) : w[sort] ?? -1e18);
  const sorted = sort === "category" ? [...rows].sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || a.symbol.localeCompare(b.symbol)) : [...rows].sort((a, b) => val(b) - val(a));
  const signals = rows.flatMap((w) => w.signals.filter((x) => x.level !== "info").map((x) => ({ ...x, tag: w.symbol, open: () => openStock(w) })))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "alert" ? -1 : 1));
  const owned = (w) => data.shares && data.shares.holdings.some((h) => h.id === w.id);

  return (
    <Screen>
      <Pressable onPress={() => setSearching(true)} style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <T muted>Add a stock to your wishlist — e.g. TCS</T>
      </Pressable>
      {wv && wv.needLogin && all.length > 0 && (
        <Notice tone="warn">{data.hasKotak ? "Log in to Kotak Neo for live prices and signals. Pull down to refresh." : "Connect Kotak Neo in Accounts for live prices and signals."}</Notice>
      )}
      {!all.length ? (
        <Card>
          <H>Your wishlist</H>
          <T muted style={{ marginBottom: 12 }}>Keep stocks you're thinking of buying here, grouped into categories. Set a buy price and the app flags when the stock gets there. Open a stock and tap "Add to wishlist".</T>
          <Button title="Find a stock" onPress={() => setSearching(true)} />
        </Card>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
            {[["all", `All ${all.length}`], ...cats.map((c) => [c, `${c} ${count(c)}`])].map(([k, label]) => (
              <Pressable key={k} onPress={() => setCat(k)} onLongPress={() => k !== "all" && !count(k) && data.removeWishCategory(k)}
                style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: cat === k ? t.brand : t.line, backgroundColor: cat === k ? t.brandSoft : t.surface }}>
                <T size={13} weight={cat === k ? "700" : "400"} color={cat === k ? t.brand : undefined}>{label}</T>
              </Pressable>
            ))}
          </ScrollView>

          <Card>
            <H>What stands out{cat === "all" ? "" : ` in ${cat}`}</H>
            {wv && wv.needLogin ? <T muted>Shown once prices load.</T> : <SignalList items={signals} />}
          </Card>

          <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <H>{cat === "all" ? "Wishlist" : cat}</H>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented small value={sort} onChange={setSort} options={WSORTS} /></ScrollView>
            </View>
            <View style={{ marginTop: 8 }}>
              {sorted.map((w, i) => {
                const flags = flagsOf(w);
                const header = sort === "category" && cat === "all" && (i === 0 || sorted[i - 1].category !== w.category);
                return (
                  <View key={w.id}>
                    {header && <T size={12} weight="700" muted style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>{w.category.toUpperCase()}</T>}
                    <Pressable onPress={() => openStock(w)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                      <View style={{ flex: 1.3 }}>
                        <T weight="700">{w.symbol} {flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>●</T> : null}</T>
                        <T size={12} muted numberOfLines={1}>{owned(w) ? "You hold this · " : ""}{w.buyBelow ? `Buy at ${money(w.buyBelow)}` : cat === "all" && sort !== "category" ? w.category : w.name}</T>
                      </View>
                      <Spark values={w.spark} width={56} />
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <T weight="600">{w.ltp ? money(w.ltp, 2) : "—"}</T>
                        <T size={12} color={tone(t, w.dayPct)}>{w.dayPct != null ? `${pct(w.dayPct, 1)} today` : ""}{w.sinceAdded != null ? <T size={12} color={tone(t, w.sinceAdded)}>  {pct(w.sinceAdded)} since added</T> : null}</T>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
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
  return (
    <Screen>
      <Card>
        <T muted size={13}>{amc ? `${amc} mutual funds` : "Mutual funds"}, current value</T>
        <Big>{money(m.value)}</Big>
        <Row label="You invested" value={money(m.cost)} />
        <Row label="Profit / loss" value={`${signed(m.pnl)} (${pct(m.pnlPct)})`} color={tone(t, m.pnl)} />
        <Row label="Latest day" value={signed(m.dayChange)} color={tone(t, m.dayChange)} last />
        {(() => {
          const sch = fv.schemes || [];
          const est = sch.reduce((a, x) => a + (x.estimatedInstalments || 0), 0);
          const monthly = sch.reduce((a, x) => a + (x.nextSips || []).reduce((b, n) => b + n.amount, 0), 0);
          if (!monthly && !est) return null;
          return <T size={12} muted style={{ marginTop: 6 }}>{monthly ? `SIPs: ${money(monthly)} a month, added automatically.` : ""}{est ? ` Includes ${est} estimated instalment${est === 1 ? "" : "s"} since your last statement.` : ""}</T>;
        })()}
        {fv.perf && <Verdict x={fv.perf.xirr} nx={fv.perf.niftyXirr} what="Your funds are" />}
        <PerfChart perf={fv.perf} color={t.mf} label="Your funds" />
      </Card>
      <Card style={{ paddingHorizontal: 0, paddingBottom: 4 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <H>Funds</H>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented small value={sort} onChange={setSort} options={FSORTS} /></ScrollView>
        </View>
        <View style={{ marginTop: 8 }}>
          {rows.map((f) => {
            const flags = f.signals.filter((x) => x.level !== "info");
            return (
              <Pressable key={f.key} onPress={() => openFund(f)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
                <View style={{ flex: 1.4 }}>
                  <T weight="700" numberOfLines={1}>{f.short} {flags.length ? <T color={flags[0].level === "alert" ? t.loss : t.flag}>●</T> : null}</T>
                  <T size={12} muted numberOfLines={1}>{f.category ? f.category.split(" - ").pop() : f.folio !== "—" ? `Folio ${f.folio}` : "Added by you"}</T>
                </View>
                <Spark values={f.spark} width={50} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <T weight="600">{money(f.value)}</T>
                  <T size={12} color={tone(t, f.xirr)}>XIRR {pct(f.xirr)}</T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
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
