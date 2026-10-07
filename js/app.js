import { APP_CONFIG as C, applyTheme, isExpired } from "./config.js";
import { loadFrames, thumbSrc } from "./frames.js";
import { startCamera, releaseCamera, pauseCamera, snap, getFacing, cameraPermission, hasTorch, setTorch } from "./camera.js?v=11";
import { compose, exportBlob, saveImage } from "./editor.js";
import { uploadBlob, configured, listPhotos } from "./upload.js?v=11";
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
$("#manualClose").onclick = () => { $("#manual").hidden = true; };

// ---- Foto de entrada
async function toBitmap(file) {
  if (!file.type.startsWith("image/")) throw new Error("type");
  if (file.size > C.maxPhotoSizeMB * 1048576) throw new Error("size");
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
  return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
}

// ---- Molduras
async function ensureFrames() {
  if (!state.frames.length) { state.frames = await loadFrames(); state.frame = state.frames[0] || null; }
}
function draw() { compose(canvas, state.photo, state.frame?.img); }
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
async function openEditor(photo) {
  state.photo = photo; busy("Preparando sua foto...");
  await ensureFrames();
  await buildThumbs($("#thumbs"));
  draw(); busy(); show("editor");
}

// ---- Flash e efeitos da câmera
// Lanterna real (Android/Chrome) ou "flash de tela" (iPhone e câmera frontal)
let flashOn = false, shooting = false, flipping = false, flipRot = 0;
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
function spinFlipIcon() {
  flipRot += 180;
  const i = document.querySelector("#flip img");
  if (i) i.style.transform = `rotate(${flipRot}deg)`;
}
async function resumeCameraView() {
  try { await startCamera($("#video"), getFacing()); } catch {}
}

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
    if ($("#camera").hidden) show("home");
  }
};

// ---- Câmera
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
    await applyFlash();
    busy(); show("camera");
    centerActivePill(false);
  } catch (e) {
    busy(); releaseCamera();
    toast(e.name === "NotAllowedError" ? "Permita o acesso à câmera ou use \"Escolher da galeria\"." : "Câmera indisponível. Use \"Escolher da galeria\".");
  }
};
$("#flip").onclick = async () => {
  if (flipping) return; flipping = true; spinFlipIcon();
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