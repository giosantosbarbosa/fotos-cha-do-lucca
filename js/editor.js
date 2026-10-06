import { APP_CONFIG as C } from "./config.js";
// Foto preenche 1080x1920 (crop central, sem deformar) + moldura por cima.
export function compose(canvas, photo, frame) {
  const W = canvas.width = C.outputWidth, H = canvas.height = C.outputHeight, ctx = canvas.getContext("2d");
  const pw = photo.width, ph = photo.height, s = Math.max(W / pw, H / ph);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(photo, (W - pw * s) / 2, (H - ph * s) / 2, pw * s, ph * s);
  if (frame) ctx.drawImage(frame, 0, 0, W, H);
}
const toBlob = (c, t, q) => new Promise(r => c.toBlob(r, t, q));
export async function exportBlob(canvas) {
  const max = C.maxFinalSizeMB * 1048576;
  let q = C.webpQuality, b = await toBlob(canvas, "image/webp", q);
  if (b && b.type === "image/webp") {
    while (b.size > max && q > 0.55) { q -= 0.08; b = await toBlob(canvas, "image/webp", q); }
    return b;
  }
  q = 0.88; b = await toBlob(canvas, "image/jpeg", q);
  while (b && b.size > max && q > 0.55) { q -= 0.08; b = await toBlob(canvas, "image/jpeg", q); }
  if (!b) throw new Error("canvas");
  return b;
}
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Retorna "shared" | "downloaded" | "manual" (iOS sem share: mostrar imagem p/ segurar e salvar)
export async function saveImage(blob, name = "foto-cha.webp") {
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  const file = new File([blob], name.replace(/\.\w+$/, "") + "." + ext, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "shared"; } catch (e) { if (e.name === "AbortError") return "shared"; }
  }
  if (isIOS) return "manual";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
