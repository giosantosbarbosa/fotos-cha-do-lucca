import { APP_CONFIG as C } from "./config.js";
const S = C.supabase, KEY = "cha-sb-session";
let session = null, pending = null;
try { session = JSON.parse(localStorage.getItem(KEY)); } catch {}

function save(s) {
  session = s && {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600)
  };
  try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch {}
}
async function call(path, body) {
  const r = await fetch(`${S.url}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: S.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const e = new Error("auth"); e.status = r.status; throw e; }
  return r.json();
}
async function renew() {
  if (session?.refresh_token) {
    try {
      save(await call("token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
      return session.access_token;
    } catch (e) {
      // falha de rede ou do servidor: não cria outra identidade (perderia o acesso às fotos já enviadas)
      if (!e.status || e.status >= 500 || e.status === 429) throw e;
      // 4xx: a sessão não vale mais, cria uma nova abaixo
    }
  }
  save(await call("signup", {}));   // login anônimo
  return session.access_token;
}

// Devolve o token do usuário anônimo, ou null se não for possível
// (nesse caso o envio usa a chave pública e a foto fica sem dono).
export function getToken() {
  if (session && session.expires_at - 60 > Math.floor(Date.now() / 1000)) return Promise.resolve(session.access_token);
  if (!pending) pending = renew().catch(() => null).finally(() => { pending = null; });
  return pending;
}
