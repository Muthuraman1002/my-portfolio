import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as LocalAuthentication from "expo-local-authentication";
import { DataProvider, useData } from "./src/data";
import { useTheme } from "./src/theme";
import { Button, T } from "./src/components/ui";
import { Funds, Overview, Shares, Wishlist } from "./src/screens/Tabs";
import { Accounts, ImportSheet, LoginSheet, ManualFundSheet } from "./src/screens/Accounts";
import { FundSheet, StockSheet } from "./src/screens/Details";
import { PdfTextReader } from "./src/cas/PdfTextReader";

const TABS = [["overview", "Overview"], ["shares", "Shares"], ["wishlist", "Wishlist"], ["funds", "Funds"], ["accounts", "Accounts"]];

function TabIcon({ name, color }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {name === "overview" && <><Rect x="3" y="3" width="7" height="7" rx="1.5" {...p} /><Rect x="14" y="3" width="7" height="7" rx="1.5" {...p} /><Rect x="3" y="14" width="7" height="7" rx="1.5" {...p} /><Rect x="14" y="14" width="7" height="7" rx="1.5" {...p} /></>}
      {name === "shares" && <Path d="M3 17l5-5 4 3 8-8M15 7h5v5" {...p} />}
      {name === "wishlist" && <Path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" {...p} />}
      {name === "funds" && <><Circle cx="12" cy="12" r="8.5" {...p} /><Path d="M12 3.5V12l6 6" {...p} /></>}
      {name === "accounts" && <><Circle cx="12" cy="8" r="4" {...p} /><Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} /></>}
    </Svg>
  );
}

function Main() {
  const data = useData();
  const t = useTheme();
  const [tab, setTab] = useState("overview");
  const [stock, setStock] = useState(null);
  const [fund, setFund] = useState(null);
  const [sheet, setSheet] = useState(null); // "import" | "manual" | "login"
  const [locked, setLocked] = useState(null);
  const reader = useRef(null);

  // App lock: ask on open and whenever the app comes back from the background
  useEffect(() => {
    if (!data.ready) return;
    setLocked(!!data.user.settings.lock);
    const sub = AppState.addEventListener("change", (s) => { if (s === "background" && data.user.settings.lock) setLocked(true); });
    return () => sub.remove();
  }, [data.ready, data.user.settings.lock]);
  const unlock = async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock your portfolio" });
    if (r.success) setLocked(false);
  };
  useEffect(() => { if (locked) unlock(); }, [locked]);

  useEffect(() => { if (data.status.needLogin) setSheet("login"); }, [data.status.needLogin]);

  if (!data.ready || locked == null) return <View style={{ flex: 1, backgroundColor: t.ground }} />;
  if (locked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.ground, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <T size={22} weight="800" style={{ marginBottom: 8 }}>My portfolio</T>
        <T muted style={{ marginBottom: 20 }}>Locked</T>
        <Button title="Unlock" onPress={unlock} />
      </SafeAreaView>
    );
  }

  const title = { overview: "My portfolio", shares: "Shares", wishlist: "Wishlist", funds: "Mutual funds", accounts: "Accounts" }[tab];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 }}>
        <T size={22} weight="800">{title}</T>
        <T size={12} muted>{data.status.loading ? "Updating…" : data.status.asOf ? `Updated ${data.status.asOf.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</T>
      </View>
      <View style={{ flex: 1, backgroundColor: t.ground }}>
        {tab === "overview" && <Overview openStock={setStock} openFund={setFund} goTo={setTab} />}
        {tab === "shares" && <Shares openStock={setStock} goTo={setTab} />}
        {tab === "wishlist" && <Wishlist openStock={setStock} goTo={setTab} />}
        {tab === "funds" && <Funds openFund={setFund} openImport={() => setSheet("import")} openManual={() => setSheet("manual")} />}
        {tab === "accounts" && <Accounts openImport={() => setSheet("import")} openManual={() => setSheet("manual")} openLogin={() => setSheet("login")} />}
      </View>
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: t.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
        <View style={{ flexDirection: "row" }} accessibilityRole="tablist">
          {TABS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
              <TabIcon name={k} color={tab === k ? t.brand : t.muted} />
              <T size={11} weight={tab === k ? "700" : "400"} color={tab === k ? t.brand : t.muted}>{label}</T>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {stock && <StockSheet item={stock} onClose={() => setStock(null)} />}
      {fund && <FundSheet fund={fund} onClose={() => setFund(null)} />}
      <ImportSheet visible={sheet === "import"} onClose={() => setSheet(null)} reader={reader} />
      <ManualFundSheet visible={sheet === "manual"} onClose={() => setSheet(null)} />
      <LoginSheet visible={sheet === "login"} onClose={() => { setSheet(null); data.dismissLogin(); }} />
      <PdfTextReader ref={reader} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="auto" />
        <Main />
      </DataProvider>
    </SafeAreaProvider>
  );
}
