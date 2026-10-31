import { APP_CONFIG as C, applyTheme, isExpired } from "./config.js";
import { loadFrames, thumbSrc } from "./frames.js";
import { startCamera, releaseCamera, pauseCamera, snap, getFacing, cameraPermission, hasTorch, setTorch, focusAt, exposureRange, setExposure, capsInfo } from "./camera.js?v=15";
import { compose, exportBlob, exportJpeg, saveImage, shareImage } from "./editor.js?v=2";
import { uploadBlob, configured, listPhotos } from "./upload.js?v=15";
const $ = s => document.querySelector(s);
applyTheme();
const state = { photo: null, frame: null, frames: [] };
const canvas = $("#canvas");
const views = ["home", "camera", "editor"];
const show = v => views.forEach(n => ($("#" + n).hidden = n !== v));
const wait = ms => new Promise(r => setTimeout(r, ms));
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4500); }
function busy(msg, pct) {
  const o = $("#busy"); o.hidden = !msg; $("#busyMsg").textContent = msg || "";
  $("#bar").hidden = pct == null; $("#bar i").style.width = (pct || 0) * 100 + "%";
}
$("#manualClose").onclick = () => { $("#manual").hidden = true; URL.revokeObjectURL($("#manualImg").src); };

// ---- Pop-up de confirmação (usado em "Refazer", "Fechar" e "Enviar")
function ask({ title, text, ok, cancel }) {
  return new Promise(resolve => {
    const box = $("#confirm"), btnOk = $("#confirmOk"), btnNo = $("#confirmCancel");
    $("#confirmTitle").textContent = title;
    $("#confirmMsg").textContent = text;
    btnOk.textContent = ok;
    btnNo.textContent = cancel;
    const end = v => { box.hidden = true; btnOk.onclick = null; btnNo.onclick = null; resolve(v); };
    btnOk.onclick = () => end(true);
    btnNo.onclick = () => end(false);
    box.hidden = false;
    btnOk.focus();
  });
}

// ---- Foto de entrada
async function toBitmap(file) {
  if (!file.type.startsWith("image/")) throw new Error("type");
  if (file.size > C.maxPhotoSizeMB * 1048576) throw new Error("size");
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
  return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
}

// ---- Compartilhar (menu do celular: Instagram, WhatsApp...)
const shareBtn = $("#share");
const canShareFiles = (() => {
  try { return !!navigator.canShare?.({ files: [new File([""], "a.jpg", { type: "image/jpeg" })] }); } catch { return false; }
})();
if (shareBtn) shareBtn.hidden = !canShareFiles;     // só aparece se o aparelho suportar
let shareBlob = null, shareJob = 0;
function prepareShare() {                           // gera o JPEG antes do toque, para o menu abrir na hora
  shareBlob = null; const job = ++shareJob;
  if (!canShareFiles) return;
  exportJpeg(canvas).then(b => { if (job === shareJob) shareBlob = b; }).catch(() => {});
}

// ---- Molduras
async function ensureFrames() {
  if (!state.frames.length) { state.frames = await loadFrames(); state.frame = state.frames[0] || null; }
}
function draw() { compose(canvas, state.photo, state.frame?.img); prepareShare(); }
function centerActivePill(smooth = true) {
  document.querySelector('.frame-pill[aria-pressed="true"]')
    ?.scrollIntoView({ inline: "center", block: "nearest", behavior: smooth ? "smooth" : "auto" });
}
function selectFrame(f) {
  state.frame = f;
  const img = $("#camFrame");
  if (f) { img.src = f.file; img.hidden = false; } else img.hidden = true;
  const id = f ? f.id : "none";
  document.querySelectorAll(".thumb,.frame-pill").forEach(t => t.setAttribute("aria-pressed", t.dataset.id === id));
  if (!$("#editor").hidden && state.photo) draw();
  centerActivePill();
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
function releasePhoto() {                       // libera a memória da foto anterior (o iPhone tem limite de canvas)
  state.photo = null; shareBlob = null; shareJob++;
  canvas.width = canvas.height = 1;
}
async function openEditor(photo) {
  state.photo = photo; busy("Preparando sua foto...");
  await ensureFrames();
  await buildThumbs($("#thumbs"));
  draw(); busy(); show("editor");
}

// ---- Flash e efeitos da câmera
// Lanterna real (Android/Chrome) ou "flash de tela" (iPhone e câmera frontal)
let flashOn = false, shooting = false, flipping = false, opening = false;
const screenLight = () => $("#screenLight") || $("#camFlash");
function triggerFlash() {
  const f = $("#camFlash");
  f.classList.add("on");
  setTimeout(() => f.classList.remove("on"), 70);
}
function flashUI() { const b = $("#camFlashBtn"); b.setAttribute("aria-pressed", flashOn); b.setAttribute("aria-label", flashOn ? "Desligar flash" : "Ligar flash"); }
async function endFlash() { if (flashOn) { flashOn = false; await setTorch(false); flashUI(); } }
async function applyFlash() { if (flashOn && hasTorch()) await setTorch(true); }
$("#camFlashBtn").onclick = async () => { flashOn = !flashOn; if (hasTorch()) await setTorch(flashOn); flashUI(); };

async function resumeCameraView() {
  try { await startCamera($("#video"), getFacing()); } catch {}
}

// ---- Toque para focar e brilho
// (os elementos #focusRing, #expBox e #expRange vêm do index.html; sem eles, o foco simplesmente não aparece)
let ringT, expT, expOn = false;
function setupExposure() {
  const r = exposureRange(), inp = $("#expRange"), box = $("#expBox");
  expOn = !!(r && inp && box); if (box) box.hidden = true;
  if (r && inp) { inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = r.value; }
}
$("#video").addEventListener("playing", setupExposure);   // roda sempre que a câmera (re)inicia
function showRing(clientX, clientY) {
  const ring = $("#focusRing"), vf = $(".viewfinder").getBoundingClientRect();
  if (!ring) return;
  ring.style.left = clientX - vf.left + "px"; ring.style.top = clientY - vf.top + "px";
  ring.hidden = false; ring.classList.remove("go"); void ring.offsetWidth; ring.classList.add("go");
  clearTimeout(ringT); ringT = setTimeout(() => (ring.hidden = true), 1200);
}
function showExposure() {
  if (!expOn) return;
  $("#expBox").hidden = false;
  clearTimeout(expT); expT = setTimeout(() => ($("#expBox").hidden = true), 3500);
}
$(".viewfinder").addEventListener("click", async e => {
  const v = $("#video");
  if (e.target !== v || !v.videoWidth) return;               // ignora toques em botões e controles
  const r = v.getBoundingClientRect(), s = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
  const dw = v.videoWidth * s, dh = v.videoHeight * s;       // o vídeo é recortado (object-fit: cover)
  let x = ((e.clientX - r.left) - (r.width - dw) / 2) / dw;
  const y = ((e.clientY - r.top) - (r.height - dh) / 2) / dh;
  if (getFacing() === "user") x = 1 - x;                     // a prévia da frontal é espelhada
  const ok = await focusAt(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  if (ok) { showRing(e.clientX, e.clientY); showExposure(); }
});
if ($("#expRange")) $("#expRange").oninput = e => { setExposure(+e.target.value); showExposure(); };

// ---- Entrada de foto
$("#btnPick").onclick = () => $("#file").click();
$("#camPick").onclick = async () => { await endFlash(); $("#file").click(); };   // não pausa: se cancelar, a câmera segue ativa
$("#file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    busy("Preparando sua foto...");
    const bmp = await toBitmap(f);
    if (!$("#camera").hidden) await pauseCamera($("#video"));
    await openEditor(bmp);
  } catch (err) {
    busy();
    toast(err.message === "size" ? "Essa foto é muito grande. Escolha outra." : "Não conseguimos abrir essa imagem. Tente outra foto.");
    if ($("#camera").hidden) show("home"); else await resumeCameraView();   // não deixa a câmera parada
  }
};

// ---- Câmera
async function openCamera() {
  if (opening) return false;                    // evita abrir duas vezes com toques repetidos
  opening = true;
  try {
    if (await cameraPermission() === "denied") {
      toast("A câmera está bloqueada para este site. Libere nas configurações do navegador ou use \"Escolher da galeria\".");
      return false;
    }
    busy("Abrindo câmera...");
    try {
      await ensureFrames();
      await buildThumbs($("#camThumbs"), true);
      selectFrame(state.frame);
      await startCamera($("#video"), getFacing());
      await applyFlash();
      busy(); show("camera");
      centerActivePill(false);
      return true;
    } catch (e) {
      busy(); releaseCamera();
      toast(e.name === "NotAllowedError" ? "Permita o acesso à câmera ou use \"Escolher da galeria\"." : "Câmera indisponível. Use \"Escolher da galeria\".");
      return false;
    }
  } finally { opening = false; }
}
$("#btnCamera").onclick = openCamera;

$("#flip").onclick = async () => {
  if (flipping) return; flipping = true;
  try { await startCamera($("#video"), getFacing() === "user" ? "environment" : "user"); await applyFlash(); }
  catch { toast("Não foi possível trocar de câmera."); }
  finally { flipping = false; }
};
$("#camClose").onclick = async () => { await endFlash(); await pauseCamera($("#video")); show("home"); };
$("#shutter").onclick = async () => {
  if (shooting) return; shooting = true;
  const video = $("#video"), light = screenLight(), lit = flashOn && !hasTorch();
  try {
    if (lit) { light.classList.add(light.id === "screenLight" ? "on" : "lit"); await wait(350); }   // tela branca ilumina o rosto
    const p = snap(video);
    light.classList.remove("on", "lit"); triggerFlash();
    await endFlash(); await pauseCamera(video);
    await wait(180);
    await openEditor(p);
  } catch {
    light.classList.remove("on", "lit"); busy();
    toast("Não conseguimos tirar a foto. Tente novamente.");
    if (!$("#camera").hidden) await resumeCameraView();   // não deixa a câmera parada
  } finally { shooting = false; }
};

$("#redo").onclick = async () => {
  const ok = await ask({
    title: "Refazer a foto?",
    text: "A foto atual será descartada e a câmera será aberta novamente.",
    ok: "Sim, refazer",
    cancel: "Continuar editando"
  });
  if (!ok) return;
  releasePhoto();
  if (!(await openCamera())) show("home");      // se a câmera falhar, volta para o início (a foto já foi descartada)
};

$("#editClose").onclick = async () => {
  const ok = await ask({
    title: "Fechar a edição?",
    text: "A foto atual será descartada e você voltará para a tela inicial.",
    ok: "Sim, fechar",
    cancel: "Continuar editando"
  });
  if (!ok) return;
  releasePhoto();
  show("home");
};

// ---- Salvar / Compartilhar / Enviar
$("#save").onclick = async () => {
  try {
    busy("Preparando sua foto..."); const b = await exportBlob(canvas); busy();
    const r = await saveImage(b);
    if (r === "manual") { $("#manualImg").src = URL.createObjectURL(b); $("#manual").hidden = false; }
    else if (r === "downloaded") toast("Foto salva! 💕");
  } catch { busy(); toast("Não conseguimos salvar a foto. Tente novamente."); }
};

if (shareBtn) shareBtn.onclick = async () => {
  try {
    const b = shareBlob || await exportJpeg(canvas);
    const r = await shareImage(b);
    if (r === "unsupported") toast("Não foi possível abrir o compartilhamento. Use \"Salvar no celular\" e envie pelo app.");
  } catch { toast("Não conseguimos compartilhar a foto. Tente novamente."); }
};

$("#send").onclick = async () => {
  if (isExpired()) return toast("O envio de fotos foi encerrado. A galeria continua disponível.");
  if (!configured()) return toast("O envio ainda não está configurado.");
  if (!navigator.onLine) return toast("Sem internet. Conecte-se e tente novamente.");
  const ok = await ask({
    title: "Enviar para a galeria?",
    text: "As fotos salvas na galeria serão visíveis para todos os convidados.",
    ok: "Enviar",
    cancel: "Cancelar"
  });
  if (!ok) return;
  try {
    busy("Preparando sua foto..."); const b = await exportBlob(canvas);
    busy("Enviando sua foto 💕", 0); await uploadBlob(b, p => busy("Enviando sua foto...", p));
    busy(); $("#done").hidden = false;
    refreshCount();
  } catch { busy(); toast("Não conseguimos enviar a foto. Verifique sua conexão e tente novamente."); }
};

$("#doneNew").onclick = async () => {
  $("#done").hidden = true;
  releasePhoto();
  if (!(await openCamera())) show("home");   // se a câmera falhar, volta para o início
};

// ---- Contador
async function refreshCount() {
  if (!configured()) return;
  try {
    let n = 0, o = 0, page;
    do { page = await listPhotos(o, 100); n += page.length; o += page.raw; } while (page.raw === 100);
    $("#photo-count").textContent = n;
    $("#countBadge").hidden = n === 0;
  } catch { $("#countBadge").hidden = true; }
}
refreshCount();

// ---- Ciclo de vida da câmera
addEventListener("pagehide", releaseCamera);
addEventListener("pageshow", e => { if (e.persisted && !$("#camera").hidden) resumeCameraView(); });   // voltou pelo cache do navegador
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !$("#camera").hidden) resumeCameraView();   // voltou ao site com a câmera aberta
});

show("home");