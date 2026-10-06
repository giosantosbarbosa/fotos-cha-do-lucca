import { APP_CONFIG as C } from "./config.js";
const S = C.supabase;
export const configured = () => !S.url.startsWith("COLE_");
export function uploadBlob(blob, onProgress) {
  return new Promise((ok, no) => {
    const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const x = new XMLHttpRequest();
    x.open("POST", `${S.url}/storage/v1/object/${S.bucket}/${name}`);
    x.setRequestHeader("apikey", S.anonKey); x.setRequestHeader("Authorization", `Bearer ${S.anonKey}`);
    x.setRequestHeader("Content-Type", blob.type); x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? ok(name) : no(new Error("upload")));
    x.onerror = x.ontimeout = () => no(new Error("network")); x.timeout = 60000;
    x.send(blob);
  });
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
