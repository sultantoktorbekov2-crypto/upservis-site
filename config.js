const SUPABASE_URL = "https://sfkcedzigubndyvujryh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNma2NlZHppZ3VibmR5dnVqcnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5Mjc0MjEsImV4cCI6MjEwNTUwMzQyMX0.Yjm4pn_TaJ4NIS-BlWx-x4cxFktzPpJtJD8A0Q7psfE";
const AUTH_DOMAIN = "@edoki.app";
// Контакт владельца платформы (показывается гостям в меню и на лендинге)
const OWNER_WHATSAPP = "+996 502 801 404";
const OWNER_WA_LINK = "https://wa.me/996502801404";

// Токен текущего пользователя (гость = анонимный ключ)
let SB_TOKEN = SUPABASE_KEY;
let SB_REFRESH = null;
try {
  SB_TOKEN = sessionStorage.getItem("sb_token") || SUPABASE_KEY;
  SB_REFRESH = sessionStorage.getItem("sb_refresh") || null;
} catch (e) {}

function sbSaveSession(token, refresh) {
  SB_TOKEN = token || SUPABASE_KEY;
  SB_REFRESH = refresh || null;
  try {
    if (token) {
      sessionStorage.setItem("sb_token", token);
      sessionStorage.setItem("sb_refresh", refresh || "");
    } else {
      sessionStorage.removeItem("sb_token");
      sessionStorage.removeItem("sb_refresh");
    }
  } catch (e) {}
}

function sbLogout() { sbSaveSession(null, null); }

async function sbRefresh() {
  if (!SB_REFRESH) return false;
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: SB_REFRESH }),
    });
    if (!r.ok) { sbSaveSession(null, null); return false; }
    const d = await r.json();
    sbSaveSession(d.access_token, d.refresh_token);
    return true;
  } catch (e) { return false; }
}

async function sbFetch(path, opts) {
  const method = opts.method || "GET";
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SB_TOKEN,
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
  };
  if (method !== "GET") headers["Prefer"] = "return=representation";
  return fetch(SUPABASE_URL + "/rest/v1/" + path, { ...opts, method, headers });
}

async function sb(path, opts = {}) {
  let r = await sbFetch(path, opts);
  if (r.status === 401 && SB_REFRESH && await sbRefresh()) r = await sbFetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

async function sbRpc(name, body) {
  const doCall = () => fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SB_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  let r = await doCall();
  if (r.status === 401 && SB_REFRESH && await sbRefresh()) r = await doCall();
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Вход: логин (без домена) + пароль -> сессия Supabase Auth
async function sbLogin(login, password) {
  const email = login.toLowerCase().trim() + AUTH_DOMAIN;
  const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = d.error_code || d.error || "";
    if (r.status === 400 || code === "invalid_credentials") throw new Error("Неверный логин или пароль");
    throw new Error(d.error_description || d.msg || ("Ошибка входа (HTTP " + r.status + ")"));
  }
  sbSaveSession(d.access_token, d.refresh_token);
  return d;
}

// Строка staff текущего пользователя (роль, заведение, настройки)
async function sbMe() {
  const getUser = () => fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SB_TOKEN },
  });
  let r = await getUser();
  if (r.status === 401 && SB_REFRESH && await sbRefresh()) r = await getUser();
  if (!r.ok) throw new Error("Сессия истекла — войдите заново");
  const u = await r.json();
  const rows = await sb("staff?user_id=eq." + u.id + "&select=*,venues(name,status,paid_until,domain,tagline,slug,plan,fee,pay_provider,pay_config,kkm_provider,kkm_config,venue_no,menu_style,contact_phone)");
  return rows[0] || null;
}

// Смена пароля текущего пользователя
async function sbChangePassword(newPw) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "PUT",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SB_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: newPw }),
  });
  if (!r.ok) throw new Error(await r.text());
}

const fmt = n => n.toLocaleString("ru-RU") + " сом";
