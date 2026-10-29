import { APP_CONFIG as C } from "./config.js";
import { getToken } from "./auth.js";
const S = C.supabase;
export const configured = () => !S.url.startsWith("COLE_");

// ---- "Minhas fotos": lista guardada neste navegador.
// Só controla se o botão "Excluir" aparece; quem decide se pode apagar é o servidor.
const MINE = "cha-minhas-fotos";
const mineList = () => { try { return JSON.parse(localStorage.getItem(MINE)) || []; } catch { return []; } };
const saveMine = l => { try { localStorage.setItem(MINE, JSON.stringify(l.slice(-200))); } catch {} };
export const isMine = n => mineList().includes(n);
const remember = n => saveMine([...mineList(), n]);
const forget = n => saveMine(mineList().filter(x => x !== n));

function send(blob, name, bearer, onProgress) {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${S.url}/storage/v1/object/${S.bucket}/${name}`);
    x.setRequestHeader("apikey", S.anonKey); x.setRequestHeader("Authorization", `Bearer ${bearer}`);
    x.setRequestHeader("Content-Type", blob.type); x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? ok() : no(Object.assign(new Error("upload"), { status: x.status })));
    x.onerror = x.ontimeout = () => no(new Error("network")); x.timeout = 60000;
    x.send(blob);
  });
}
export async function uploadBlob(blob, onProgress) {
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const token = await getToken();
  if (token) {
    try { await send(blob, name, token, onProgress); remember(name); return name; }
    catch (e) { if (e.status !== 401 && e.status !== 403) throw e; }   // sem permissão com a sessão: tenta como visitante
  }
  await send(blob, name, S.anonKey, onProgress);   // plano B: foto sem dono (só você apaga, pelo painel)
  return name;
}

export async function deletePhoto(name) {
  const token = await getToken();
  if (!token) throw new Error("auth");
  const r = await fetch(`${S.url}/storage/v1/object/${S.bucket}`, {
    method: "DELETE",
    headers: { apikey: S.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [name] })
  });
  if (!r.ok) throw new Error("delete");
  const done = await r.json().catch(() => []);
  if (!Array.isArray(done) || done.length === 0) { forget(name); throw new Error("denied"); }   // não é sua ou já não existe
  forget(name);
}

export const publicUrl = n => `${S.url}/storage/v1/object/public/${S.bucket}/${n}`;
export async function listPhotos(offset = 0, limit = 30) {
  const r = await fetch(`${S.url}/storage/v1/object/list/${S.bucket}`, {
    method: "POST",
    headers: { apikey: S.anonKey, Authorization: `Bearer ${S.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit, offset, sortBy: { column: "created_at", order: "desc" } })
  });
  if (!r.ok) throw new Error("list");
  const all = await r.json();
  const out = all.filter(o => /\.(webp|jpe?g)$/i.test(o.name)).map(o => o.name);
  out.raw = all.length; // total bruto da página (usado na paginação)
  return out;
}
