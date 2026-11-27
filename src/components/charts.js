import React, { useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme";
import { T } from "./ui";
import { shortDate } from "../format";

// Line chart with touch-to-read values. series: [{label, data, color, width, dash, dots}]
export function LineChart({ labels, series, height = 220, yFmt = (v) => String(Math.round(v)), valueFmt }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState(null);
  const pad = { l: 52, r: 8, t: 8, b: 22 };
  const { min, max } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const s of series) for (const v of s.data) if (v != null && isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    if (!isFinite(mn)) return { min: 0, max: 1 };
    const span = mx - mn || Math.abs(mx) || 1;
    const lo = mn - span * 0.05;
    return { min: mn >= 0 && lo < 0 ? 0 : lo, max: mx + span * 0.05 };
  }, [series]);
  const n = labels.length;
  const iw = Math.max(1, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const path = (data) => {
    const step = Math.max(1, Math.floor(n / 300)); // thin long series so drawing stays fast
    const idxs = [];
    for (let i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    let d = "", pen = false;
    for (const i of idxs) {
      const v = data[i];
      if (v == null || !isFinite(v)) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => true,
    onPanResponderGrant: (e) => setIdx(e.nativeEvent.locationX),
    onPanResponderMove: (e) => setIdx(e.nativeEvent.locationX),
    onPanResponderRelease: () => setIdx(null),
    onPanResponderTerminate: () => setIdx(null),
  })).current;
  const at = idx == null || n < 2 ? null : Math.max(0, Math.min(n - 1, Math.round(((idx - pad.l) / iw) * (n - 1))));
  const ticks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const xt = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [];
  const fmt = valueFmt || yFmt;
  return (
    <View>
      <View style={{ minHeight: 20, flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        {at != null ? (
          <>
            <T size={12} weight="700">{shortDate(labels[at])}</T>
            {series.filter((s) => !s.dots).map((s) => <T key={s.label} size={12} color={s.color}>{s.label}: {s.data[at] == null ? "—" : fmt(s.data[at])}</T>)}
          </>
        ) : (
          series.filter((s) => !s.hideLegend).map((s) => <T key={s.label} size={12} muted><T size={12} color={s.color}>━ </T>{s.label}</T>)
        )}
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} {...responder.panHandlers}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {ticks.map((v, i) => (
              <React.Fragment key={i}>
                <Line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke={t.line} strokeWidth={0.6} />
                <SvgText x={pad.l - 6} y={y(v) + 4} fontSize={10} fill={t.muted} textAnchor="end">{yFmt(v)}</SvgText>
              </React.Fragment>
            ))}
            {xt.map((i, k) => <SvgText key={k} x={x(i)} y={height - 6} fontSize={10} fill={t.muted} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}>{shortDate(labels[i])}</SvgText>)}
            {series.map((s) => s.dots
              ? s.data.map((v, i) => (v == null ? null : <Circle key={s.label + i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />))
              : <Path key={s.label} d={path(s.data)} stroke={s.color} strokeWidth={s.width || 2} fill="none" strokeDasharray={s.dash} strokeLinejoin="round" />)}
            {at != null && <Line x1={x(at)} x2={x(at)} y1={pad.t} y2={pad.t + ih} stroke={t.muted} strokeWidth={1} />}
            {at != null && series.filter((s) => !s.dots && s.data[at] != null).map((s) => <Circle key={s.label} cx={x(at)} cy={y(s.data[at])} r={3.5} fill={s.color} />)}
          </Svg>
        )}
      </View>
    </View>
  );
}

export function Spark({ values, width = 70, height = 24 }) {
  const t = useTheme();
  if (!values || values.length < 2) return <View style={{ width, height }} />;
  const mn = Math.min(...values), mx = Math.max(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - mn) / r) * (height - 4) - 2).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return <Svg width={width} height={height}><Polyline points={pts} fill="none" stroke={up ? t.gain : t.loss} strokeWidth={1.5} /></Svg>;
}

export function Bars({ items, color, heavyAt = 25 }) {
  const t = useTheme();
  const max = Math.max(...items.map((x) => x[1]), 1);
  return items.map(([name, w]) => (
    <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 5 }}>
      <T size={13} numberOfLines={1} style={{ width: 110 }}>{name}</T>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.ground, overflow: "hidden" }}>
        <View style={{ width: `${(w / max) * 100}%`, height: "100%", borderRadius: 5, backgroundColor: w >= heavyAt ? t.flag : color || t.brand }} />
      </View>
      <T size={13} weight="600" style={{ width: 48, textAlign: "right" }}>{w.toFixed(1)}%</T>
    </View>
  ));
}
