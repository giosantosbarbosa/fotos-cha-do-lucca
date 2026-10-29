import { APP_CONFIG as C, applyTheme } from "./config.js";
import { listPhotos, publicUrl, configured, isMine, deletePhoto } from "./upload.js?v=12";
import { saveImage } from "./editor.js";
applyTheme();
const $ = s => document.querySelector(s);
const grid = $("#grid"), more = $("#more"), empty = $("#empty"), dlg = $("#viewer");
const big = $("#big"), stage = $("#vstage");
const HINT = "Pressione e segure a foto para salvar.";
const seen = new Set(); let offset = 0, current;

function card(n, prepend) {
  if (seen.has(n)) return; seen.add(n);
  const b = document.createElement("button"); b.className = "tile"; b.setAttribute("aria-label", "Ampliar foto");
  b.dataset.name = n;
  const i = new Image(); i.loading = "lazy"; i.decoding = "async"; i.alt = "Foto do chá"; i.src = publicUrl(n);
  i.onload = () => b.classList.add("ok"); b.append(i); b.onclick = () => open(n);
  prepend ? grid.prepend(b) : grid.append(b);
}
async function loadMore() {
  try {
    const names = await listPhotos(offset, 30); offset += names.raw; names.forEach(n => card(n));
    more.hidden = names.raw < 30; empty.hidden = seen.size > 0; $("#err").hidden = true;
  } catch { $("#err").hidden = false; }
}
async function refresh() {
  if (document.hidden) return;
  try { (await listPhotos(0, 30)).reverse().forEach(n => card(n, true)); empty.hidden = seen.size > 0; } catch {}
}

// ---- Compartilhar (menu do celular: Instagram, WhatsApp...)
const canShareFiles = (() => {
  try { return !!navigator.canShare?.({ files: [new File([""], "a.jpg", { type: "image/jpeg" })] }); } catch { return false; }
})();
const shareBtn = $("#vshare");
if (shareBtn) shareBtn.hidden = !canShareFiles;

async function toJpeg(blob) {                     // a galeria guarda WebP; Instagram e WhatsApp preferem JPEG
  if (blob.type === "image/jpeg") return blob;
  let bmp;
  try { bmp = await createImageBitmap(blob); }
  catch { bmp = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(blob); }); }
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0);
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("canvas"))), "image/jpeg", 0.92));
}
const jpegOf = async n => toJpeg(await (await fetch(publicUrl(n))).blob());
let shareBlob = null, shareFor = null;
function prepareShare(n) {                        // converte em segundo plano, para o menu abrir na hora do toque
  shareBlob = null; shareFor = n;
  if (!canShareFiles) return;
  jpegOf(n).then(b => { if (shareFor === n) shareBlob = b; }).catch(() => {});
}
async function shareJpeg(blob, name) {
  const file = new File([blob], name, { type: "image/jpeg" });
  if (!navigator.canShare?.({ files: [file] })) return "unsupported";
  try { await navigator.share({ files: [file] }); return "shared"; }
  catch (e) { return e.name === "AbortError" ? "cancelled" : "unsupported"; }
}

// ---- Visualizador (tela cheia, zoom e navegação)
const names = () => [...grid.querySelectorAll(".tile")].map(t => t.dataset.name);

function open(n) {
  const wasHidden = dlg.hidden;
  current = n; resetZoom(false);
  const url = publicUrl(n);
  if (big.getAttribute("src") !== url) { big.style.opacity = 0; big.src = url; }
  $("#hint").textContent = HINT; $("#hint").hidden = true;
  $("#vdel").hidden = !isMine(n);                 // só aparece nas fotos enviadas por este aparelho
  prepareShare(n);
  const list = names(), i = list.indexOf(n);
  $("#vcount").textContent = `${i + 1} / ${list.length}${more.hidden ? "" : "+"}`;
  $("#vprev").disabled = i <= 0;
  $("#vnext").disabled = i >= list.length - 1 && more.hidden;
  [list[i - 1], list[i + 1]].forEach(x => { if (x) new Image().src = publicUrl(x); });   // pré-carrega vizinhas
  dlg.hidden = false; document.body.style.overflow = "hidden";
  if (wasHidden) $("#vclose").focus();
}
function close() { dlg.hidden = true; document.body.style.overflow = ""; resetZoom(false); }
async function go(d) {
  let list = names(), i = list.indexOf(current) + d;
  if (i >= list.length && !more.hidden) { await loadMore(); list = names(); }   // fim da lista: carrega mais
  if (i < 0 || i >= list.length) return;
  open(list[i]);
}
big.onload = big.onerror = () => (big.style.opacity = 1);
$("#vclose").onclick = close;
$("#vprev").onclick = () => go(-1);
$("#vnext").onclick = () => go(1);
addEventListener("keydown", e => {
  if (dlg.hidden || !$("#confirm").hidden) return;   // ignora enquanto o pop-up de confirmação está aberto
  if (e.key === "Escape") close();
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "ArrowLeft") go(-1);
});

// ---- Zoom por pinça, arrastar e toque duplo (só na foto)
const MAX = 5;
let scale = 1, tx = 0, ty = 0, g = null, lastTap = 0, pinched = false;
const pts = new Map();

function render(anim) {
  if (anim) { big.classList.add("anim"); setTimeout(() => big.classList.remove("anim"), 220); }
  big.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  dlg.classList.toggle("zoomed", scale > 1.02);
}
function limit() {
  if (scale <= 1) { tx = ty = 0; return; }
  const mx = Math.max(0, (big.offsetWidth * scale - stage.clientWidth) / 2);
  const my = Math.max(0, (big.offsetHeight * scale - stage.clientHeight) / 2);
  tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
}
function resetZoom(anim) { scale = 1; tx = ty = 0; render(anim); }
function center() { const r = stage.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function zoomAt(s, px, py) {
  const c = center(), p = { x: px - c.x, y: py - c.y };
  s = Math.min(MAX, Math.max(1, s));
  tx = p.x - s * (p.x - tx) / scale; ty = p.y - s * (p.y - ty) / scale; scale = s; limit();
}
function begin() {
  const a = [...pts.values()];
  if (a.length === 2) {
    g = { type: "pinch", d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s: scale, tx, ty, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
  } else if (a.length === 1) {
    g = { type: "pan", x: a[0].x, y: a[0].y, tx, ty, moved: false };
  } else g = null;
}
stage.onpointerdown = e => {
  stage.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size > 1) pinched = true;
  begin();
};
stage.onpointermove = e => {
  if (!pts.has(e.pointerId) || !g) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const a = [...pts.values()];
  if (g.type === "pinch" && a.length === 2) {
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
    const c = center(), s = Math.min(MAX, Math.max(1, g.s * d / g.d));
    const p0 = { x: g.mx - c.x, y: g.my - c.y }, p1 = { x: mx - c.x, y: my - c.y };
    tx = p1.x - s * (p0.x - g.tx) / g.s; ty = p1.y - s * (p0.y - g.ty) / g.s; scale = s;
    limit(); render();
  } else if (g.type === "pan") {
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
    if (scale > 1) { tx = g.tx + dx; ty = g.ty + dy; limit(); render(); }
  }
};
function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  const ok = e.type !== "pointercancel";
  if (ok && g && g.type === "pan" && !pinched) {
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved) {                                   // toque simples: conta para o toque duplo
      const now = Date.now();
      if (now - lastTap < 300) {
        lastTap = 0;
        if (scale > 1) resetZoom(true); else { zoomAt(2.5, e.clientX, e.clientY); render(true); }
      } else lastTap = now;
    } else if (scale <= 1.02 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);                            // deslizar para trocar de foto
    }
  }
  if (scale < 1.02) { scale = 1; tx = ty = 0; render(); }
  if (pts.size === 0) pinched = false;
  begin();
}
stage.onpointerup = endPointer;
stage.onpointercancel = endPointer;
stage.addEventListener("wheel", e => {               // roda do mouse / trackpad no computador
  e.preventDefault(); zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); render();
}, { passive: false });
["gesturestart", "gesturechange"].forEach(t => dlg.addEventListener(t, e => e.preventDefault()));   // impede zoom da página no Safari
addEventListener("resize", () => { if (!dlg.hidden) { limit(); render(); } });

// ---- Excluir minha foto
function ask({ title, text, ok, cancel }) {
  return new Promise(resolve => {
    const box = $("#confirm"), btnOk = $("#confirmOk"), btnNo = $("#confirmCancel");
    $("#confirmTitle").textContent = title; $("#confirmMsg").textContent = text;
    btnOk.textContent = ok; btnNo.textContent = cancel;
    const end = v => { box.hidden = true; btnOk.onclick = null; btnNo.onclick = null; resolve(v); };
    btnOk.onclick = () => end(true); btnNo.onclick = () => end(false);
    box.hidden = false; btnNo.focus();
  });
}
function removeCard(n) {
  const i = names().indexOf(n);
  grid.querySelector(`.tile[data-name="${CSS.escape(n)}"]`)?.remove();   // continua em "seen": a atualização automática não a traz de volta
  offset = Math.max(0, offset - 1);                                       // mantém a paginação alinhada
  const rest = names();
  empty.hidden = rest.length > 0;
  if (!rest.length) return close();
  open(rest[Math.min(i, rest.length - 1)]);
}
$("#vdel").onclick = async () => {
  const n = current, btn = $("#vdel");
  const ok = await ask({
    title: "Excluir esta foto?",
    text: "Ela será removida da galeria para todos os convidados. Essa ação não pode ser desfeita.",
    ok: "Sim, excluir", cancel: "Cancelar"
  });
  if (!ok) return;
  btn.disabled = true;
  try { await deletePhoto(n); removeCard(n); }
  catch { $("#hint").textContent = "Não conseguimos excluir esta foto. Tente novamente."; $("#hint").hidden = false; $("#vdel").hidden = !isMine(n); }
  finally { btn.disabled = false; }
};

// ---- Salvar e Compartilhar
$("#vsave").onclick = async () => {
  try {
    const b = await (await fetch(publicUrl(current))).blob();
    if (await saveImage(b, current) === "manual") $("#hint").hidden = false;
  } catch { $("#hint").textContent = "Não conseguimos salvar. Tente novamente."; $("#hint").hidden = false; }
};
if (shareBtn) shareBtn.onclick = async () => {
  const n = current;
  try {
    const b = (shareFor === n && shareBlob) || await jpegOf(n);
    const r = await shareJpeg(b, n.replace(/\.\w+$/, "") + ".jpg");
    if (r === "unsupported") { $("#hint").textContent = "Não foi possível abrir o compartilhamento. Use \"Salvar no celular\"."; $("#hint").hidden = false; }
  } catch { $("#hint").textContent = "Não conseguimos compartilhar. Tente novamente."; $("#hint").hidden = false; }
};

more.onclick = loadMore;
if (!configured()) $("#err").hidden = false;
else { loadMore(); setInterval(refresh, C.galleryRefreshSeconds * 1000); }
