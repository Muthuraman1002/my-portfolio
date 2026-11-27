// Reads text (with positions) from a password-protected PDF, on the phone.
// pdf.js runs inside an invisible WebView; the PDF never leaves the device.
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

const PDFJS = "4.10.38";
const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
const SOURCES = [
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS}/pdf.min.mjs", "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS}/pdf.worker.min.mjs"],
  ["https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.min.mjs", "https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.worker.min.mjs"],
];
let lib = null;
async function load() {
  if (lib) return lib;
  for (const [main, worker] of SOURCES) {
    try { const m = await import(main); m.GlobalWorkerOptions.workerSrc = worker; lib = m; return m; } catch (e) {}
  }
  throw new Error("Couldn't load the PDF reader. Check your internet connection.");
}
const send = (o) => window.ReactNativeWebView.postMessage(JSON.stringify(o));
async function handle(raw) {
  let req; try { req = JSON.parse(raw); } catch { return; }
  try {
    const pdfjs = await load();
    const bin = atob(req.b64), data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const doc = await pdfjs.getDocument({ data, password: req.password, isEvalSupported: false, disableFontFace: true }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      pages.push(tc.items.filter((i) => i.str && Math.abs(i.transform[1]) < 0.01)
        .map((i) => ({ str: i.str, x: +i.transform[4].toFixed(2), y: +i.transform[5].toFixed(2), w: +(i.width || 0).toFixed(2) })));
    }
    send({ id: req.id, pages });
  } catch (e) {
    const pw = e && e.name === "PasswordException";
    send({ id: req.id, error: pw ? (e.code === 2 ? "wrong-password" : "need-password") : String((e && e.message) || e) });
  }
}
window.addEventListener("message", (e) => handle(e.data));
document.addEventListener("message", (e) => handle(e.data));
send({ ready: true });
</script></body></html>`;

export const PdfTextReader = forwardRef(function PdfTextReader(_, ref) {
  const web = useRef(null);
  const pending = useRef({});
  const ready = useRef(null);
  if (!ready.current) { let r; ready.current = { p: new Promise((res) => (r = res)), r }; }

  useImperativeHandle(ref, () => ({
    async read(b64, password) {
      await Promise.race([ready.current.p, new Promise((_, rej) => setTimeout(() => rej(new Error("The PDF reader didn't start.")), 15000))]);
      const id = Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        pending.current[id] = { resolve, reject };
        web.current.postMessage(JSON.stringify({ id, b64, password }));
        setTimeout(() => { if (pending.current[id]) { delete pending.current[id]; reject(new Error("Reading the PDF took too long.")); } }, 90000);
      });
    },
  }));

  const onMessage = (e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.ready) return ready.current.r();
    const p = pending.current[m.id]; if (!p) return;
    delete pending.current[m.id];
    if (m.error === "wrong-password") p.reject(new Error("That password didn't open the PDF. It's the password you set when you requested the statement."));
    else if (m.error === "need-password") p.reject(new Error("This PDF needs a password. Enter the one you set when you requested the statement."));
    else if (m.error) p.reject(new Error(`Couldn't read the PDF: ${m.error}`));
    else p.resolve(m.pages);
  };

  // baseUrl puts the page on the CDN's origin so pdf.js can start its worker
  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} pointerEvents="none">
      <WebView ref={web} originWhitelist={["*"]} source={{ html: HTML, baseUrl: "https://cdnjs.cloudflare.com/" }}
        onMessage={onMessage} javaScriptEnabled incognito cacheEnabled={false} />
    </View>
  );
});
