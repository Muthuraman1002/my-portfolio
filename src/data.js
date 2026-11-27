import * as LocalAuthentication from "expo-local-authentication";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Kotak } from "./kotak";
import * as A from "./analytics";
import * as MF from "./mf";
import * as M from "./market";
import { cached, getSecrets, getSession, readJSON, setSecrets, setSession, writeJSON, clearAll } from "./storage";
import { demo, demoBuyDate, demoHoldings, demoQuote } from "./demo";
import { totp } from "./totp";

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const USER_DEFAULT = { lots: {}, levels: {}, watchlist: [], wishlist: [], wishCategories: ["Long term", "Dividend", "Momentum"], settings: { amcFilter: "Tata", demo: false, lock: false, defaultBuyDate: null, allowBuying: false } };
const istDay = (ms) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);

export function DataProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(USER_DEFAULT);
  const [secrets, setSecretsState] = useState({});
  const [funds, setFunds] = useState({ schemes: [], importedAt: null, period: null });
  const [shares, setShares] = useState(null);     // { holdings, summary, nifty, perf }
  const [fundView, setFundView] = useState(null); // { rows, summary, perf }
  const [wishView, setWishView] = useState(null); // { rows } with prices and signals
  const [status, setStatus] = useState({ loading: false, error: null, needLogin: false, asOf: null });
  const kotak = useRef(null);
  const stockList = useRef(null);

  const isDemo = user.settings.demo;
  const hasKotak = !!(secrets.accessToken && secrets.mobile && secrets.ucc);

  // ---------- boot
  useEffect(() => {
    (async () => {
      const [u, s, f] = await Promise.all([readJSON("user", USER_DEFAULT), getSecrets(), readJSON("funds", { schemes: [] })]);
      setUser({ ...USER_DEFAULT, ...u, settings: { ...USER_DEFAULT.settings, ...(u.settings || {}) } });
      setSecretsState(s); setFunds(f);
      if (s.accessToken) {
        kotak.current = new Kotak(s);
        const sess = await getSession();
        if (sess && istDay(sess.at) === istDay(Date.now())) kotak.current.restore(sess);
      }
      setReady(true);
    })();
  }, []);

  const saveUser = useCallback(async (next) => { setUser(next); await writeJSON("user", next); }, []);
  const saveFunds = useCallback(async (next) => { setFunds(next); await writeJSON("funds", next); }, []);

  // ---------- sources
  const bench = useCallback(async (from) => (isDemo ? demo().nifty.filter((x) => x[0] >= from) : M.yahooHistory("^NSEI", from, A.todayISO())), [isDemo]);

  const stockHistory = useCallback(async (item, from, to) => {
    if (isDemo) return (demo().series[item.id] || []).filter((x) => x[0] >= from && x[0] <= to);
    return cached(`h_${item.id}_${from}_${to}`, 6 * 3600e3, async () => {
      let rows = [];
      try { rows = await kotak.current.history(item.segment, item.token, from, to); } catch (e) { if (e.session) throw e; }
      if (rows.length < 5 && item.symbol) rows = await M.yahooHistory(`${item.symbol}${item.segment.startsWith("bse") ? ".BO" : ".NS"}`, from, to);
      return rows;
    });
  }, [isDemo]);

  const navOf = useCallback(async (code) => (isDemo && demo().navs[code] ? { rows: demo().navs[code], meta: demo().metas[code] } : M.navHistory(code)), [isDemo]);

  // ---------- Kotak login
  const ensureLogin = useCallback(async () => {
    if (isDemo) return true;
    if (!kotak.current) return false;
    if (kotak.current.loggedIn) return true;
    if (secrets.totpSecret && secrets.mpin) {
      try { await loginKotak(totp(secrets.totpSecret), secrets.mpin); return true; } catch { /* fall back to asking */ }
    }
    setStatus((s) => ({ ...s, needLogin: true }));
    return false;
  }, [isDemo, secrets]);

  const loginKotak = useCallback(async (code, mpin) => {
    const sess = await kotak.current.login(code, mpin || secrets.mpin);
    await setSession(sess);
    setStatus((s) => ({ ...s, needLogin: false }));
    return sess;
  }, [secrets]);

  const saveKotakDetails = useCallback(async (values) => {
    await setSecrets(values);
    const s = await getSecrets();
    setSecretsState(s);
    kotak.current = s.accessToken ? new Kotak(s) : null;
    await setSession(null);
    if (user.settings.demo) await saveUser({ ...user, settings: { ...user.settings, demo: false } });
  }, [user, saveUser]);

  // ---------- shares
  const loadShares = useCallback(async () => {
    if (!isDemo && !hasKotak) return null;
    if (!(await ensureLogin())) return null;
    const holdings = isDemo ? demoHoldings() : await kotak.current.holdings();
    let quotes = {};
    if (isDemo) quotes = Object.fromEntries(holdings.map((h) => [h.id, demoQuote(h.id)]));
    else if (holdings.length) {
      // Prices are a nice-to-have here: without them holdings fall back to yesterday's close.
      let live = {};
      try { live = await kotak.current.quotes(holdings.map((h) => h.quoteId)); } catch (e) { if (e.session) throw e; console.warn(e.message); }
      for (const h of holdings) if (live[h.quoteId]) quotes[h.id] = live[h.quoteId];
    }
    const nifty = isDemo ? (() => { const n = demo().nifty; const a = n[n.length - 1][1], b = n[n.length - 2][1]; return { ltp: a, pctChange: (a / b - 1) * 100 }; })() : await M.niftyQuote();
    const today = A.todayISO();
    const lotsFor = (h) => {
      const saved = user.lots[h.id];
      if (saved && saved.length) return [saved, false];
      const d = isDemo ? demoBuyDate(h.symbol) : user.settings.defaultBuyDate || A.addDays(today, -365);
      return [[{ date: d, qty: h.quantity, price: h.avgPrice }], true];
    };
    const firsts = holdings.map((h) => lotsFor(h)[0].reduce((m, l) => (l.date < m ? l.date : m), today));
    const from = [A.addDays(today, -430), ...firsts].sort()[0];
    const bh = await bench(from);
    const histories = {};
    for (const h of holdings) {
      const q = quotes[h.id] || {};
      h.ltp = q.ltp || h.closePrice || h.avgPrice; h.dayChange = q.change || 0; h.dayPct = q.pctChange || 0;
      h.value = h.quantity * h.ltp; h.pnl = h.value - h.cost; h.pnlPct = h.cost ? (h.pnl / h.cost) * 100 : 0; h.dayPnl = h.quantity * h.dayChange;
      histories[h.id] = await stockHistory(h, from, today);
    }
    const total = holdings.reduce((a, h) => a + h.value, 0) || 1;
    const lotsById = {};
    for (const h of holdings) {
      const hist = histories[h.id];
      const ind = A.indicators(hist, h.ltp);
      const q = quotes[h.id] || {};
      if (q.yearHigh && q.yearLow) { ind.high52 = Math.max(q.yearHigh, ind.high52 || 0); ind.low52 = Math.min(q.yearLow, ind.low52 || q.yearLow); ind.fromHigh52 = (h.ltp / ind.high52 - 1) * 100; ind.fromLow52 = (h.ltp / ind.low52 - 1) * 100; }
      const [lots, est] = lotsFor(h);
      lotsById[h.id] = lots;
      const first = lots.reduce((m, l) => (l.date < m ? l.date : m), today);
      const p0 = A.priceOn(hist, first), b0 = A.priceOn(bh, first), bl = nifty && nifty.ltp ? nifty.ltp : bh.length ? bh[bh.length - 1][1] : null;
      h.sinceFirst = p0 ? (h.ltp / p0 - 1) * 100 : null;
      h.niftySinceFirst = b0 && bl ? (bl / b0 - 1) * 100 : null;
      h.vsNifty = h.sinceFirst != null && h.niftySinceFirst != null ? h.sinceFirst - h.niftySinceFirst : null;
      h.firstBuy = first; h.lotsEstimated = est; h.lots = lots;
      h.weight = (h.value / total) * 100; h.ind = ind; h.levels = user.levels[h.id] || {};
      h.spark = hist.slice(-63).map((x) => x[1]);
      h.signals = A.stockSignals(h, ind, h.levels, h.weight, h.vsNifty);
    }
    const cost = holdings.reduce((a, h) => a + h.cost, 0);
    const summary = { value: holdings.reduce((a, h) => a + h.value, 0), cost, pnl: holdings.reduce((a, h) => a + h.pnl, 0), dayPnl: holdings.reduce((a, h) => a + h.dayPnl, 0) };
    summary.pnlPct = cost ? (summary.pnl / cost) * 100 : 0;
    summary.dayPct = summary.value - summary.dayPnl ? (summary.dayPnl / (summary.value - summary.dayPnl)) * 100 : 0;
    const sectors = {};
    holdings.forEach((h) => (sectors[h.sector] = (sectors[h.sector] || 0) + h.value));
    summary.sectors = Object.entries(sectors).map(([k, v]) => [k, (v / total) * 100]).sort((a, b) => b[1] - a[1]);
    const perf = A.sharePerformance(holdings, lotsById, histories, bh);
    if (perf) perf.estimated = holdings.filter((h) => h.lotsEstimated).length;
    return { holdings, summary, nifty, perf };
  }, [isDemo, hasKotak, ensureLogin, user, bench, stockHistory]);

  // ---------- funds
  const fundSchemes = useMemo(() => {
    const manual = funds.schemes.filter((s) => s.source === "manual");
    return isDemo ? [...demo().schemes, ...manual] : funds.schemes;
  }, [isDemo, funds]);

  const loadFunds = useCallback(async () => {
    if (!fundSchemes.length) return null;
    const navs = {}, metas = {};
    for (const s of fundSchemes) {
      if (!s.code || navs[s.code]) continue;
      try { const r = await navOf(s.code); navs[s.code] = r.rows; metas[s.code] = r.meta; } catch { navs[s.code] = []; }
    }
    const firsts = fundSchemes.filter((s) => s.transactions.length).map((s) => s.transactions[0].date).sort();
    const bh = await bench(firsts[0] || A.addDays(A.todayISO(), -400));
    const rows = MF.fundRows(fundSchemes, navs, metas, bh);
    const value = rows.reduce((a, r) => a + r.value, 0), cost = rows.reduce((a, r) => a + r.cost, 0);
    const cats = {};
    rows.forEach((r) => { const c = (r.category.split(" - ").pop() || "Other").trim(); cats[c] = (cats[c] || 0) + r.value; });
    const summary = { value, cost, pnl: value - cost, pnlPct: cost ? (value / cost - 1) * 100 : 0, dayChange: rows.reduce((a, r) => a + r.dayChange, 0),
      categories: Object.entries(cats).map(([k, v]) => [k, (v / (value || 1)) * 100]).sort((a, b) => b[1] - a[1]) };
    return { rows, summary, perf: MF.fundPerformance(fundSchemes, navs, bh), navs };
  }, [fundSchemes, navOf, bench]);

  // ---------- wishlist
  // Kotak's Trade API has no watchlist endpoint, so the wishlist lives on this phone.
  // Item: { id, quoteId, segment, token, symbol, name, category, addedAt, addedPrice, buyBelow }
  const loadWishlist = useCallback(async ({ prompt = true } = {}) => {
    const items = user.wishlist || [];
    if (!items.length) return { rows: [] };
    if (!isDemo) {
      const offline = { rows: items.map((w) => ({ ...w, ind: {}, signals: [], spark: [] })), needLogin: true };
      if (!hasKotak || (!prompt && !(kotak.current && kotak.current.loggedIn))) return offline;
      if (!(await ensureLogin())) return offline;
    }
    let quotes = {};
    if (isDemo) items.forEach((w) => (quotes[w.quoteId] = demoQuote(w.id) || {}));
    else { try { quotes = await kotak.current.quotes(items.map((w) => w.quoteId)); } catch (e) { if (e.session) throw e; console.warn(e.message); } }
    const today = A.todayISO(), from = A.addDays(today, -430);
    const bh = await bench(from);
    const niftyNow = bh.length ? bh[bh.length - 1][1] : null;
    const rows = [];
    for (const w of items) {
      const q = quotes[w.quoteId] || {};
      let hist = [];
      try { hist = await stockHistory(w, from, today); } catch (e) { if (e.session) throw e; }
      const ltp = q.ltp || (hist.length ? hist[hist.length - 1][1] : null);
      const ind = hist.length ? A.indicators(hist, ltp) : {};
      if (q.yearHigh && q.yearLow && ltp) { ind.high52 = Math.max(q.yearHigh, ind.high52 || 0); ind.low52 = Math.min(q.yearLow, ind.low52 || q.yearLow); ind.fromHigh52 = (ltp / ind.high52 - 1) * 100; ind.fromLow52 = (ltp / ind.low52 - 1) * 100; }
      const b0 = A.priceOn(bh, w.addedAt);
      const row = {
        ...w, ltp, dayPct: q.pctChange != null ? q.pctChange : null, ind,
        sinceAdded: w.addedPrice && ltp ? (ltp / w.addedPrice - 1) * 100 : null,
        niftySince: b0 && niftyNow && w.addedAt < today ? (niftyNow / b0 - 1) * 100 : null,
        spark: hist.slice(-63).map((x) => x[1]),
      };
      row.signals = A.wishlistSignals(row, ind);
      rows.push(row);
    }
    return { rows };
  }, [user.wishlist, isDemo, hasKotak, ensureLogin, bench, stockHistory]);

  // ---------- refresh everything
  const refresh = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    const errors = [];
    try { setShares(await loadShares()); } catch (e) { if (e.session) { kotak.current && kotak.current.logout(); await setSession(null); setStatus((s) => ({ ...s, needLogin: true })); } errors.push(e.message); }
    try { setFundView(await loadFunds()); } catch (e) { errors.push(e.message); }
    try { setWishView(await loadWishlist()); } catch (e) { errors.push(e.message); }
    setStatus((s) => ({ ...s, loading: false, error: errors[0] || null, asOf: new Date() }));
  }, [loadShares, loadFunds, loadWishlist]);

  useEffect(() => { if (ready) refresh(); }, [ready, isDemo, hasKotak, funds, user.lots, user.levels]); // eslint-disable-line
  // Editing the wishlist reloads only the wishlist, and never prompts for a login on its own.
  const wishKey = (user.wishlist || []).map((w) => `${w.id}:${w.buyBelow || ""}`).join(",");
  const firstWish = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstWish.current) { firstWish.current = false; return; }
    loadWishlist({ prompt: false }).then(setWishView).catch(() => {});
  }, [ready, wishKey]); // eslint-disable-line

  // ---------- details
  const stockDetail = useCallback(async (item) => {
    if (!(await ensureLogin())) throw new Error("Log in to Kotak Neo to see prices.");
    const today = A.todayISO();
    const hist = await stockHistory(item, A.addDays(today, -730), today);
    let q = {};
    try { q = isDemo ? demoQuote(item.id) || {} : (await kotak.current.quotes([item.quoteId || item.id]))[item.quoteId || item.id] || {}; } catch {}
    const ltp = q.ltp || (hist.length ? hist[hist.length - 1][1] : null);
    const closes = hist.map((x) => x[1]);
    return { quote: q, ltp, ind: hist.length ? A.indicators(hist, ltp) : {}, dates: hist.map((x) => x[0]), close: closes, sma50: A.smaSeries(closes, 50), sma200: A.smaSeries(closes, 200) };
  }, [ensureLogin, stockHistory, isDemo]);

  const searchStocks = useCallback(async (q) => {
    q = q.trim().toUpperCase();
    if (q.length < 2) return [];
    let list;
    if (isDemo) list = demo().list.map(({ id, segment, token, symbol, name }) => ({ id, segment, token, symbol, name }));
    else {
      if (!(await ensureLogin())) return [];
      if (!stockList.current) stockList.current = await cached("stocklist", 20 * 3600e3, () => kotak.current.stockList());
      list = stockList.current;
    }
    const starts = list.filter((r) => r.symbol.toUpperCase().startsWith(q)).sort((a, b) => a.symbol.length - b.symbol.length);
    const named = list.filter((r) => !r.symbol.toUpperCase().startsWith(q) && r.name.toUpperCase().includes(q));
    return [...starts, ...named].slice(0, 20);
  }, [isDemo, ensureLogin]);

  const compare = useCallback(async (items, period) => {
    const days = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096 }[period] || 366;
    const today = A.todayISO(), from = A.addDays(today, -days);
    const bh = await bench(from);
    const dates = bh.map((x) => x[0]);
    const series = [];
    if (bh.length) series.push({ label: "Nifty 50", id: "nifty", values: bh.map(([, c]) => (c / bh[0][1] - 1) * 100) });
    for (const it of items) {
      let hist;
      if (it.id.startsWith("mf|")) hist = (await navOf(it.id.slice(3))).rows.filter((x) => x[0] >= from);
      else hist = await stockHistory({ ...it, segment: it.id.split("|")[0], token: it.id.split("|")[1] }, from, today);
      if (!hist.length) continue;
      const p0 = hist[0][1];
      series.push({ label: it.symbol, id: it.id, values: dates.map((d) => { const v = A.priceOn(hist, d); return v ? (v / p0 - 1) * 100 : null; }) });
    }
    return { dates, series };
  }, [bench, navOf, stockHistory]);

  // ---------- gold and silver
  // MCX prices need a Kotak session; without one only COMEX and the rupee are shown (no login prompt).
  const mcxMetals = useCallback(async () => {
    if (isDemo || !kotak.current || !kotak.current.loggedIn) return null;
    const contracts = await cached("mcx_metals", 12 * 3600e3, () => kotak.current.mcxFutures(["GOLD", "SILVER"]));
    const ids = Object.values(contracts || {}).map((c) => c.id);
    if (!ids.length) return null;
    const q = await kotak.current.quotes(ids);
    const pick = (c) => {
      if (!c) return null;
      const v = q[c.id] || (Object.entries(q).find(([k]) => k.endsWith(`|${c.token}`)) || [])[1];
      return v && v.ltp ? { ...v, contract: c.symbol } : null;
    };
    return { gold: pick(contracts.GOLD), silver: pick(contracts.SILVER) };
  }, [isDemo, shares]); // eslint-disable-line

  // ---------- buying
  // Every buy goes through here: buying must be switched on, it's never allowed with demo data,
  // and Face ID (or the phone passcode) is asked for each order, so the screen alone can't place one.
  const resolveTradingSymbol = useCallback(async (item) => {
    if (item.tradingSymbol) return item.tradingSymbol;
    const segment = item.segment || item.id.split("|")[0], token = item.token || item.id.split("|")[1];
    const map = await cached(`ts_${segment}`, 20 * 3600e3, () => kotak.current.tradingSymbols(segment));
    return map[token] || null;
  }, []);

  const buyShares = useCallback(async (item, { qty, type, price, amo }) => {
    if (isDemo) throw new Error("Buying is off while demo data is on.");
    if (!user.settings.allowBuying) throw new Error("Turn on \"Allow buying shares\" in Accounts first.");
    if (!(await ensureLogin())) throw new Error("Log in to Kotak Neo first.");
    const tradingSymbol = await resolveTradingSymbol(item);
    if (!tradingSymbol) throw new Error(`Couldn't find ${item.symbol} in Kotak's stock list.`);
    if (!(await LocalAuthentication.isEnrolledAsync())) throw new Error("Set up Face ID or a passcode on your phone to buy shares.");
    const what = `${qty} ${item.symbol}${type === "L" ? ` at ₹${price.toFixed(2)}` : " at market price"}`;
    const auth = await LocalAuthentication.authenticateAsync({ promptMessage: `Buy ${what}` });
    if (!auth.success) throw new Error("Not confirmed, so no order was placed.");
    const segment = item.segment || item.id.split("|")[0];
    const orderNo = await kotak.current.placeBuy({ segment, tradingSymbol, qty, type, price, amo });
    let order = null;
    try { order = (await kotak.current.orders()).find((o) => o.no === orderNo) || null; } catch {}
    return { orderNo, order, tradingSymbol };
  }, [isDemo, user.settings.allowBuying, ensureLogin, resolveTradingSymbol]);

  const todaysOrders = useCallback(async () => {
    if (isDemo || !kotak.current || !kotak.current.loggedIn) return null;
    return kotak.current.orders();
  }, [isDemo]);

  // ---------- your data
  const saveLots = (id, lots) => saveUser({ ...user, lots: lots.length ? { ...user.lots, [id]: lots } : Object.fromEntries(Object.entries(user.lots).filter(([k]) => k !== id)) });
  const saveLevels = (id, lv) => saveUser({ ...user, levels: { ...user.levels, [id]: lv } });
  const saveWatchlist = (items) => saveUser({ ...user, watchlist: items });
  const wishItem = (id) => (user.wishlist || []).find((w) => w.id === id);
  const addToWishlist = (item, category, price) => {
    const cat = (category || "").trim() || "Other";
    const w = {
      id: item.id, quoteId: item.quoteId || item.id, segment: item.segment || item.id.split("|")[0], token: item.token || item.id.split("|")[1],
      symbol: item.symbol, name: item.name || item.symbol, category: cat, addedAt: A.todayISO(), addedPrice: price || null, buyBelow: null,
    };
    const cats = user.wishCategories || [];
    return saveUser({ ...user, wishlist: [...(user.wishlist || []).filter((x) => x.id !== item.id), w], wishCategories: cats.includes(cat) ? cats : [...cats, cat] });
  };
  const updateWishItem = (id, patch) => {
    const cats = user.wishCategories || [];
    const cat = patch.category && patch.category.trim();
    return saveUser({ ...user, wishlist: (user.wishlist || []).map((w) => (w.id === id ? { ...w, ...patch } : w)), wishCategories: cat && !cats.includes(cat) ? [...cats, cat] : cats });
  };
  const removeFromWishlist = (id) => saveUser({ ...user, wishlist: (user.wishlist || []).filter((w) => w.id !== id) });
  const removeWishCategory = (cat) => saveUser({ ...user, wishCategories: (user.wishCategories || []).filter((c) => c !== cat), wishlist: (user.wishlist || []).map((w) => (w.category === cat ? { ...w, category: "Other" } : w)) });
  const saveSettings = (patch) => saveUser({ ...user, settings: { ...user.settings, ...patch } });

  const importStatement = async (parsed) => {
    const schemes = MF.schemesFromCAS(parsed, user.settings.amcFilter);
    if (!schemes.length) {
      const found = [...new Set(parsed.folios.map((f) => f.amc || "?"))].join(", ");
      throw new Error(`No ${user.settings.amcFilter || ""} funds in this statement. It has: ${found}`);
    }
    const codes = await M.isinCodes(schemes.map((s) => s.isin));
    for (const s of schemes) s.code = codes[s.isin] || "";
    const manual = funds.schemes.filter((s) => s.source === "manual" && !schemes.some((x) => x.code && x.code === s.code));
    await saveFunds({ schemes: [...schemes, ...manual], importedAt: new Date().toISOString(), period: parsed.period });
    return { funds: schemes.length, transactions: schemes.reduce((a, s) => a + s.transactions.length, 0), missingNav: schemes.filter((s) => !s.code).length };
  };
  const addManualFund = async (code, name, entries) => {
    const { rows } = await navOf(code);
    if (!rows.length) throw new Error("Couldn't load NAVs for that fund.");
    const s = MF.manualScheme(code, name, entries, rows);
    await saveFunds({ ...funds, schemes: [...funds.schemes.filter((x) => x.key !== s.key), s] });
  };
  const removeFund = (key) => saveFunds({ ...funds, schemes: funds.schemes.filter((s) => s.key !== key) });
  const schemeByKey = (key) => fundSchemes.find((s) => s.key === key);

  const setDemo = (on) => saveSettings({ demo: on });
  const logoutKotak = async () => { kotak.current && kotak.current.logout(); await setSession(null); setShares(null); };
  const eraseEverything = async () => { await clearAll(); kotak.current = null; setSecretsState({}); setFunds({ schemes: [] }); setUser(USER_DEFAULT); setShares(null); setFundView(null); setWishView(null); };

  const value = {
    ready, user, secrets, hasKotak, isDemo, funds, shares, fundView, wishView, status, refresh,
    buyShares, todaysOrders, wishItem, addToWishlist, updateWishItem, removeFromWishlist, removeWishCategory,
    loginKotak, saveKotakDetails, logoutKotak, stockDetail, mcxMetals, searchStocks, compare, navOf,
    saveLots, saveLevels, saveWatchlist, saveSettings, importStatement, addManualFund, removeFund, schemeByKey, setDemo, eraseEverything,
    dismissLogin: () => setStatus((s) => ({ ...s, needLogin: false })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
