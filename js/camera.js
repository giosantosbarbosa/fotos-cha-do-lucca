let stream, facing = "environment";
export const getFacing = () => facing;
const alive = () => !!stream && stream.getVideoTracks().some(t => t.readyState === "live");
const mirror = (video, mode) => { video.style.transform = mode === "user" ? "scaleX(-1)" : "none"; };
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// "granted" | "denied" | "prompt" | "unknown" (Safari antigo não informa)
export async function cameraPermission() {
  try { return (await navigator.permissions.query({ name: "camera" })).state; } catch { return "unknown"; }
}

export async function startCamera(video, mode = facing) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  const open = alive() && mode === facing;
  // Já está rodando: nada a fazer (ex.: voltou ao site com a câmera aberta)
  if (open && !video.paused && video.srcObject === stream && stream.getTracks().every(t => t.enabled)) return;
  // Reaproveita a câmera pausada (Android/computador). No iPhone o vídeo reaproveitado volta "encolhido",
  // então lá a câmera é aberta de novo, como na primeira vez.
  if (open && !IOS) {
    stream.getTracks().forEach(t => (t.enabled = true));
    video.srcObject = null;
    video.srcObject = stream; mirror(video, mode); await video.play(); return;
  }
  releaseCamera(); facing = mode;
  // Pede a maior resolução possível; "ideal" não dá erro se o aparelho não tiver
  const hd = { width: { ideal: 4096 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } };
  const tries = [
    { facingMode: { exact: mode }, ...hd },
    { facingMode: { ideal: mode }, ...hd },
    { facingMode: { ideal: mode } },
    true
  ];
  for (const v of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; }
    catch (e) { if (v === true || !["OverconstrainedError", "NotFoundError"].includes(e.name)) throw e; }
  }
  video.srcObject = stream; mirror(video, mode);
  await video.play();
  await tune();
}

// Pausa: desliga as trilhas e apaga a lanterna. No iPhone a câmera é liberada de vez.
export async function pauseCamera(video) {
  await setTorch(false);
  video.pause();
  if (IOS) { releaseCamera(); video.srcObject = null; return; }
  stream?.getTracks().forEach(t => (t.enabled = false));
}
export const hasTorch = () => !!stream?.getVideoTracks()[0]?.getCapabilities?.().torch;
export async function setTorch(on) {
  const t = stream?.getVideoTracks()[0];
  if (!hasTorch()) return false;
  try { await t.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
}
export function releaseCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

export function snap(video) {
  if (!video.videoWidth) throw new Error("not-ready");
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  const ctx = c.getContext("2d");
  if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  return c;
}

// ---- Controles de câmera (só funcionam se o aparelho suportar)
const track = () => stream?.getVideoTracks()[0];
const caps = () => track()?.getCapabilities?.() || {};
async function apply(adv) {
  const t = track(); if (!t) return false;
  try { await t.applyConstraints({ advanced: [adv] }); return true; } catch { return false; }
}
// Liga foco, exposição e balanço de branco automáticos contínuos
async function tune() {
  const c = caps();
  for (const k of ["focusMode", "exposureMode", "whiteBalanceMode"]) {
    if (Array.isArray(c[k]) && c[k].includes("continuous")) await apply({ [k]: "continuous" });
  }
}
// Toque para focar: x e y vão de 0 a 1. Retorna true se o aparelho tem foco ajustável.
export async function focusAt(x, y) {
  const c = caps(), modes = c.focusMode || [], pt = [{ x, y }];
  if (!modes.length) return false;
  if (modes.includes("single-shot")) {
    await apply({ pointsOfInterest: pt, focusMode: "single-shot" });
    await new Promise(r => setTimeout(r, 900));
  }
  if ((c.exposureMode || []).includes("continuous")) await apply({ pointsOfInterest: pt, exposureMode: "continuous" });
  if (modes.includes("continuous")) await apply({ pointsOfInterest: pt, focusMode: "continuous" });
  return true;
}
// Brilho (compensação de exposição)
export function exposureRange() {
  const c = caps().exposureCompensation;
  if (!c || !(c.max > c.min)) return null;
  return { min: c.min, max: c.max, step: c.step || 0.1, value: track()?.getSettings?.().exposureCompensation ?? 0 };
}
export const setExposure = v => apply({ exposureCompensation: v });
export const capsInfo = () => JSON.stringify(caps());   // só para diagnóstico