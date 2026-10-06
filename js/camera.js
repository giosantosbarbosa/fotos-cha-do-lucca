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
    video.srcObject = stream; mirror(video, mode); await video.play(); return;
  }
  releaseCamera(); facing = mode;
  const tries = [{ facingMode: { ideal: mode } }, true];
  for (const v of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; }
    catch (e) { if (v === true) throw e; }
  }
  video.srcObject = stream; mirror(video, mode);
  await video.play();
}

export const pauseCamera = video => video.pause();   // só pausa, mantém a permissão e a câmera
export function releaseCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

export function snap(video) {
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  const ctx = c.getContext("2d");
  if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  return c;
}