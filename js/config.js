// Tudo que é personalizável fica aqui.
export const APP_CONFIG = {
  eventName: "Chá de Bebê [NOME DO BEBÊ]",
  subtitle: "Registre esse momento com a gente 💕",
  galleryTitle: "Memórias do nosso chá",
  colors: { primary: "#6F5C86", secondary: "#E9BDB5", background: "#F7F4F8", text: "#2E2838" },
  outputWidth: 1080,
  outputHeight: 1920,
  webpQuality: 0.88,
  maxFinalSizeMB: 2,
  maxPhotoSizeMB: 25,
  eventExpirationDate: "2026-11-02", // após esta data, novos envios são bloqueados
  galleryRefreshSeconds: 20,
  supabase: {
    url: "https://icskcioljtzhibgnkjit.supabase.co",       // https://xxxx.supabase.co
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljc2tjaW9sanR6aGliZ25raml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTc0NzUsImV4cCI6MjEwNjg5MzQ3NX0.HMIL03kd_Ww0-DCNj-ysQtkQfZbLsXvxFCyL0MbVgTI", // somente a chave pública (anon/publishable)
    bucket: "cha-bebe"
  }
};
export const isExpired = () => new Date() > new Date(APP_CONFIG.eventExpirationDate + "T23:59:59");
export function applyTheme() {
  const c = APP_CONFIG.colors, r = document.documentElement.style;
  r.setProperty("--primary", c.primary); r.setProperty("--secondary", c.secondary);
  r.setProperty("--bg", c.background); r.setProperty("--text", c.text);
  document.querySelectorAll("[data-cfg]").forEach(el => el.textContent = APP_CONFIG[el.dataset.cfg]);
}



