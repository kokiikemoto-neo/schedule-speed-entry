import { insertEvent } from "./calendar.js";
import { refresh } from "./next-event.js";
import { createDraft } from "./gmail.js";
import { createTask } from "./tasks.js";
import {
  getServices,
  getActiveServiceId,
  setActiveServiceId,
  getActiveService,
  getDefaultTemplate,
  renderTemplate,
} from "./services.js";
import { onServicesChanged, getMailSignature } from "./settings.js";

const CATEGORY_MAIL = "メール送付";
const MAIL_TITLE_PREFIX = "資料送付"; // メール送付時のタイトル接頭辞

export function initQuickAdd() {
  const form = document.getElementById("quick-add-form");
  const status = document.getElementById("quick-add-status");
  const preview = document.getElementById("title-preview");

  const phoneRow = document.getElementById("phone-row");
  const emailRow = document.getElementById("email-row");
  const startAtRow = document.getElementById("startat-row");
  const durationRow = document.getElementById("duration-row");
  const activeServiceRow = document.getElementById("active-service-row");
  const activeServiceSelector = document.getElementById("active-service-selector");
  const phoneInput = form.elements.phone;
  const emailInput = form.elements.email;
  const startAtInput = form.elements.startAt;
  const submitBtn = form.querySelector('button[type="submit"]');

  startAtInput.value = defaultStartAt();

  function renderServiceSelector() {
    if (!activeServiceSelector) return;
    const services = getServices();
    const activeId = getActiveServiceId();
    activeServiceSelector.innerHTML = "";
    if (services.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(サービス未登録 — 各種設定から追加)";
      activeServiceSelector.appendChild(opt);
      activeServiceSelector.disabled = true;
    } else {
      activeServiceSelector.disabled = false;
      for (const svc of services) {
        const opt = document.createElement("option");
        opt.value = svc.id;
        opt.textContent = svc.name;
        if (svc.id === activeId) opt.selected = true;
        activeServiceSelector.appendChild(opt);
      }
      if (!activeId && services[0]) setActiveServiceId(services[0].id);
    }
  }
  renderServiceSelector();
  activeServiceSelector?.addEventListener("change", () => {
    setActiveServiceId(activeServiceSelector.value || null);
  });
  onServicesChanged(renderServiceSelector);

  const updatePreview = () => {
    if (!preview || !preview.isConnected) return;
    preview.textContent = "タイトル: " + buildTitle(form);
  };

  // 種別 (プルダウン) に応じて入力欄を出し入れ
  const applyCategoryUI = () => {
    const cat = form.elements.category.value;
    const isMail = cat === CATEGORY_MAIL;

    phoneRow.hidden = isMail;
    emailRow.hidden = !isMail;
    startAtRow.hidden = isMail;
    durationRow.hidden = isMail;
    if (activeServiceRow) activeServiceRow.hidden = !isMail;

    phoneInput.required = !isMail;
    emailInput.required = isMail;
    startAtInput.required = !isMail;

    submitBtn.textContent = isMail ? "終日タスク + メール下書きを作成" : "カレンダーに追加";
    updatePreview();
  };
  form.elements.category.addEventListener("change", applyCategoryUI);
  applyCategoryUI();

  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const category = form.elements.category.value;
    submitBtn.disabled = true;
    try {
      if (category === CATEGORY_MAIL) await handleMail(form, status);
      else await handleCallback(form, status);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- 再架電: 通常のカレンダー予定登録 ----
  async function handleCallback(form, status) {
    const startAt = startAtInput.value;
    const duration = parseInt(form.elements.duration.value, 10);
    if (!startAt) return setStatus(status, "開始日時を入力してください", "error");
    const start = new Date(startAt);
    if (isNaN(start.getTime())) return setStatus(status, "開始日時が不正です", "error");

    const summary = buildTitle(form);
    setStatus(status, "登録中…", "info");
    try {
      const ev = await insertEvent({ summary, startDate: start, durationMinutes: duration });
      setStatus(status, `登録: ${ev.summary}`, "ok");
      resetEntryFields();
      updatePreview();
      await refresh(true);
    } catch (err) {
      console.error(err);
      const msg = err?.result?.error?.message || err.message || String(err);
      setStatus(status, "登録失敗: " + msg, "error");
    }
  }

  // ---- メール送付: Google Tasks + Gmail 下書き ----
  async function handleMail(form, status) {
    const company = form.elements.company.value.trim();
    if (!company) return setStatus(status, "会社名を入力してください", "error");

    const title = `【${MAIL_TITLE_PREFIX}】${company}`;
    const activeSvc = getActiveService();
    const tpl = activeSvc
      ? { mailSubject: activeSvc.mailSubject, mailBody: activeSvc.mailBody }
      : getDefaultTemplate();
    const serviceLabel = activeSvc?.name || MAIL_TITLE_PREFIX;
    const toAddr = emailInput.value.trim();

    const errors = [];

    setStatus(status, "タスク登録中…", "info");
    try {
      await createTask({
        title,
        notes: buildTaskNotes(form, toAddr),
        due: new Date(), // 今日の日付 (カレンダーにタスクとして表示される)
      });
    } catch (e) {
      console.error("createTask failed", e);
      errors.push("タスク: " + (e?.result?.error?.message || e?.message || e));
    }

    setStatus(status, "Gmail 下書き作成中…", "info");
    try {
      const now = new Date();
      const vars = {
        company,
        contact: form.elements.contact.value.trim(),
        phone: "",
        date: now.toLocaleDateString("ja-JP"),
        time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        service: serviceLabel,
      };
      const subject = renderTemplate(tpl.mailSubject, vars);
      let body = renderTemplate(tpl.mailBody, vars);
      // 署名を自動付与
      const signature = getMailSignature();
      if (signature) body = body.replace(/\s+$/, "") + "\n\n" + signature;

      await createDraft({ to: toAddr, subject, body });
    } catch (e) {
      console.error("createDraft failed", e);
      errors.push("下書き: " + (e?.result?.error?.message || e?.message || e));
    }

    if (errors.length === 0) {
      setStatus(status, `${title} を登録 (タスク + 下書き)`, "ok");
      resetEntryFields();
      updatePreview();
      await refresh(true);
    } else {
      setStatus(status, "一部失敗: " + errors.join(" / "), "error");
    }
  }

  function buildTaskNotes(form, toAddr) {
    const contact = form.elements.contact.value.trim();
    const lines = [];
    if (contact) lines.push(`担当: ${contact}`);
    if (toAddr) lines.push(`メール: ${toAddr}`);
    return lines.join("\n");
  }

  function resetEntryFields() {
    form.elements.company.value = "";
    form.elements.contact.value = "";
    phoneInput.value = "";
    emailInput.value = "";
    startAtInput.value = defaultStartAt();
  }
}

// タイトル組み立て: メール送付は 「【資料送付】会社名」固定、再架電は従来通り
function buildTitle(form) {
  const category = form.elements.category.value.trim();
  const company = form.elements.company.value.trim();
  if (category === CATEGORY_MAIL) {
    return `【${MAIL_TITLE_PREFIX}】${company}`;
  }
  const contact = form.elements.contact.value.trim();
  const phone = form.elements.phone.value.trim();
  return `【${category}】${company}　${contact}　${phone}`;
}

function setStatus(el, msg, kind = "") {
  if (!el || !el.isConnected) return;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function defaultStartAt() {
  const d = new Date();
  const rounded = Math.ceil((d.getMinutes() + 1) / 5) * 5;
  d.setMinutes(rounded, 0, 0);
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
