import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as LocalAuthentication from "expo-local-authentication";
import { useData } from "../data";
import { useTheme } from "../theme";
import { Button, Card, Field, H, Notice, Row, Sheet, T } from "../components/ui";
import { parseCAS } from "../cas/parse";
import { searchFunds } from "../market";
import { todayISO } from "../analytics";
import { totp } from "../totp";
import { Screen } from "./Tabs";

// ================================================================ Accounts tab
export function Accounts({ openImport, openManual, openLogin }) {
  const data = useData();
  const t = useTheme();
  const [form, setForm] = useState({ accessToken: "", mobile: "", ucc: "", mpin: "", totpSecret: "" });
  const [editing, setEditing] = useState(!data.hasKotak);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [amc, setAmc] = useState(data.user.settings.amcFilter || "");
  const [buyDate, setBuyDate] = useState(data.user.settings.defaultBuyDate || "");
  useEffect(() => { setEditing(!data.hasKotak); }, [data.hasKotak]);

  const startEdit = () => { setForm({ ...data.secrets }); setEditing(true); setMsg(null); };
  const save = async () => {
    if (!form.accessToken.trim() || !form.mobile.trim() || !form.ucc.trim()) return setMsg({ tone: "error", text: "Access token, mobile number and client code are needed." });
    if (form.mpin && !/^\d{4,6}$/.test(form.mpin)) return setMsg({ tone: "error", text: "MPIN should be 4–6 digits." });
    setBusy(true);
    try {
      await data.saveKotakDetails(form);
      setEditing(false); setMsg({ tone: "info", text: "Saved. Log in to load your holdings." });
      openLogin();
    } finally { setBusy(false); }
  };

  const toggleLock = async (on) => {
    if (on) {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!ok) return Alert.alert("Not available", "Set up Face ID, Touch ID or a fingerprint on your phone first.");
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Turn on app lock" });
      if (!r.success) return;
    }
    data.saveSettings({ lock: on });
  };

  const toggleBuying = async (on) => {
    if (!on) return data.saveSettings({ allowBuying: false });
    if (!(await LocalAuthentication.isEnrolledAsync())) return Alert.alert("Not available", "Set up Face ID, Touch ID or a passcode on your phone first. Every order is confirmed with it.");
    Alert.alert("Allow buying shares?", "This lets the app place real buy orders with Kotak Securities from your account. Each order shows a review screen and asks for Face ID. The app can't sell, change or cancel orders.", [
      { text: "Cancel", style: "cancel" },
      { text: "Allow", onPress: async () => { const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Allow buying shares" }); if (r.success) data.saveSettings({ allowBuying: true }); } },
    ]);
  };

  const k = data.secrets;
  return (
    <Screen>
      <Card>
        <H>Kotak Neo — shares</H>
        {!editing ? (
          <>
            <Row label="Client code" value={k.ucc} />
            <Row label="Mobile" value={k.mobile ? k.mobile.replace(/\d(?=\d{4})/g, "•") : "—"} />
            <Row label="MPIN saved" value={k.mpin ? "Yes" : "No — asked at login"} />
            <Row label="Automatic login" value={k.totpSecret && k.mpin ? "On (TOTP secret saved)" : "Off"} last />
            {msg && <View style={{ marginTop: 10 }}><Notice tone={msg.tone}>{msg.text}</Notice></View>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Button kind="ghost" title="Change details" style={{ flex: 1 }} onPress={startEdit} />
              <Button title={data.shares ? "Log in again" : "Log in"} style={{ flex: 1 }} onPress={openLogin} />
            </View>
            {data.shares && !data.isDemo && <Button kind="ghost" title="Log out of Kotak" style={{ marginTop: 10 }} onPress={data.logoutKotak} />}
          </>
        ) : (
          <>
            <T muted size={13} style={{ marginBottom: 12, lineHeight: 19 }}>
              In the Kotak Neo app, go to More → Trade API, create an application and copy its access token. Register TOTP on the same screen with Google or Microsoft Authenticator. This app reads your holdings and prices. It can place buy orders only if you turn on "Allow buying shares" below.
            </T>
            <Field label="Access token" value={form.accessToken} onChangeText={(v) => setForm({ ...form, accessToken: v })} secureTextEntry multiline={false} placeholder="Paste from Kotak Neo → Trade API" />
            <Field label="Registered mobile number" value={form.mobile} onChangeText={(v) => setForm({ ...form, mobile: v })} keyboardType="phone-pad" placeholder="+91 98xxxxxx10" />
            <Field label="Client code (UCC)" value={form.ucc} onChangeText={(v) => setForm({ ...form, ucc: v.toUpperCase() })} autoCapitalize="characters" />
            <Field label="MPIN (optional)" value={form.mpin} onChangeText={(v) => setForm({ ...form, mpin: v })} keyboardType="number-pad" secureTextEntry maxLength={6} hint="If you leave this empty, you'll be asked for it when you log in." />
            <Field label="TOTP secret (optional)" value={form.totpSecret} onChangeText={(v) => setForm({ ...form, totpSecret: v })} secureTextEntry
              hint="The text key shown under the QR code when you registered TOTP. With this and your MPIN saved, the app logs in by itself each day." />
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Button title="Save and log in" loading={busy} onPress={save} />
            {data.hasKotak && <Button kind="ghost" title="Cancel" style={{ marginTop: 10 }} onPress={() => setEditing(false)} />}
            <T size={12} muted style={{ marginTop: 10 }}>Stored only in this phone's secure storage ({"iOS Keychain / Android Keystore"}). Nothing is sent anywhere except to Kotak.</T>
          </>
        )}
      </Card>

      <Card>
        <H>CAMS — mutual funds</H>
        <T muted size={13} style={{ marginBottom: 10, lineHeight: 19 }}>
          CAMS doesn't offer an investor API, so there are no CAMS login details to enter. Instead, request your Consolidated Account Statement (CAS) by email and import the PDF here.
        </T>
        <Row label="Funds" value={data.funds.schemes.length ? `${data.funds.schemes.length} from your statement` : "None yet"} />
        <Row label="Last imported" value={data.funds.importedAt ? new Date(data.funds.importedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
        <Row label="Fund house kept" value={data.user.settings.amcFilter || "All"} last />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Button kind="ghost" title="Add by hand" style={{ flex: 1 }} onPress={openManual} />
          <Button title="Import statement" style={{ flex: 1 }} onPress={openImport} />
        </View>
        <Field label="Keep funds from" value={amc} onChangeText={setAmc} onEndEditing={() => data.saveSettings({ amcFilter: amc.trim() })}
          hint="Leave empty to keep every fund house in your statement. Applies to the next import." />
      </Card>

      <Card>
        <H>App</H>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
          <View style={{ flex: 1 }}><T>Lock with Face ID / fingerprint</T><T size={12} muted>Asked each time you open the app.</T></View>
          <Switch value={!!data.user.settings.lock} onValueChange={toggleLock} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
          <View style={{ flex: 1 }}><T>Allow buying shares</T><T size={12} muted>Delivery buy orders through Kotak Neo, each confirmed with Face ID. Off by default.</T></View>
          <Switch value={!!data.user.settings.allowBuying} onValueChange={toggleBuying} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
          <View style={{ flex: 1 }}><T>Demo data</T><T size={12} muted>Made-up holdings and funds to try the app.</T></View>
          <Switch value={data.isDemo} onValueChange={data.setDemo} />
        </View>
        <Field label="Estimated buy date for shares without purchase dates" placeholder="YYYY-MM-DD (default: a year ago)" value={buyDate} onChangeText={setBuyDate}
          onEndEditing={() => { if (!buyDate || /^\d{4}-\d{2}-\d{2}$/.test(buyDate)) data.saveSettings({ defaultBuyDate: buyDate || null }); else setBuyDate(data.user.settings.defaultBuyDate || ""); }} />
        <Button kind="ghost" danger title="Erase all data from this phone" style={{ marginTop: 6 }} onPress={() =>
          Alert.alert("Erase everything?", "This removes your Kotak details, imported funds, purchases and plans from this phone.", [
            { text: "Cancel", style: "cancel" }, { text: "Erase", style: "destructive", onPress: data.eraseEverything },
          ])} />
      </Card>
      <T size={12} muted style={{ lineHeight: 17 }}>Prices: Kotak Neo. Nifty 50 history: Yahoo Finance. Fund NAVs: mfapi.in (AMFI data). News: Google News.</T>
    </Screen>
  );
}

// ================================================================ Kotak login
export function LoginSheet({ visible, onClose }) {
  const data = useData();
  const [code, setCode] = useState("");
  const [mpin, setMpin] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(null); setBusy(true);
    try {
      let c = code.trim();
      if (!c && data.secrets.totpSecret) c = totp(data.secrets.totpSecret);
      if (!/^\d{6}$/.test(c)) throw new Error("Enter the 6-digit code from your authenticator app.");
      if (!data.secrets.mpin && !/^\d{4,6}$/.test(mpin)) throw new Error("Enter your MPIN.");
      await data.loginKotak(c, mpin);
      setCode(""); setMpin(""); onClose(); data.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Log in to Kotak Neo">
      <T muted style={{ marginBottom: 14 }}>Kotak sessions last for the day. Your code goes straight from this phone to Kotak.</T>
      <Field label="6-digit code from your authenticator app" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode"
        placeholder={data.secrets.totpSecret ? "Leave empty to use your saved secret" : ""} />
      {!data.secrets.mpin && <Field label="MPIN" value={mpin} onChangeText={setMpin} keyboardType="number-pad" secureTextEntry maxLength={6} />}
      {err && <Notice tone="error">{err}</Notice>}
      <Button title="Log in" loading={busy} onPress={go} />
    </Sheet>
  );
}

// ================================================================ CAS import
export function ImportSheet({ visible, onClose, reader }) {
  const data = useData();
  const t = useTheme();
  const [file, setFile] = useState(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState("");
  const pick = async () => {
    setErr(null);
    const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!r.canceled && r.assets && r.assets[0]) setFile(r.assets[0]);
  };
  const go = async () => {
    if (!file) return setErr("Choose your statement PDF first.");
    if (!pw) return setErr("Enter the PDF password.");
    setErr(null);
    try {
      setBusy("Opening the PDF…");
      const b64 = await new File(file.uri).base64();
      const pages = await reader.current.read(b64, pw);
      setBusy("Reading your transactions…");
      const parsed = parseCAS(pages);
      setBusy("Matching funds to their NAVs…");
      const r = await data.importStatement(parsed);
      setFile(null); setPw("");
      onClose();
      Alert.alert("Statement imported", `${r.funds} fund${r.funds === 1 ? "" : "s"} and ${r.transactions} transactions.${r.missingNav ? ` ${r.missingNav} fund${r.missingNav === 1 ? "" : "s"} couldn't be matched to a live NAV and will show the statement value.` : ""}`);
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const step = (n, text) => <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}><T weight="700" color={t.brand}>{n}.</T><T style={{ flex: 1, lineHeight: 20 }}>{text}</T></View>;
  return (
    <Sheet visible={visible} onClose={onClose} title="Import CAMS statement">
      {step(1, "On camsonline.com go to Investors → Statements → CAS – CAMS+KFintech (or use mfcentral.com).")}
      {step(2, "Choose Detailed (it includes transactions), then a specific period from your first investment until today.")}
      {step(3, "Set a password. The PDF arrives in your email in a few minutes. Save it to Files, then pick it here.")}
      <Pressable onPress={() => Linking.openURL("https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement")}><T color={t.brand} style={{ marginBottom: 14 }}>Open the CAMS statement page</T></Pressable>
      <Button kind="ghost" title={file ? `Chosen: ${file.name}` : "Choose statement PDF"} onPress={pick} />
      <View style={{ height: 12 }} />
      <Field label="PDF password" value={pw} onChangeText={setPw} secureTextEntry />
      <T size={12} muted style={{ marginBottom: 12 }}>Only {data.user.settings.amcFilter || "all"} funds are kept. The PDF is read on this phone and not uploaded. The PDF reader is downloaded from a public CDN the first time.</T>
      {err && <Notice tone="error">{err}</Notice>}
      <Button title={busy || "Import"} loading={!!busy} onPress={go} />
    </Sheet>
  );
}

// ================================================================ Manual fund
export function ManualFundSheet({ visible, onClose }) {
  const data = useData();
  const t = useTheme();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [pick, setPick] = useState(null);
  const [rows, setRows] = useState([{ date: "", amount: "", units: "" }]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 3) { setRes([]); return; }
    const h = setTimeout(async () => {
      try {
        const all = data.isDemo ? [] : await searchFunds(q);
        const flt = (data.user.settings.amcFilter || "").toLowerCase();
        setRes(all.filter((r) => !flt || r.name.toLowerCase().includes(flt)).slice(0, 15));
      } catch (e) { setErr(e.message); }
    }, 300);
    return () => clearTimeout(h);
  }, [q]); // eslint-disable-line
  const save = async () => {
    if (!pick) return setErr("Search for your fund and select it.");
    for (const r of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > todayISO()) return setErr("Use dates like 2024-06-15, not in the future.");
      if (!(+r.amount)) return setErr("Each row needs an amount.");
    }
    setBusy(true); setErr(null);
    try { await data.addManualFund(pick.code, pick.name, rows); onClose(); setPick(null); setRows([{ date: "", amount: "", units: "" }]); setQ(""); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a fund by hand">
      {data.isDemo && <Notice tone="warn">Turn off demo data in Accounts to search real funds.</Notice>}
      {!pick ? (
        <>
          <Field label="Find your fund" value={q} onChangeText={setQ} placeholder="e.g. Tata Small Cap Direct Growth" />
          {res.map((r) => (
            <Pressable key={r.code} onPress={() => setPick(r)} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}><T>{r.name}</T></Pressable>
          ))}
        </>
      ) : (
        <Pressable onPress={() => setPick(null)} style={{ marginBottom: 12 }}><T weight="700" color={t.brand}>{pick.name}</T><T size={12} muted>Tap to choose a different fund</T></Pressable>
      )}
      <T size={13} muted style={{ marginVertical: 10, lineHeight: 19 }}>Enter each investment. Use a negative amount for a redemption. Units are worked out from that day's NAV if you leave them empty.</T>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-end" }}>
          <View style={{ flex: 1.4 }}><Field label={i ? " " : "Date"} placeholder="2024-06-15" value={r.date} onChangeText={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, date: v } : x)))} /></View>
          <View style={{ flex: 1.2 }}><Field label={i ? " " : "Amount (₹)"} keyboardType="numbers-and-punctuation" value={r.amount} onChangeText={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: v } : x)))} /></View>
          <View style={{ flex: 1 }}><Field label={i ? " " : "Units"} keyboardType="decimal-pad" value={r.units} onChangeText={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, units: v } : x)))} /></View>
          <Pressable accessibilityLabel="Remove row" onPress={() => setRows(rows.filter((_, j) => j !== i))} style={{ paddingBottom: 22 }}><T muted size={20}>×</T></Pressable>
        </View>
      ))}
      <Button kind="ghost" title="Add another" onPress={() => setRows([...rows, { date: "", amount: "", units: "" }])} />
      {err && <View style={{ marginTop: 12 }}><Notice tone="error">{err}</Notice></View>}
      <Button title="Save fund" loading={busy} style={{ marginTop: 12 }} onPress={save} />
    </Sheet>
  );
}
