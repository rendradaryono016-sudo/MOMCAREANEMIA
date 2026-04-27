const SESSION_STORAGE_KEY = "momcare_active_user_id_v1";
const APP_TITLE = "MOMCARE ANEMIA";
const DEFAULT_LOGO_PATH = "./LOGO MOMCARE ANEMIA.png";
const SUPABASE_TABLE_USERS = "profiles";
const SUPABASE_TABLE_DAILY_LOGS = "daily_logs";

let supabaseClient = null;
let cloudReady = false;

const state = {
  page: "auth",
  authTab: "register",
  profile: null,
  users: [],
  dailyLogs: {},
  appError: "",
  showForgotPanel: false,
  forgotMessage: "",
  showLogoutModal: false,
  showFeedback: null,
  eduTab: 0,
  loggingOut: false,
  thankYou: false
};

const motivasi = [
  "Setiap tablet yang Bunda minum adalah langkah cinta untuk si kecil.",
  "Bunda hebat! Terus jaga kesehatan ya.",
  "Si kecil butuh Bunda yang kuat dan sehat.",
  "Hari ini adalah hari baru untuk menjaga kesehatan Bunda.",
  "Sedikit demi sedikit, tablet besi membuat Bunda semakin kuat.",
  "Bunda tidak sendiri, kami selalu mendukungmu.",
  "Kesehatan Bunda adalah kebahagiaan si kecil."
];

const foodData = [
  { emoji: "🥩", nama: "Daging Merah", fe: "3.5 mg/100g", tip: "Sumber zat besi heme terbaik." },
  { emoji: "🍗", nama: "Hati Ayam", fe: "9.0 mg/100g", tip: "Kaya zat besi dan vitamin B12." },
  { emoji: "🥬", nama: "Bayam", fe: "2.7 mg/100g", tip: "Masak sebentar agar nutrisi terjaga." },
  { emoji: "🫘", nama: "Kacang-kacangan", fe: "2.5 mg/100g", tip: "Rendam semalam sebelum dimasak." },
  { emoji: "🧈", nama: "Tempe", fe: "2.7 mg/100g", tip: "Protein nabati kaya zat besi." },
  { emoji: "🥚", nama: "Telur", fe: "1.8 mg/butir", tip: "Kuning telur lebih kaya zat besi." }
];

function getSupabaseConfig() {
  const fromWindow = window.__SUPABASE_CONFIG__ || {
    url: window.SUPABASE_URL || "",
    anonKey: window.SUPABASE_ANON_KEY || ""
  };
  const rawUrl = String(fromWindow.url || "").trim();
  const rawAnonKey = String(fromWindow.anonKey || "").trim();
  const normalizedUrl = rawUrl.replace(/\/rest\/v1\/?$/i, "");
  return {
    url: normalizedUrl,
    anonKey: rawAnonKey
  };
}

function getFriendlySupabaseError(error, fallbackText) {
  const rawMessage = error && error.message ? String(error.message) : "";
  const lower = rawMessage.toLowerCase();
  let hint = "";
  if (lower.includes("relation") && lower.includes("does not exist")) {
    hint = " Tabel database belum ada. Jalankan file supabase-schema.sql di SQL Editor Supabase.";
  } else if (lower.includes("invalid api key") || lower.includes("jwt")) {
    hint = " ANON KEY tidak valid. Ambil ulang di Supabase Project Settings > API.";
  } else if (lower.includes("failed to fetch") || lower.includes("network")) {
    hint = " Koneksi ke Supabase gagal. Cek internet, firewall, atau status project (paused).";
  } else if (lower.includes("permission denied") || lower.includes("row-level security") || lower.includes("rls")) {
    hint = " Akses ditolak oleh RLS policy. Jalankan ulang supabase-schema.sql.";
  } else if (lower.includes("duplicate key") || lower.includes("unique")) {
    hint = " Kontak sudah terdaftar.";
  }
  return `${fallbackText}${hint}${rawMessage ? ` Detail: ${rawMessage}` : ""}`;
}

function saveSession() {
  localStorage.setItem(SESSION_STORAGE_KEY, state.profile ? state.profile.id : "");
}

function readSessionUserId() {
  return localStorage.getItem(SESSION_STORAGE_KEY) || "";
}

function mapLogRowToModel(row) {
  return {
    tablet: row.tablet,
    waktuMinum: row.waktu_minum || "",
    keluhan: Array.isArray(row.keluhan) ? row.keluhan : [],
    makanan: Array.isArray(row.makanan) ? row.makanan : [],
    jadwalPeriksa: row.jadwal_periksa || ""
  };
}

function mapLogModelToRow(userId, dateKey, log) {
  return {
    user_id: userId,
    log_date: dateKey,
    tablet: log.tablet,
    waktu_minum: log.waktuMinum || null,
    keluhan: log.keluhan || [],
    makanan: log.makanan || [],
    jadwal_periksa: log.jadwalPeriksa || null
  };
}

async function loadUsersFromCloud() {
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE_USERS)
    .select("id,nama,kontak,password,pendamping,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  state.users = Array.isArray(data) ? data : [];
}

async function loadUserLogsFromCloud(userId) {
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE_DAILY_LOGS)
    .select("user_id,log_date,tablet,waktu_minum,keluhan,makanan,jadwal_periksa")
    .eq("user_id", userId);
  if (error) throw error;
  if (!state.dailyLogs[userId]) state.dailyLogs[userId] = {};
  (data || []).forEach((row) => {
    state.dailyLogs[userId][row.log_date] = mapLogRowToModel(row);
  });
}

async function saveLogToCloud(dateKey, log) {
  if (!state.profile || !cloudReady) return;
  const payload = mapLogModelToRow(state.profile.id, dateKey, log);
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE_DAILY_LOGS)
    .upsert(payload, { onConflict: "user_id,log_date" });
  if (error) throw error;
}

async function initializeCloud() {
  try {
    const supabaseLib = window.supabase;
    const config = getSupabaseConfig();
    if (!supabaseLib || !config.url || !config.anonKey) {
      state.appError = "Konfigurasi Supabase belum terbaca. Isi env.js (atau .env + npm start), lalu refresh browser.";
      return;
    }
    supabaseClient = supabaseLib.createClient(config.url, config.anonKey);
    cloudReady = true;
    await loadUsersFromCloud();
    const activeUserId = readSessionUserId();
    if (!activeUserId) return;
    const activeUser = state.users.find((u) => u.id === activeUserId);
    if (!activeUser) return;
    state.profile = activeUser;
    state.page = "dashboard";
    state.authTab = "login";
    await loadUserLogsFromCloud(activeUser.id);
  } catch (error) {
    state.appError = getFriendlySupabaseError(error, "Gagal terhubung ke Supabase.");
    console.error("Inisialisasi cloud gagal:", error);
  }
}

function runInitialLoading() {
  const loadingEl = document.getElementById("loadingScreen");
  if (!loadingEl) return;
  setTimeout(() => {
    loadingEl.classList.add("hide");
    setTimeout(() => {
      loadingEl.style.display = "none";
      render();
    }, 550);
  }, 1800);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserLogs() {
  if (!state.profile) return {};
  return state.dailyLogs[state.profile.id] || {};
}

function getLog(dateKey) {
  const key = dateKey || todayKey();
  const userLogs = getUserLogs();
  return userLogs[key] || {
    tablet: null,
    waktuMinum: "",
    keluhan: [],
    makanan: [],
    jadwalPeriksa: ""
  };
}

function setLog(dateKey, log) {
  if (!state.profile) return;
  const key = dateKey || todayKey();
  if (!state.dailyLogs[state.profile.id]) state.dailyLogs[state.profile.id] = {};
  state.dailyLogs[state.profile.id][key] = log;
  saveSession();
  saveLogToCloud(key, log).catch((error) => {
    console.error("Gagal menyimpan catatan harian:", error);
  });
}

function weekCompliance() {
  const days = [];
  const now = new Date();
  const userLogs = getUserLogs();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const log = userLogs[key];
    days.push({ date: d, done: log && log.tablet === true });
  }
  return days;
}

function getDayName(d) {
  return ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][d.getDay()];
}

function getMotivasiHari() {
  return motivasi[new Date().getDate() % motivasi.length];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18) return "sore";
  return "malam";
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;

  if (state.thankYou) {
    app.innerHTML = renderThankYou();
    bindEvents();
    return;
  }

  if (state.loggingOut) {
    app.innerHTML = renderLoggingOut();
    bindEvents();
    return;
  }

  switch (state.page) {
    case "auth":
      app.innerHTML = renderAuth();
      break;
    case "dashboard":
      app.innerHTML = renderDashboard() + renderNav();
      break;
    case "catatan":
      app.innerHTML = renderCatatan() + renderNav();
      break;
    case "edukasi":
      app.innerHTML = renderEdukasi() + renderNav();
      break;
    case "keluarga":
      app.innerHTML = renderKeluarga() + renderNav();
      break;
    default:
      app.innerHTML = renderAuth();
      break;
  }

  if (state.showLogoutModal) app.insertAdjacentHTML("beforeend", renderLogoutModal());
  if (state.showFeedback) app.insertAdjacentHTML("beforeend", renderFeedbackModal());
  if (window.lucide) window.lucide.createIcons();
  bindEvents();
}

function renderAuth() {
  return `<div class="page fade-in" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;min-height:100%">
    <div style="text-align:center;margin-bottom:20px">
      <img src="${DEFAULT_LOGO_PATH}" alt="Logo MOMCARE ANEMIA" class="auth-logo">
      <h1 id="appTitleEl" style="font-size:28px;font-weight:800;color:#D4508A;margin-bottom:4px">${APP_TITLE}</h1>
      <p style="color:#A88A9A;font-size:14px">Pendamping Bunda mengatasi anemia</p>
      ${state.appError ? `<p class="msg-error" style="max-width:360px;margin:10px auto 0">${state.appError}</p>` : ""}
    </div>

    <div class="card" style="width:100%;max-width:370px">
      <div class="auth-tab-wrap">
        <button class="auth-tab ${state.authTab === "register" ? "active" : ""}" data-auth-tab="register">Daftar Akun</button>
        <button class="auth-tab ${state.authTab === "login" ? "active" : ""}" data-auth-tab="login">Login</button>
      </div>
      ${state.authTab === "register" ? renderRegisterForm() : renderLoginForm()}
    </div>
  </div>`;
}

function renderRegisterForm() {
  return `<div>
    <div style="margin-bottom:12px">
      <label for="regNama" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">Nama Bunda</label>
      <input type="text" id="regNama" placeholder="Contoh: Sari">
    </div>
    <div style="margin-bottom:12px">
      <label for="regKontak" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">No HP / Email</label>
      <input type="text" id="regKontak" placeholder="08xxxxxxxxxx atau email">
    </div>
    <div style="margin-bottom:12px">
      <label for="regPw" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">Kata Sandi</label>
      <input type="password" id="regPw" placeholder="Minimal 4 karakter">
    </div>
    <div style="margin-bottom:16px">
      <label for="regPendamping" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">Nama Pendamping</label>
      <input type="text" id="regPendamping" placeholder="Contoh: Pak Andi">
    </div>
    <button class="btn-pink" style="width:100%" id="btnDaftar">Buat Akun</button>
    <p id="registerErr" class="msg-error" style="display:none"></p>
    <p id="registerOk" class="msg-success" style="display:none"></p>
  </div>`;
}

function renderLoginForm() {
  return `<div>
    <div style="margin-bottom:12px">
      <label for="loginKontak" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">No HP / Email</label>
      <input type="text" id="loginKontak" placeholder="Masukkan No HP / Email">
    </div>
    <div style="margin-bottom:12px">
      <label for="loginPw" style="font-size:13px;font-weight:600;color:#7A5A6A;display:block;margin-bottom:4px">Kata Sandi</label>
      <input type="password" id="loginPw" placeholder="Masukkan kata sandi">
    </div>
    <button class="btn-pink" style="width:100%" id="btnLogin">Masuk</button>
    <button class="btn-ghost" style="width:100%;margin-top:8px" id="btnToggleForgot">Lupa akun?</button>
    ${state.showForgotPanel ? renderForgotPanel() : ""}
    <p id="loginErr" class="msg-error" style="display:none"></p>
  </div>`;
}

function renderForgotPanel() {
  const usersMarkup = state.users.length
    ? state.users.map((u) => `<li style="font-size:12px;color:#7A5A6A;margin-bottom:6px">${u.nama} - ${u.kontak}</li>`).join("")
    : '<li style="font-size:12px;color:#7A5A6A">Belum ada akun terdaftar.</li>';

  return `<div class="forgot-panel">
    <p style="font-size:13px;font-weight:700;color:#4A3040;margin-bottom:8px">Lupa akun</p>
    <p style="font-size:12px;color:#7A5A6A;margin-bottom:8px">Masukkan No HP / Email untuk melihat petunjuk akun.</p>
    <input type="text" id="forgotKontak" placeholder="No HP / Email akun" style="margin-bottom:8px">
    <button class="btn-outline" style="width:100%" id="btnCariAkun">Cari Akun</button>
    <div id="forgotMsg" style="font-size:12px;color:#D4508A;margin-top:8px">${state.forgotMessage || ""}</div>
    <p style="font-size:12px;font-weight:700;color:#4A3040;margin-top:12px;margin-bottom:6px">Daftar akun yang tersimpan:</p>
    <ul style="list-style:none;padding:0;margin:0">${usersMarkup}</ul>
  </div>`;
}

function renderDashboard() {
  const p = state.profile;
  const log = getLog();
  const week = weekCompliance();
  const doneCount = week.filter((d) => d.done).length;
  const pct = Math.round((doneCount / 7) * 100);

  return `<div class="page fade-in" style="padding:20px 16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <p style="font-size:13px;color:#A88A9A">Selamat ${getGreeting()},</p>
        <h2 style="font-size:22px;font-weight:800;color:#4A3040">Bunda ${p.nama} 👋</h2>
      </div>
      <button id="btnLogout" style="background:#F5EEF2;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Nunito',sans-serif;font-size:12px;color:#A88A9A">Keluar</button>
    </div>

    <div class="card" style="margin-bottom:16px;text-align:center;background:linear-gradient(135deg,#FFF0F5,#FFD6E7)">
      <p style="font-size:15px;font-weight:700;color:#4A3040;margin-bottom:12px">Sudahkah minum tablet tambah darah hari ini?</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <button class="btn-pink" id="btnTabletYa" style="flex:1;max-width:140px;${log.tablet === true ? "box-shadow:0 0 0 3px #D4508A" : ""}">Sudah</button>
        <button class="btn-outline" id="btnTabletTdk" style="flex:1;max-width:140px;${log.tablet === false ? "box-shadow:0 0 0 3px #D4508A" : ""}">Belum</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <p style="font-size:13px;font-weight:700;color:#4A3040;margin-bottom:10px">Kepatuhan Minggu Ini</p>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        ${week
          .map(
            (d) =>
              `<div style="text-align:center"><div style="font-size:11px;color:#A88A9A;margin-bottom:4px">${getDayName(d.date)}</div><div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;${d.done ? "background:#E8739E;color:#fff" : "background:#FFD6E7;color:#A88A9A"}">${d.done ? "✓" : "·"}</div></div>`
          )
          .join("")}
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p style="font-size:12px;color:#A88A9A;margin-top:6px;text-align:right">${doneCount}/7 hari (${pct}%)</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
      <button class="card nav-quick" data-go="catatan" style="text-align:center;border:none;cursor:pointer;padding:14px 8px"><div style="font-size:28px;margin-bottom:4px">📝</div><div style="font-size:12px;font-weight:700;color:#4A3040">Catatan</div></button>
      <button class="card nav-quick" data-go="edukasi" style="text-align:center;border:none;cursor:pointer;padding:14px 8px"><div style="font-size:28px;margin-bottom:4px">📚</div><div style="font-size:12px;font-weight:700;color:#4A3040">Edukasi</div></button>
      <button class="card nav-quick" data-go="keluarga" style="text-align:center;border:none;cursor:pointer;padding:14px 8px"><div style="font-size:28px;margin-bottom:4px">👨‍👩‍👧</div><div style="font-size:12px;font-weight:700;color:#4A3040">Keluarga</div></button>
    </div>

    <div class="card" style="background:linear-gradient(135deg,#FFD6E7,#FFF0F5);border-left:4px solid #E8739E">
      <p style="font-size:13px;color:#7A5A6A;font-style:italic">${getMotivasiHari()}</p>
    </div>
  </div>`;
}

function renderCatatan() {
  const log = getLog();
  const keluhanList = ["Lemas", "Pusing", "Sesak napas", "Mual", "Tidak ada keluhan"];
  const makananList = ["Daging merah", "Hati ayam", "Bayam", "Tempe", "Kacang-kacangan", "Telur", "Lainnya"];

  return `<div class="page fade-in" style="padding:20px 16px">
    <h2 style="font-size:20px;font-weight:800;color:#4A3040;margin-bottom:4px">Catatan Harian</h2>
    <p style="font-size:13px;color:#A88A9A;margin-bottom:16px">${new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
    <div class="card" style="margin-bottom:14px">
      <p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:10px">Tablet Tambah Darah</p>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <button class="tab-btn ${log.tablet === true ? "active" : ""}" id="cTabletYa">Sudah Minum</button>
        <button class="tab-btn ${log.tablet === false ? "active" : ""}" id="cTabletTdk">Belum</button>
      </div>
      ${log.tablet === true ? `<div><label style="font-size:12px;color:#7A5A6A;display:block;margin-bottom:4px" for="waktuMinum">Jam minum</label><input type="time" id="waktuMinum" value="${log.waktuMinum || ""}"></div>` : ""}
    </div>
    <div class="card" style="margin-bottom:14px">
      <p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:10px">Keluhan Hari Ini</p>
      ${keluhanList
        .map(
          (k) =>
            `<div class="check-item ${(log.keluhan || []).includes(k) ? "checked" : ""}" data-type="keluhan" data-val="${k}"><div class="check-box">${(log.keluhan || []).includes(k) ? '<span style="color:#fff;font-size:14px">✓</span>' : ""}</div><span style="font-size:13px;color:#4A3040">${k}</span></div>`
        )
        .join("")}
    </div>
    <div class="card" style="margin-bottom:14px">
      <p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:10px">Asupan Sumber Zat Besi</p>
      ${makananList
        .map(
          (m) =>
            `<div class="check-item ${(log.makanan || []).includes(m) ? "checked" : ""}" data-type="makanan" data-val="${m}"><div class="check-box">${(log.makanan || []).includes(m) ? '<span style="color:#fff;font-size:14px">✓</span>' : ""}</div><span style="font-size:13px;color:#4A3040">${m}</span></div>`
        )
        .join("")}
    </div>
    <div class="card" style="margin-bottom:14px">
      <p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:8px">Jadwal Pemeriksaan Berikutnya</p>
      <input type="date" id="jadwalPeriksa" value="${log.jadwalPeriksa || ""}">
    </div>
    <button class="btn-pink" style="width:100%" id="btnSimpanCatatan">Simpan Catatan</button>
    <div id="simpanMsg" style="text-align:center;margin-top:8px;font-size:13px;color:#E8739E;display:none">Catatan tersimpan.</div>
  </div>`;
}

function renderEdukasi() {
  const tabs = ["Makanan", "Panduan Tablet", "Efek Samping", "Gejala"];
  return `<div class="page fade-in" style="padding:20px 16px">
    <h2 style="font-size:20px;font-weight:800;color:#4A3040;margin-bottom:14px">Edukasi Anemia</h2>
    <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:16px;padding-bottom:4px">
      ${tabs.map((t, i) => `<button class="tab-btn ${state.eduTab === i ? "active" : ""}" data-edu="${i}">${t}</button>`).join("")}
    </div>
    <div id="eduContent">${renderEduContent()}</div>
  </div>`;
}

function renderEduContent() {
  if (state.eduTab === 0) {
    return `<div class="fade-in">${foodData
      .map(
        (f) =>
          `<div class="edu-card" style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><div style="font-size:36px;flex-shrink:0">${f.emoji}</div><div><p style="font-size:14px;font-weight:700;color:#4A3040">${f.nama}</p><p style="font-size:12px;color:#E8739E;font-weight:600">Zat Besi: ${f.fe}</p><p style="font-size:12px;color:#A88A9A">${f.tip}</p></div></div>`
      )
      .join("")}</div>`;
  }
  if (state.eduTab === 1) {
    return `<div class="fade-in"><div class="edu-card"><p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:8px">Waktu Terbaik Minum Tablet</p><div style="background:#FFF0F5;border-radius:10px;padding:12px;margin-bottom:8px"><p style="font-size:13px;color:#4A3040">Malam sebelum tidur atau 1 jam sebelum makan.</p></div><div style="background:#FFF0F5;border-radius:10px;padding:12px"><p style="font-size:13px;color:#4A3040">Minum dengan air putih atau jus jeruk.</p></div></div></div>`;
  }
  if (state.eduTab === 2) {
    return `<div class="fade-in"><div class="edu-card"><p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:8px">Efek Samping Umum</p><p style="font-size:12px;color:#7A5A6A">Mual, konstipasi, atau feses berwarna hitam dapat terjadi dan biasanya normal.</p></div></div>`;
  }
  return `<div class="fade-in"><div class="edu-card"><p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:8px">Gejala yang perlu diwaspadai</p><p style="font-size:12px;color:#7A5A6A">Lemas berlebihan, pusing berat, sesak napas, atau jantung berdebar.</p></div></div>`;
}

function renderKeluarga() {
  const p = state.profile;
  const log = getLog();
  const status = log.tablet === true ? "sudah" : "belum";
  const pesan = `Halo ${p.pendamping}, Bunda ${p.nama} ${status} minum tablet tambah darah hari ini.`;
  return `<div class="page fade-in" style="padding:20px 16px">
    <h2 style="font-size:20px;font-weight:800;color:#4A3040;margin-bottom:14px">Dukungan Keluarga</h2>
    <div class="card" style="margin-bottom:14px;text-align:center;background:linear-gradient(135deg,#FFF0F5,#FFD6E7)">
      <div style="font-size:48px;margin-bottom:8px">👤</div>
      <p style="font-size:16px;font-weight:800;color:#4A3040">${p.pendamping}</p>
      <p style="font-size:12px;color:#A88A9A">Pendamping Bunda</p>
    </div>
    <div class="card">
      <p style="font-size:14px;font-weight:700;color:#4A3040;margin-bottom:8px">Pesan untuk Pendamping</p>
      <div style="background:#FFF0F5;border-radius:10px;padding:12px;margin-bottom:10px"><p style="font-size:13px;color:#4A3040;line-height:1.5">${pesan}</p></div>
      <button class="btn-pink" style="width:100%" id="btnSalinPesan">Salin Pesan</button>
      <div id="salinMsg" style="text-align:center;margin-top:6px;font-size:12px;color:#E8739E;display:none">Pesan tersalin.</div>
    </div>
  </div>`;
}

function renderNav() {
  const items = [
    { id: "dashboard", icon: "home", label: "Beranda" },
    { id: "catatan", icon: "clipboard-list", label: "Catatan" },
    { id: "edukasi", icon: "book-open", label: "Edukasi" },
    { id: "keluarga", icon: "users", label: "Keluarga" }
  ];
  return `<div style="position:absolute;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #FFD6E7;display:flex;justify-content:space-around;padding:6px 0 10px;z-index:10">${items
    .map(
      (it) =>
        `<button class="nav-btn ${state.page === it.id ? "active" : ""}" data-nav="${it.id}"><i data-lucide="${it.icon}" style="width:22px;height:22px"></i><span>${it.label}</span>${state.page === it.id ? '<div class="nav-dot"></div>' : ""}</button>`
    )
    .join("")}</div>`;
}

function renderLogoutModal() {
  return `<div class="modal-overlay" id="logoutOverlay"><div class="card fade-in" style="max-width:320px;text-align:center;padding:28px 24px"><h3 style="font-size:18px;font-weight:800;color:#4A3040;margin-bottom:6px">Sampai jumpa, Bunda ${state.profile ? state.profile.nama : ""}.</h3><p style="font-size:14px;color:#A88A9A;margin-bottom:20px">Yakin ingin keluar dari ${APP_TITLE}?</p><div style="display:flex;gap:10px"><button class="btn-outline" style="flex:1" id="btnBatalLogout">Batal</button><button style="flex:1;background:#FFF0F5;color:#D4508A;border:2px solid #E8739E;border-radius:12px;padding:10px;font-weight:700;font-family:'Nunito',sans-serif;cursor:pointer;font-size:14px" id="btnKonfirmasiLogout">Ya, Keluar</button></div></div></div>`;
}

function renderFeedbackModal() {
  const ya = state.showFeedback === "ya";
  return `<div class="modal-overlay" id="feedbackOverlay"><div class="card fade-in" style="max-width:300px;text-align:center;padding:24px"><p style="font-size:15px;font-weight:700;color:#4A3040;margin-bottom:6px">${ya ? "Bagus, Bunda." : "Yuk minum sekarang, Bunda."}</p><p style="font-size:13px;color:#7A5A6A;margin-bottom:16px">${ya ? "Jangan minum bersama teh atau kopi ya." : "Pilih waktu terbaik untukmu."}</p><button class="btn-pink" id="btnCloseFeedback" style="width:100%">Oke</button></div></div>`;
}

function renderLoggingOut() {
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="spinner" style="margin-bottom:16px"></div><p style="color:#A88A9A;font-size:14px">Sedang keluar...</p></div>`;
}

function renderThankYou() {
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px" class="fade-in"><img src="${DEFAULT_LOGO_PATH}" alt="Logo MOMCARE ANEMIA" class="auth-logo"><h2 style="font-size:22px;font-weight:800;color:#D4508A;margin-bottom:8px">Terima kasih sudah menggunakan ${APP_TITLE}</h2><p style="font-size:14px;color:#A88A9A">Jaga kesehatan Bunda dan si kecil ya.</p></div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.authTab = btn.getAttribute("data-auth-tab");
      state.showForgotPanel = false;
      state.forgotMessage = "";
      render();
    });
  });

  document.getElementById("btnDaftar")?.addEventListener("click", async () => {
    const nama = document.getElementById("regNama").value.trim();
    const kontak = document.getElementById("regKontak").value.trim().toLowerCase();
    const password = document.getElementById("regPw").value.trim();
    const pendamping = document.getElementById("regPendamping").value.trim();
    const err = document.getElementById("registerErr");
    const ok = document.getElementById("registerOk");
    err.style.display = "none";
    ok.style.display = "none";

    if (!nama || !kontak || !password || !pendamping) {
      err.textContent = "Semua kolom wajib diisi.";
      err.style.display = "block";
      return;
    }
    if (password.length < 4) {
      err.textContent = "Kata sandi minimal 4 karakter.";
      err.style.display = "block";
      return;
    }
    if (state.users.some((u) => u.kontak === kontak)) {
      err.textContent = "Akun dengan kontak ini sudah terdaftar.";
      err.style.display = "block";
      return;
    }

    if (!cloudReady) {
      err.textContent = state.appError || "Supabase belum siap. Cek konfigurasi URL/key dan koneksi.";
      err.style.display = "block";
      return;
    }
    const payload = { nama, kontak, password, pendamping };
    const { data, error } = await supabaseClient
      .from(SUPABASE_TABLE_USERS)
      .insert(payload)
      .select("id,nama,kontak,password,pendamping,created_at")
      .single();
    if (error) {
      err.textContent = getFriendlySupabaseError(error, "Gagal membuat akun.");
      err.style.display = "block";
      return;
    }
    state.users.unshift(data);
    state.profile = data;
    state.page = "dashboard";
    saveSession();
    await loadUserLogsFromCloud(data.id);
    render();
  });

  document.getElementById("btnLogin")?.addEventListener("click", async () => {
    const kontak = document.getElementById("loginKontak").value.trim().toLowerCase();
    const password = document.getElementById("loginPw").value.trim();
    const err = document.getElementById("loginErr");
    err.style.display = "none";

    if (!cloudReady) {
      err.textContent = state.appError || "Supabase belum siap. Cek konfigurasi URL/key dan koneksi.";
      err.style.display = "block";
      return;
    }
    const { data, error } = await supabaseClient
      .from(SUPABASE_TABLE_USERS)
      .select("id,nama,kontak,password,pendamping,created_at")
      .eq("kontak", kontak)
      .eq("password", password)
      .limit(1)
      .maybeSingle();
    if (error) {
      err.textContent = getFriendlySupabaseError(error, "Gagal login.");
      err.style.display = "block";
      return;
    }
    const account = data;
    if (!account) {
      err.textContent = "Kontak atau kata sandi tidak cocok.";
      err.style.display = "block";
      return;
    }

    state.profile = account;
    state.page = "dashboard";
    saveSession();
    await loadUserLogsFromCloud(account.id);
    render();
  });

  document.getElementById("btnToggleForgot")?.addEventListener("click", () => {
    state.showForgotPanel = !state.showForgotPanel;
    state.forgotMessage = "";
    render();
  });

  document.getElementById("btnCariAkun")?.addEventListener("click", async () => {
    const inputKontak = document.getElementById("forgotKontak").value.trim().toLowerCase();
    if (!cloudReady) {
      state.forgotMessage = "Supabase belum siap. Lengkapi konfigurasi cloud.";
      render();
      return;
    }
    const { data } = await supabaseClient
      .from(SUPABASE_TABLE_USERS)
      .select("nama,kontak")
      .eq("kontak", inputKontak)
      .limit(1)
      .maybeSingle();
    const match = data;
    state.forgotMessage = match
      ? `Akun ditemukan: ${match.nama}. Silakan login dengan kata sandi Anda.`
      : "Akun tidak ditemukan. Cek kembali kontak atau daftar akun baru.";
    render();
  });

  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.addEventListener("click", () => {
      state.page = b.getAttribute("data-nav");
      render();
    })
  );
  document.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      state.page = b.getAttribute("data-go");
      render();
    })
  );

  document.getElementById("btnTabletYa")?.addEventListener("click", () => {
    const log = getLog();
    log.tablet = true;
    if (!log.waktuMinum) log.waktuMinum = new Date().toTimeString().slice(0, 5);
    setLog(null, log);
    state.showFeedback = "ya";
    render();
  });

  document.getElementById("btnTabletTdk")?.addEventListener("click", () => {
    const log = getLog();
    log.tablet = false;
    log.waktuMinum = "";
    setLog(null, log);
    state.showFeedback = "tidak";
    render();
  });

  document.getElementById("btnCloseFeedback")?.addEventListener("click", () => {
    state.showFeedback = null;
    render();
  });

  document.getElementById("feedbackOverlay")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "feedbackOverlay") {
      state.showFeedback = null;
      render();
    }
  });

  document.getElementById("cTabletYa")?.addEventListener("click", () => {
    const log = getLog();
    log.tablet = true;
    if (!log.waktuMinum) log.waktuMinum = new Date().toTimeString().slice(0, 5);
    setLog(null, log);
    render();
  });

  document.getElementById("cTabletTdk")?.addEventListener("click", () => {
    const log = getLog();
    log.tablet = false;
    log.waktuMinum = "";
    setLog(null, log);
    render();
  });

  document.getElementById("waktuMinum")?.addEventListener("change", (e) => {
    const log = getLog();
    log.waktuMinum = e.target.value;
    setLog(null, log);
  });

  document.querySelectorAll('[data-type="keluhan"]').forEach((el) =>
    el.addEventListener("click", () => {
      const log = getLog();
      if (!log.keluhan) log.keluhan = [];
      const value = el.getAttribute("data-val");
      if (value === "Tidak ada keluhan") {
        log.keluhan = ["Tidak ada keluhan"];
      } else {
        log.keluhan = log.keluhan.filter((k) => k !== "Tidak ada keluhan");
        const idx = log.keluhan.indexOf(value);
        if (idx >= 0) log.keluhan.splice(idx, 1);
        else log.keluhan.push(value);
      }
      setLog(null, log);
      render();
    })
  );

  document.querySelectorAll('[data-type="makanan"]').forEach((el) =>
    el.addEventListener("click", () => {
      const log = getLog();
      if (!log.makanan) log.makanan = [];
      const value = el.getAttribute("data-val");
      const idx = log.makanan.indexOf(value);
      if (idx >= 0) log.makanan.splice(idx, 1);
      else log.makanan.push(value);
      setLog(null, log);
      render();
    })
  );

  document.getElementById("jadwalPeriksa")?.addEventListener("change", (e) => {
    const log = getLog();
    log.jadwalPeriksa = e.target.value;
    setLog(null, log);
  });

  document.getElementById("btnSimpanCatatan")?.addEventListener("click", () => {
    const msg = document.getElementById("simpanMsg");
    if (!msg) return;
    msg.style.display = "block";
    setTimeout(() => {
      msg.style.display = "none";
    }, 2000);
  });

  document.querySelectorAll("[data-edu]").forEach((b) =>
    b.addEventListener("click", () => {
      state.eduTab = Number(b.getAttribute("data-edu"));
      render();
    })
  );

  document.getElementById("btnSalinPesan")?.addEventListener("click", () => {
    const p = state.profile;
    const log = getLog();
    const status = log.tablet === true ? "sudah" : "belum";
    const pesan = `Halo ${p.pendamping}, Bunda ${p.nama} ${status} minum tablet tambah darah hari ini.`;
    navigator.clipboard.writeText(pesan).then(() => {
      const msg = document.getElementById("salinMsg");
      if (!msg) return;
      msg.style.display = "block";
      setTimeout(() => {
        msg.style.display = "none";
      }, 2000);
    });
  });

  document.getElementById("btnLogout")?.addEventListener("click", () => {
    state.showLogoutModal = true;
    render();
  });

  document.getElementById("btnBatalLogout")?.addEventListener("click", () => {
    state.showLogoutModal = false;
    render();
  });

  document.getElementById("logoutOverlay")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "logoutOverlay") {
      state.showLogoutModal = false;
      render();
    }
  });

  document.getElementById("btnKonfirmasiLogout")?.addEventListener("click", () => {
    state.showLogoutModal = false;
    state.loggingOut = true;
    render();
    setTimeout(() => {
      state.loggingOut = false;
      state.thankYou = true;
      render();
      setTimeout(() => {
        state.profile = null;
        state.page = "auth";
        state.authTab = "login";
        state.thankYou = false;
        saveSession();
        render();
      }, 1600);
    }, 1200);
  });
}

initializeCloud().finally(runInitialLoading);
