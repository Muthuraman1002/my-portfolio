import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, marginBottom: 12 }, style]}>{children}</View>;
}
export function T({ children, style, size = 15, weight = "400", color, muted, numberOfLines, selectable }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} selectable={selectable} style={[{ fontSize: size, fontWeight: weight, color: color || (muted ? t.muted : t.ink), fontVariant: ["tabular-nums"] }, style]}>{children}</Text>;
}
export const H = ({ children, style }) => <T size={17} weight="700" style={[{ marginBottom: 8 }, style]}>{children}</T>;
export const Big = ({ children, color }) => <T size={34} weight="800" color={color} style={{ letterSpacing: -1, marginVertical: 2 }}>{children}</T>;

export function Row({ label, value, color, last }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: t.line, borderStyle: "dashed" }}>
      <T muted size={14}>{label}</T><T size={14} weight="600" color={color}>{value}</T>
    </View>
  );
}

export function Button({ title, onPress, kind = "solid", disabled, loading, style, danger }) {
  const t = useTheme();
  const solid = kind === "solid";
  const c = danger ? t.loss : t.brand;
  return (
    <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: solid ? c : "transparent", borderColor: c, borderWidth: 1, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center", opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={solid ? t.surface : c} /> : <T weight="600" color={solid ? t.surface : c}>{title}</T>}
    </Pressable>
  );
}

export function Segmented({ options, value, onChange, small }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.ground, borderRadius: 8, padding: 3, alignSelf: "flex-start", flexWrap: "wrap" }}>
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: value === k }}
          style={{ paddingVertical: small ? 4 : 6, paddingHorizontal: small ? 9 : 12, borderRadius: 6, backgroundColor: value === k ? t.surface : "transparent" }}>
          <T size={small ? 12 : 13} weight={value === k ? "700" : "400"} muted={value !== k}>{label}</T>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, hint, ...props }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <T size={13} muted style={{ marginBottom: 4 }}>{label}</T>
      <TextInput placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false}
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.ground, color: t.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }} {...props} />
      {hint ? <T size={12} muted style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export const Dot = ({ level }) => {
  const t = useTheme();
  return <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: level === "alert" ? t.loss : level === "watch" ? t.flag : t.inv }} />;
};

export function SignalList({ items, onPress, max = 14 }) {
  if (!items.length) return <T muted>Nothing unusual right now.</T>;
  return items.slice(0, max).map((s, i) => (
    <Pressable key={i} onPress={s.open || onPress} disabled={!s.open && !onPress} style={{ flexDirection: "row", gap: 10, paddingVertical: 7 }}>
      <Dot level={s.level} />
      <View style={{ flex: 1 }}>
        <T weight="600">{s.tag ? <T weight="700" color={undefined}>{s.tag}  </T> : null}{s.title}</T>
        <T size={13} muted>{s.why}</T>
      </View>
    </Pressable>
  ));
}

export function Sheet({ visible, onClose, title, children, footer }) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line }}>
          <T size={18} weight="800" numberOfLines={1} style={{ flex: 1 }}>{title}</T>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.ground, alignItems: "center", justifyContent: "center" }}>
            <T size={18}>×</T>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        {footer}
      </SafeAreaView>
    </Modal>
  );
}

export function Notice({ children, tone = "info" }) {
  const t = useTheme();
  const c = tone === "error" ? t.loss : tone === "warn" ? t.flag : t.brand;
  return <View style={{ borderLeftWidth: 3, borderColor: c, paddingLeft: 10, paddingVertical: 4, marginBottom: 12 }}><T size={14} color={tone === "error" ? t.loss : t.ink}>{children}</T></View>;
}

// Small labelled number, laid out in a grid with <Tiles>.
export function Tile({ label, value, sub, color, third, onCard }) {
  const t = useTheme();
  return (
    <View style={{ flexBasis: third ? "30%" : "47%", flexGrow: 1, backgroundColor: onCard ? t.surface : t.ground, borderRadius: onCard ? 12 : 10, padding: 10 }}>
      <T size={12} muted>{label}</T>
      <T size={17} weight="700" color={color} style={{ marginTop: 2 }} numberOfLines={1}>{value}</T>
      {sub ? <T size={11} muted numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}
export const Tiles = ({ children, style }) => <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}>{children}</View>;

// A thin bar split into coloured segments: items [{ value, color }]
export function SplitBar({ items, height = 10 }) {
  const t = useTheme();
  const total = items.reduce((a, x) => a + x.value, 0) || 1;
  return (
    <View style={{ flexDirection: "row", height, borderRadius: height / 2, overflow: "hidden", backgroundColor: t.ground, gap: 2 }}>
      {items.map((x, i) => <View key={i} style={{ width: `${(x.value / total) * 100}%`, backgroundColor: x.color }} />)}
    </View>
  );
}

// The coloured band at the top of a tab: label, headline number, a line under it, and optional extras (a split bar).
// It sits flush against the screen edges and the top bar, which takes the same colour.
export function Hero({ label, value, sub, color, children }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: color || t.band, marginHorizontal: -14, marginTop: -14, marginBottom: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 }}>
      {label ? <T size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>{label}</T> : null}
      {value != null ? <T size={32} weight="800" color="#FFFFFF" style={{ letterSpacing: -0.5 }}>{value}</T> : null}
      {sub ? <T size={14} weight="600" color="#FFFFFF">{sub}</T> : null}
      {children}
    </View>
  );
}

// A pill-shaped choice (filters, categories).
export function Chip({ label, on, onPress, onLongPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brandSoft : t.surface }}>
      <T size={13} weight={on ? "700" : "400"} color={on ? t.brand : undefined}>{label}</T>
    </Pressable>
  );
}

// Small caps heading above a group of rows.
export const SectionLabel = ({ children, style }) => <T size={12} weight="700" muted style={[{ letterSpacing: 0.4, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 6 }, style]}>{String(children).toUpperCase()}</T>;

// A small coloured status label, e.g. "Logged in".
export function Pill({ text, tone = "brand" }) {
  const t = useTheme();
  const c = tone === "gain" ? t.gain : tone === "loss" ? t.loss : tone === "flag" ? t.flag : tone === "muted" ? t.muted : t.brand;
  return <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: c + "1F" }}><T size={12} weight="700" color={c}>{text}</T></View>;
}

// One row in a grouped list: title, optional line under it, and something on the right (a value, pill or switch).
export function ListRow({ title, sub, right, onPress, last, chevron }) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: t.line }}>
      <View style={{ flex: 1 }}>
        <T weight="600">{title}</T>
        {sub ? <T size={12} muted>{sub}</T> : null}
      </View>
      {typeof right === "string" ? <T size={14} muted>{right}</T> : right}
      {chevron ? <T size={18} color={t.muted}>›</T> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? t.brandSoft : "transparent" })}>{body}</Pressable> : body;
}

// A white rounded group holding ListRows.
export function Group({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, overflow: "hidden" }, style]}>{children}</View>;
}
