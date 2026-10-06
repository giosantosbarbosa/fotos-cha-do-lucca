let stream;
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  const tries = [{ facingMode: { ideal: "environment" } }, true];
  for (const v of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; } catch (e) { if (v === true) throw e; }
  }
  video.srcObject = stream; await video.play();
}
export function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
export function snap(video) {
  const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0); return c;
}
