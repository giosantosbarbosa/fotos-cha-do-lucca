const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
export async function loadFrames() {
  let list = [];
  try { list = await (await fetch("config/frames.json", { cache: "no-cache" })).json(); }
  catch (e) { console.warn("Não foi possível ler config/frames.json", e); return []; }
  const out = [];
  for (const f of list.filter(f => f.active !== false)) {
    try { out.push({ ...f, img: await load(f.file) }); }
    catch { console.warn(`Moldura ignorada (imagem não encontrada): ${f.file}`); }
  }
  return out;
}
export async function thumbSrc(f) {
  try { await load(f.thumbnail || f.file); return f.thumbnail || f.file; } catch { return f.file; }
}
