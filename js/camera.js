let stream, facing = "environment";
export const getFacing = () => facing;
const alive = () => !!stream && stream.getVideoTracks().some(t => t.readyState === "live");
const mirror = (video, mode) => { video.style.transform = mode === "user" ? "scaleX(-1)" : "none"; };

// "granted" | "denied" | "prompt" | "unknown" (Safari antigo não informa)
export async function cameraPermission() {
  try { return (await navigator.permissions.query({ name: "camera" })).state; } catch { return "unknown"; }
}

export async function startCamera(video, mode = facing) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  if (alive() && mode === facing) {            // reaproveita a câmera aberta: não pede permissão de novo
    stream.getTracks().forEach(t => (t.enabled = true));
    video.srcObject = stream; mirror(video, mode); await video.play(); return;
  }
  releaseCamera(); facing = mode;
  const tries = [{ facingMode: { exact: mode } }, { facingMode: { ideal: mode } }, true];
for (const v of tries) {
  try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; }
  catch (e) { if (v === true || !["OverconstrainedError", "NotFoundError"].includes(e.name)) throw e; }
}
  video.srcObject = stream; mirror(video, mode);
  await video.play();
}

// Só pausa: desliga as trilhas (sem pedir permissão de novo ao reabrir) e apaga a lanterna.
export async function pauseCamera(video) {
  await setTorch(false);
  video.pause(); stream?.getTracks().forEach(t => (t.enabled = false));
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