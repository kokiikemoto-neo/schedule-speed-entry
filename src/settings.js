// 各種設定モーダル: 認証情報 + サービス管理 + 署名 + 共有手順
import { CONFIG_KEYS } from "./config.js";
import {
  getServices,
  addService,
  updateService,
  deleteService,
  newDefaultService,
} from "./services.js";

// 旧API互換のため残す (quick-add.js が古いインポートをしていても落ちないように)
export { renderTemplate, getActiveService } from "./services.js";

const SIG_KEY = "cfg_mail_signature";
export function getMailSignature() {
  return localStorage.getItem(SIG_KEY) || "";
}

// 既存の単一雛形 API(後方互換)
export function getMailTemplate() {
  const svc = getServices()[0];
  if (svc) return { subject: svc.mailSubject, body: svc.mailBody };
  // フォールバック
  const def = newDefaultService();
  return { subject: def.mailSubject, body: def.mailBody };
}

// 変更されたサービス一覧を再描画するためのリスナー
const serviceChangeListeners = new Set();
export function onServicesChanged(fn) {
  serviceChangeListeners.add(fn);
  return () => serviceChangeListeners.delete(fn);
}
function notifyServicesChanged() {
  for (const fn of serviceChangeListeners) {
    try { fn(); } catch (e) { console.error(e); }
  }
}

let editingId = null; // 編集中サービス ID (null = 新規)

export function initSettings() {
  const openBtn = document.getElementById("open-settings-btn");
  const modal = document.getElementById("settings-modal");
  const closeBtn = document.getElementById("settings-close-btn");
  const backdrop = document.getElementById("settings-backdrop");

  if (!openBtn || !modal) return;

  // モーダル開閉
  const open = () => {
    renderServicesList();
    modal.hidden = false;
    document.body.classList.add("modal-open");
  };
  const close = () => {
    cancelEdit();
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };
  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  initAuthSection();
  initServicesSection();
  initSignatureSection();
}

// ---- 署名セクション ----
function initSignatureSection() {
  const input = document.getElementById("sig-body");
  const saveBtn = document.getElementById("sig-save");
  const clearBtn = document.getElementById("sig-clear");
  const status = document.getElementById("sig-status");
  if (!input) return;

  input.value = getMailSignature();

  saveBtn?.addEventListener("click", () => {
    localStorage.setItem(SIG_KEY, input.value);
    setStatus(status, "保存しました", "ok");
  });

  clearBtn?.addEventListener("click", () => {
    if (!confirm("署名を消去しますか?")) return;
    localStorage.removeItem(SIG_KEY);
    input.value = "";
    setStatus(status, "クリアしました", "ok");
  });
}

// ---- 認証情報セクション ----
function initAuthSection() {
  const clientInput = document.getElementById("cfg-client-id");
  const apiInput = document.getElementById("cfg-api-key");
  const saveBtn = document.getElementById("cfg-save");
  const resetBtn = document.getElementById("cfg-reset");
  const status = document.getElementById("cfg-status");
  if (!clientInput || !apiInput) return;

  clientInput.value = localStorage.getItem(CONFIG_KEYS.CLIENT_ID) || "";
  apiInput.value = localStorage.getItem(CONFIG_KEYS.API_KEY) || "";

  saveBtn?.addEventListener("click", () => {
    const cid = clientInput.value.trim();
    const key = apiInput.value.trim();
    if (!cid || !key) return setStatus(status, "両方の項目を入力してください", "error");
    if (!cid.endsWith(".apps.googleusercontent.com"))
      return setStatus(status, "Client ID の形式が不正です", "error");
    localStorage.setItem(CONFIG_KEYS.CLIENT_ID, cid);
    localStorage.setItem(CONFIG_KEYS.API_KEY, key);
    setStatus(status, "保存しました。再読み込みします…", "ok");
    setTimeout(() => location.reload(), 600);
  });

  resetBtn?.addEventListener("click", () => {
    if (!confirm("保存した認証情報を消去してデフォルトに戻しますか?")) return;
    localStorage.removeItem(CONFIG_KEYS.CLIENT_ID);
    localStorage.removeItem(CONFIG_KEYS.API_KEY);
    setStatus(status, "リセットしました。再読み込みします…", "ok");
    setTimeout(() => location.reload(), 600);
  });
}

// ---- サービス管理セクション ----
function initServicesSection() {
  const addBtn = document.getElementById("add-service-btn");
  const saveBtn = document.getElementById("svc-save");
  const cancelBtn = document.getElementById("svc-cancel");

  addBtn?.addEventListener("click", () => {
    startEdit(null);
  });

  saveBtn?.addEventListener("click", () => {
    const nameInput = document.getElementById("svc-name");
    const subjectInput = document.getElementById("svc-subject");
    const bodyInput = document.getElementById("svc-body");
    const status = document.getElementById("svc-status");

    const name = nameInput.value.trim();
    if (!name) return setStatus(status, "サービス名を入力してください", "error");

    const payload = {
      name,
      mailSubject: subjectInput.value,
      mailBody: bodyInput.value,
    };
    if (editingId) {
      updateService(editingId, payload);
    } else {
      addService(payload);
    }
    setStatus(status, "保存しました", "ok");
    cancelEdit();
    renderServicesList();
    notifyServicesChanged();
  });

  cancelBtn?.addEventListener("click", cancelEdit);

  renderServicesList();
}

function renderServicesList() {
  const listEl = document.getElementById("services-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const services = getServices();
  if (services.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-intro";
    empty.textContent = "登録済みサービスはありません。「+ 新規追加」から登録してください。";
    listEl.appendChild(empty);
    return;
  }

  for (const svc of services) {
    const row = document.createElement("div");
    row.className = "service-row";

    const name = document.createElement("span");
    name.className = "service-name";
    name.textContent = svc.name;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "編集";
    editBtn.className = "service-action";
    editBtn.addEventListener("click", () => startEdit(svc.id));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "削除";
    delBtn.className = "service-action secondary";
    delBtn.addEventListener("click", () => {
      if (!confirm(`サービス「${svc.name}」を削除しますか?`)) return;
      deleteService(svc.id);
      renderServicesList();
      notifyServicesChanged();
    });

    row.appendChild(name);
    row.appendChild(editBtn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  }
}

function startEdit(id) {
  editingId = id;
  const editor = document.getElementById("service-editor");
  const title = document.getElementById("editor-title");
  const nameInput = document.getElementById("svc-name");
  const subjectInput = document.getElementById("svc-subject");
  const bodyInput = document.getElementById("svc-body");
  const status = document.getElementById("svc-status");
  if (!editor) return;

  if (id) {
    const svc = getServices().find((s) => s.id === id);
    title.textContent = `編集: ${svc?.name || ""}`;
    nameInput.value = svc?.name || "";
    subjectInput.value = svc?.mailSubject || "";
    bodyInput.value = svc?.mailBody || "";
  } else {
    const def = newDefaultService("");
    title.textContent = "新規サービス";
    nameInput.value = "";
    subjectInput.value = def.mailSubject;
    bodyInput.value = def.mailBody;
  }
  setStatus(status, "");
  editor.hidden = false;
  nameInput.focus();
}

function cancelEdit() {
  editingId = null;
  const editor = document.getElementById("service-editor");
  if (editor) editor.hidden = true;
}

function setStatus(el, msg, kind = "") {
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}
