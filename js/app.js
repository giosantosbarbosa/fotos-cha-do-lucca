import { APP_CONFIG as C, applyTheme, isExpired } from "./config.js";
import { loadFrames, thumbSrc } from "./frames.js";
import { startCamera, releaseCamera, pauseCamera, snap, getFacing, cameraPermission } from "./camera.js?v=9";
import { compose, exportBlob, saveImage } from "./editor.js";
import { uploadBlob, configured, listPhotos } from "./upload.js";
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
async function ensureFrames() {
  if (!state.frames.length) { state.frames = await loadFrames(); state.frame = state.frames[0] || null; }
}
function draw() { compose(canvas, state.photo, state.frame?.img); }
function selectFrame(f) {
  state.frame = f;
  const img = $("#camFrame");
  if (f) { img.src = f.file; img.hidden = false; } else img.hidden = true;
  const id = f ? f.id : "none";
  document.querySelectorAll(".thumb,.frame-pill").forEach(t => t.setAttribute("aria-pressed", t.dataset.id === id));
  if (!$("#editor").hidden && state.photo) draw();
}
async function buildThumbs(box, pill = false) {
  box.innerHTML = "";
  const list = pill ? [...state.frames, null] : state.frames;   // na câmera, a última opção é "Sem moldura"
  for (const f of list) {
    const b = document.createElement("button"); b.type = "button";
    b.className = pill ? "frame-pill" : "thumb"; b.dataset.id = f ? f.id : "none";
    b.setAttribute("aria-pressed", f === state.frame);
    if (pill) {
      b.textContent = f ? f.name : "Sem moldura";
    } else {
      b.setAttribute("aria-label", "Moldura " + f.name);
      const i = new Image(); i.src = await thumbSrc(f); i.alt = "";
      b.append(i, Object.assign(document.createElement("span"), { textContent: f.name }));
    }
    b.onclick = () => selectFrame(f);
    box.append(b);
  }
}
async function openEditor(photo) {
  state.photo = photo; busy("Preparando sua foto...");
  await ensureFrames();
  await buildThumbs($("#thumbs"));
  draw(); busy(); show("editor");
}

// ---- Efeitos da câmera
function triggerFlash() {
  const f = $("#camFlash");
  f.classList.add("on");
  setTimeout(() => f.classList.remove("on"), 70);   // acende rápido e apaga suave (transition do CSS)
}
let flipRot = 0;
function spinFlipIcon() { flipRot += 180; $("#flipIcon").style.transform = `rotate(${flipRot}deg)`; }

// ---- Entrada de foto
$("#btnPick").onclick = () => $("#file").click();
$("#camPick").onclick = () => { pauseCamera($("#video")); $("#file").click(); };
$("#file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { busy("Preparando sua foto..."); await openEditor(await toBitmap(f)); }
  catch (err) { busy(); toast(err.message === "size" ? "Essa foto é muito grande. Escolha outra." : "Não conseguimos abrir essa imagem. Tente outra foto."); show("home"); }
};

$("#btnCamera").onclick = async () => {
  if (await cameraPermission() === "denied") {
    return toast("A câmera está bloqueada para este site. Libere nas configurações do navegador ou use \"Escolher da galeria\".");
  }
  busy("Abrindo câmera...");
  try {
    await ensureFrames();
    await buildThumbs($("#camThumbs"), true);
    selectFrame(state.frame);
    await startCamera($("#video"), getFacing());
    busy(); show("camera");
  } catch (e) {
    busy(); releaseCamera();
    toast(e.name === "NotAllowedError" ? "Permita o acesso à câmera ou use \"Escolher da galeria\"." : "Câmera indisponível. Use \"Escolher da galeria\".");
  }
};
$("#flip").onclick = async () => {
  spinFlipIcon();
  try { await startCamera($("#video"), getFacing() === "user" ? "environment" : "user"); }
  catch { toast("Não foi possível trocar de câmera."); }
};
$("#camClose").onclick = () => { pauseCamera($("#video")); show("home"); };
$("#shutter").onclick = async () => {
  const video = $("#video");
  const p = snap(video);
  triggerFlash();
  pauseCamera(video);
  await new Promise(r => setTimeout(r, 180));     // deixa o flash aparecer antes de abrir o editor
  await openEditor(p);
};
$("#redo").onclick = () => show("home");

// ---- Salvar / Enviar
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
    refreshCount();
  } catch { busy(); toast("Não conseguimos enviar a foto. Verifique sua conexão e tente novamente."); }
};
$("#doneNew").onclick = () => { $("#done").hidden = true; show("home"); };

// ---- Contador
async function refreshCount() {
  if (!configured()) return;
  try {
    let n = 0, o = 0, page;
    do { page = await listPhotos(o, 100); n += page.length; o += 100; } while (page.length === 100);
    $("#photo-count").textContent = n;
    $("#countBadge").hidden = n === 0;
  } catch { $("#countBadge").hidden = true; }
}
refreshCount();

// ---- Ciclo de vida da câmera
addEventListener("pagehide", releaseCamera);
document.addEventListener("visibilitychange", async () => {
  const camOpen = !$("#camera").hidden;
  if (document.hidden && !camOpen) releaseCamera();          // saiu do site fora da câmera: libera
  if (!document.hidden && camOpen) {                          // voltou com a câmera aberta: reativa se o sistema a derrubou
    try { await startCamera($("#video"), getFacing()); } catch {}
  }
});

show("home");