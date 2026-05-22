import { initAuth, signIn, signOut, onAuthChange } from "./auth.js";
import { initNextEvent, startPolling, stopPolling } from "./next-event.js";
import { initQuickAdd } from "./quick-add.js";
import { initPopOut } from "./pop-out.js";
import { initStatusBanner, setBanner } from "./status-banner.js";
import { initSettings } from "./settings.js";
import { CLIENT_ID, API_KEY } from "./config.js";

function waitFor(check, intervalMs = 50) {
  return new Promise((resolve) => {
    const t = () => (check() ? resolve() : setTimeout(t, intervalMs));
    t();
  });
}

function initDocModals() {
  const open = (id, updateHash = true) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    document.body.classList.add("modal-open");
    if (updateHash) {
      const slug = id.replace(/-modal$/, "");
      history.replaceState(null, "", "#" + slug);
    }
  };
  const close = (m, clearHash = true) => {
    if (!m) return;
    m.hidden = true;
    if (!document.querySelector(".modal:not([hidden])")) {
      document.body.classList.remove("modal-open");
      if (clearHash) history.replaceState(null, "", location.pathname + location.search);
    }
  };

  // フッタ / ランディングからの開閉
  document.getElementById("open-howto-btn")?.addEventListener("click", () => open("howto-modal"));
  document.getElementById("open-howto-link")?.addEventListener("click", () => open("howto-modal"));
  document.getElementById("open-privacy-link")?.addEventListener("click", () => open("privacy-modal"));
  document.getElementById("open-terms-link")?.addEventListener("click", () => open("terms-modal"));
  document.getElementById("open-contact-link")?.addEventListener("click", () => open("contact-modal"));
  document.getElementById("open-contact-from-howto")?.addEventListener("click", () => {
    // howto を閉じてから contact を開く
    close(document.getElementById("howto-modal"), false);
    open("contact-modal");
  });

  // ✕ ボタン / 背景クリック (data-close 属性)
  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-close");
      close(document.getElementById(id + "-modal"));
    });
  });
  // Esc で全モーダルを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not([hidden])").forEach((m) => close(m));
    }
  });

  // URL ハッシュで直接開く (/#privacy /#terms /#howto /#contact)
  const slugToId = {
    privacy: "privacy-modal",
    terms: "terms-modal",
    howto: "howto-modal",
    contact: "contact-modal",
  };
  const applyHash = () => {
    const slug = location.hash.replace(/^#/, "");
    const id = slugToId[slug];
    if (id) open(id, false);
  };
  applyHash();
  window.addEventListener("hashchange", applyHash);

  initContactForm();
}

const CONTACT_EMAIL = "koki.ikemoto@neo-career.co.jp";

function initContactForm() {
  const sendBtn = document.getElementById("contact-send");
  const copyBtn = document.getElementById("contact-copy");
  const status = document.getElementById("contact-status");
  if (!sendBtn) return;

  const setSt = (msg, kind = "") => {
    if (!status) return;
    status.textContent = msg;
    status.className = "status" + (kind ? " " + kind : "");
  };

  sendBtn.addEventListener("click", () => {
    const cat = document.getElementById("contact-category").value;
    const name = document.getElementById("contact-name").value.trim();
    const subject = document.getElementById("contact-subject").value.trim();
    const body = document.getElementById("contact-body").value.trim();

    if (!subject || !body) {
      setSt("件名と内容を入力してください", "error");
      return;
    }

    const fullSubject = `[Sales Follower / ${cat}] ${subject}`;
    const ua = navigator.userAgent || "";
    const fullBody = [
      body,
      "",
      "----",
      `お名前: ${name || "(未記入)"}`,
      `カテゴリ: ${cat}`,
      `UA: ${ua}`,
      `送信元: ${location.href}`,
    ].join("\n");

    const mailto =
      "mailto:" +
      encodeURIComponent(CONTACT_EMAIL) +
      "?subject=" + encodeURIComponent(fullSubject) +
      "&body=" + encodeURIComponent(fullBody);

    window.location.href = mailto;
    setSt("メールクライアントが起動しなかった場合は、上のアドレスをコピーして直接送信してください", "info");
  });

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setSt("✅ アドレスをコピーしました", "ok");
    } catch (e) {
      setSt("コピーに失敗しました。アドレスを手動で選択してください", "error");
    }
  });
}

async function main() {
  initStatusBanner();
  initPopOut();
  initSettings();
  initDocModals();

  const signInBtn = document.getElementById("signin-btn");
  const signOutBtn = document.getElementById("signout-btn");
  const ctaSignInBtn = document.getElementById("cta-signin-btn");
  const authedSection = document.getElementById("authed-section");
  const landingSection = document.getElementById("landing-section");

  if (!CLIENT_ID || !API_KEY || CLIENT_ID.startsWith("YOUR_") || API_KEY.startsWith("YOUR_")) {
    signInBtn.disabled = true;
    signInBtn.textContent = "config 未設定";
    setBanner("error", "❌ 認証情報が未設定です。「⚙ 各種設定」→「🔑 Google 認証情報」から登録してください");
    return;
  }

  setBanner("idle", "⚪ 未ログイン (ボタンを押してください)");

  const handleSignIn = () => {
    setBanner("busy", "⚙ 認証中…");
    signIn();
  };
  signInBtn.addEventListener("click", handleSignIn);
  ctaSignInBtn?.addEventListener("click", handleSignIn);
  signOutBtn.addEventListener("click", () => signOut());

  onAuthChange(({ signedIn, error }) => {
    authedSection.hidden = !signedIn;
    if (landingSection) landingSection.hidden = signedIn;
    signInBtn.hidden = signedIn;
    signOutBtn.hidden = !signedIn;
    if (signedIn) {
      setBanner("busy", "⚙ ログイン済み・予定取得中…");
      startPolling();
    } else {
      stopPolling();
      if (error) setBanner("error", "❌ " + error);
      else setBanner("idle", "⚪ 未ログイン");
    }
  });

  initNextEvent();
  initQuickAdd();

  await initAuth();
}

// 全ての uncaught エラー / Promise rejection を画面とコンソールにフル出力
window.addEventListener("error", (e) => {
  const msg = `${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}`;
  console.error("GLOBAL ERROR:", e.error || e.message, e.error?.stack);
  setBanner("error", "🐛 " + msg);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  const msg = r?.message || String(r);
  console.error("UNHANDLED REJECTION:", r, r?.stack);
  setBanner("error", "🐛 Promise: " + msg);
});

(async () => {
  // gapi / GIS の <script defer> の読み込み完了を待つ
  await waitFor(() => window.gapi && window.google?.accounts?.oauth2);
  main().catch((e) => console.error("init failed", e, e?.stack));
})();
