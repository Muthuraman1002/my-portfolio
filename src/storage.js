// Secrets live in the phone's secure storage (iOS Keychain / Android Keystore).
// Everything else (your purchases, plans, imported funds, cached prices) is a JSON file in the app's private folders.
import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";

export const SECRET_KEYS = ["accessToken", "mobile", "ucc", "mpin", "totpSecret"];
const SESSION_KEYS = ["token", "sid", "baseUrl", "greeting", "at"];

export async function getSecrets() {
  const out = {};
  for (const k of SECRET_KEYS) out[k] = (await SecureStore.getItemAsync(`kotak_${k}`)) || "";
  return out;
}
export async function setSecrets(values) {
  for (const k of SECRET_KEYS) {
    const v = (values[k] || "").trim();
    if (v) await SecureStore.setItemAsync(`kotak_${k}`, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(`kotak_${k}`);
  }
}
export async function getSession() {
  const s = {};
  for (const k of SESSION_KEYS) s[k] = await SecureStore.getItemAsync(`sess_${k}`);
  return s.baseUrl ? { ...s, at: Number(s.at) } : null;
}
export async function setSession(s) {
  for (const k of SESSION_KEYS) {
    if (s && s[k] != null) await SecureStore.setItemAsync(`sess_${k}`, String(s[k]), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(`sess_${k}`);
  }
}

const safe = (name) => name.replace(/[^a-zA-Z0-9_.-]/g, "_");

export async function readJSON(name, fallback) {
  try {
    const f = new File(Paths.document, safe(name) + ".json");
    if (!f.exists) return fallback;
    return JSON.parse(await f.text());
  } catch { return fallback; }
}
export async function writeJSON(name, value) {
  const f = new File(Paths.document, safe(name) + ".json");
  if (!f.exists) f.create();
  await f.write(JSON.stringify(value));
}

// Cache with a time limit, kept in the system cache folder (the OS may clear it)
export async function cached(name, ttlMs, loader) {
  const f = new File(Paths.cache, safe(name) + ".json");
  try {
    if (f.exists) {
      const c = JSON.parse(await f.text());
      if (Date.now() - c.at < ttlMs) return c.data;
    }
  } catch {}
  const data = await loader();
  if (data != null) {
    try { if (!f.exists) f.create(); await f.write(JSON.stringify({ at: Date.now(), data })); } catch {}
  }
  return data;
}

export async function clearAll() {
  for (const k of SECRET_KEYS) await SecureStore.deleteItemAsync(`kotak_${k}`);
  await setSession(null);
  for (const dir of [Paths.document, Paths.cache]) {
    try { for (const item of dir.list()) if (item.uri.endsWith(".json")) item.delete(); } catch {}
  }
}
