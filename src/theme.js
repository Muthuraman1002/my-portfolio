import { createContext, useContext } from "react";
import { useColorScheme } from "react-native";

const light = {
  ground: "#EDF0F2", surface: "#FFFFFF", ink: "#15202B", muted: "#5B6875", line: "#D5DBE1",
  brand: "#1F3A93", brandSoft: "rgba(31,58,147,0.09)", gain: "#0F7B5F", loss: "#B8322A", flag: "#B07805",
  nifty: "#8A6D3B", inv: "#8C98A4", mf: "#0E8A9A", series: ["#1F3A93", "#0E8A9A", "#7A3FB5", "#C2410C", "#4D7C0F"],
  // Allocation colours: distinct, colour-blind-friendly order
  band: "#1F3A93", bandMf: "#0B6F7C", // headline bands behind white text (both pass 4.5:1)
  alloc: ["#1F3A93", "#E69F00", "#0E8A9A", "#C2410C", "#7A3FB5", "#4D7C0F", "#B8336A", "#5B6875"],
};
const dark = {
  ground: "#0F1620", surface: "#17212D", ink: "#E6ECF2", muted: "#93A1B0", line: "#283544",
  brand: "#93AAFF", brandSoft: "rgba(147,170,255,0.12)", gain: "#3FC99A", loss: "#FF7A6B", flag: "#F2B33D",
  nifty: "#D9B77A", inv: "#6C7A88", mf: "#4FD1DE", series: ["#93AAFF", "#4FD1DE", "#C49BF2", "#FB923C", "#A3D96B"],
  band: "#25386E", bandMf: "#145660",
  alloc: ["#93AAFF", "#F6C453", "#4FD1DE", "#FB923C", "#C49BF2", "#A3D96B", "#F28CB1", "#9AA7B4"],
};
// Appearance chosen in Accounts: "system" follows the phone, or force "light" / "dark".
export const AppearanceContext = createContext("system");
export function useTheme() {
  const choice = useContext(AppearanceContext);
  const system = useColorScheme();
  return choice === "dark" || (choice !== "light" && system === "dark") ? dark : light;
}
export const tone = (t, v) => (v > 0 ? t.gain : v < 0 ? t.loss : t.ink);
