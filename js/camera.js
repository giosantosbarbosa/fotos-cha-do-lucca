let stream, facing = "environment";
export const getFacing = () => facing;

export async function startCamera(video, mode = facing) {
  stopCamera(); facing = mode;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  const tries = [{ facingMode: { ideal: mode } }, true];
  for (const v of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; }
    catch (e) { if (v === true) throw e; }
  }
  video.srcObject = stream;
  video.style.transform = mode === "user" ? "scaleX(-1)" : "none";
  await video.play();
}
export function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

export function snap(video) {
  const c = document.createElement("canvas");
  c.width = video.videoWidth; c.height = video.videoHeight;
  const ctx = c.getContext("2d");
  if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  return c;
}