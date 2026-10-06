import { APP_CONFIG as C, applyTheme, isExpired } from "./config.js";
import { loadFrames, thumbSrc } from "./frames.js";
import { startCamera, stopCamera, snap, getFacing } from "./camera.js";
import { compose, exportBlob, saveImage } from "./editor.js";
import { uploadBlob, configured } from "./upload.js";
const $ = s => document.querySelector(s);
applyTheme();
const state = { photo: null, frame: null, frames: [] };
const canvas = $("#canvas");
const views = ["home", "camera", "editor"];
const show = v => views.forEach(n => ($("#" + n).hidden = n !== v));
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4500); }
function busy(msg, pct) {
  const o = $("#busy"); o.hidden = !msg; $("#busyMsg").textContent = msg || "";
  $("#bar").hidden = pct == null; $("#bar i").style.width = (pct || 0) * 100 + "%";
}
$("#manualClose").onclick = () => { $("#manual").hidden = true; };

async function toBitmap(file) {
  if (!file.type.startsWith("image/")) throw new Error("type");
  if (file.size > C.maxPhotoSizeMB * 1048576) throw new Error("size");
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
  return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
}
async function openEditor(photo) {
  state.photo = photo; busy("Preparando sua foto...");
  await ensureFrames();           // mantém a moldura escolhida na câmera
  await buildThumbs($("#thumbs"));
  draw(); busy(); show("editor");
}
function draw() { compose(canvas, state.photo, state.frame?.img); }
async function ensureFrames() {
  if (!state.frames.length) { state.frames = await loadFrames(); state.frame = state.frames[0] || null; }
}
function selectFrame(f) {
  state.frame = f;
  const img = $("#camFrame");
  if (f) { img.src = f.file; img.hidden = false; } else img.hidden = true;
  document.querySelectorAll(".thumb").forEach(t => t.setAttribute("aria-pressed", t.dataset.id === f?.id));
  if (!$("#editor").hidden && state.photo) draw();
}
async function buildThumbs(box) {
  box.innerHTML = "";
  for (const f of state.frames) {
    const b = document.createElement("button"); b.type = "button"; b.className = "thumb"; b.dataset.id = f.id;
    b.setAttribute("aria-label", "Moldura " + f.name); b.setAttribute("aria-pressed", f === state.frame);
    const i = new Image(); i.src = await thumbSrc(f); i.alt = "";
    b.append(i, Object.assign(document.createElement("span"), { textContent: f.name }));
    b.onclick = () => selectFrame(f);
    box.append(b);
  }
}
$("#btnPick").onclick = () => $("#file").click();
$("#camPick").onclick = () => { stopCamera(); $("#file").click(); };
$("#file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { busy("Preparando sua foto..."); await openEditor(await toBitmap(f)); }
  catch (err) { busy(); toast(err.message === "size" ? "Essa foto é muito grande. Escolha outra." : "Não conseguimos abrir essa imagem. Tente outra foto."); show("home"); }
};
$("#btnCamera").onclick = async () => {
  busy("Abrindo câmera...");
  try {
    await ensureFrames();
    await buildThumbs($("#camThumbs"));
    selectFrame(state.frame);
    await startCamera($("#video"), getFacing());
    busy(); show("camera");
  } catch (e) {
    busy(); stopCamera();
    toast(e.name === "NotAllowedError" ? "Permita o acesso à câmera ou use \"Escolher foto\"." : "Câmera indisponível. Use \"Escolher foto\".");
  }
};
$("#flip").onclick = async () => {
  try { await startCamera($("#video"), getFacing() === "user" ? "environment" : "user"); }
  catch { toast("Não foi possível trocar de câmera."); }
};
$("#camClose").onclick = () => { stopCamera(); show("home"); };
$("#shutter").onclick = async () => { const p = snap($("#video")); stopCamera(); await openEditor(p); };
$("#redo").onclick = () => show("home");

$("#save").onclick = async () => {
  try {
    busy("Preparando sua foto..."); const b = await exportBlob(canvas); busy();
    const r = await saveImage(b);
    if (r === "manual") { $("#manualImg").src = URL.createObjectURL(b); $("#manual").hidden = false; }
    else if (r === "downloaded") toast("Foto salva! 💕");
  } catch { busy(); toast("Não conseguimos salvar a foto. Tente novamente."); }
};
$("#send").onclick = async () => {
  if (isExpired()) return toast("O envio de fotos foi encerrado. A galeria continua disponível.");
  if (!configured()) return toast("O envio ainda não está configurado.");
  if (!navigator.onLine) return toast("Sem internet. Conecte-se e tente novamente.");
  try {
    busy("Preparando sua foto..."); const b = await exportBlob(canvas);
    busy("Enviando sua foto 💕", 0); await uploadBlob(b, p => busy("Enviando sua foto 💕", p));
    busy(); $("#done").hidden = false;
  } catch { busy(); toast("Não conseguimos enviar a foto. Verifique sua conexão e tente novamente."); }
};
$("#doneNew").onclick = () => { $("#done").hidden = true; show("home"); };
show("home");
