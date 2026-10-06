import { APP_CONFIG as C, applyTheme } from "./config.js";
import { listPhotos, publicUrl, configured } from "./upload.js?v=11";
import { saveImage } from "./editor.js";
applyTheme();
const $ = s => document.querySelector(s);
const grid = $("#grid"), more = $("#more"), empty = $("#empty"), dlg = $("#viewer");
const seen = new Set(); let offset = 0, current;
function card(n, prepend) {
  if (seen.has(n)) return; seen.add(n);
  const b = document.createElement("button"); b.className = "tile"; b.setAttribute("aria-label", "Ampliar foto");
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
function open(n) { current = n; $("#big").src = publicUrl(n); $("#hint").hidden = true; dlg.hidden = false; $("#vclose").focus(); }
$("#vclose").onclick = () => (dlg.hidden = true);
addEventListener("keydown", e => e.key === "Escape" && (dlg.hidden = true));
$("#vsave").onclick = async () => {
  try {
    const b = await (await fetch(publicUrl(current))).blob();
    if (await saveImage(b, current) === "manual") $("#hint").hidden = false;
  } catch { $("#hint").textContent = "Não conseguimos salvar. Tente novamente."; $("#hint").hidden = false; }
};
more.onclick = loadMore;
if (!configured()) $("#err").hidden = false;
else { loadMore(); setInterval(refresh, C.galleryRefreshSeconds * 1000); }
