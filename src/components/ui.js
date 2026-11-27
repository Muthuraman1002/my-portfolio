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
