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
  templateHasMeetVar,
} from "./services.js";
import { onServicesChanged, getMailSignature } from "./settings.js";

const CATEGORY_MAIL = "メール送付";
const MAIL_TITLE_PREFIX = "資料送付"; // メール送付の Tasks / Draft 用接頭辞 (Meet 予定はサービス名)

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
        opt.textContent = formatServiceLabel(svc);
        if (svc.id === activeId) opt.selected = true;
        activeServiceSelector.appendChild(opt);
      }
      if (!activeId && services[0]) setActiveServiceId(services[0].id);
    }
  }
  renderServiceSelector();
  activeServiceSelector?.addEventListener("change", () => {
    setActiveServiceId(activeServiceSelector.value || null);
    applyCategoryUI(); // サービス変更で必要な入力欄が変わる
  });
  onServicesChanged(() => {
    renderServiceSelector();
    applyCategoryUI();
  });

  const updatePreview = () => {
    if (!preview || !preview.isConnected) return;
    preview.textContent = "タイトル: " + buildTitle(form);
  };

  // 種別 + アクティブサービスのフラグで入力欄を出し入れ
  function applyCategoryUI() {
    const cat = form.elements.category.value;
    const isMail = cat === CATEGORY_MAIL;

    if (!isMail) {
      // 再架電: 既定の構成
      phoneRow.hidden = false;
      emailRow.hidden = true;
      startAtRow.hidden = false;
      durationRow.hidden = false;
      if (activeServiceRow) activeServiceRow.hidden = true;
      phoneInput.required = true;
      emailInput.required = false;
      startAtInput.required = true;
      submitBtn.textContent = "カレンダーに追加";
    } else {
      // メール送付: アクティブサービスのフラグに応じて
      const svc = getActiveService();
      const needDraft = svc?.enableDraft !== false; // 未設定=true
      const needMeet  = svc?.enableMeet  === true;
      const needTask  = svc?.enableTask  !== false;

      phoneRow.hidden = true;
      emailRow.hidden = !needDraft;
      startAtRow.hidden = !needMeet; // Meet のときだけ日時必要
      durationRow.hidden = !needMeet;
      if (activeServiceRow) activeServiceRow.hidden = false;

      phoneInput.required = false;
      emailInput.required = needDraft;
      startAtInput.required = needMeet;

      const parts = [];
      if (needMeet) parts.push("Meet 予定");
      if (needTask) parts.push("タスク");
      if (needDraft) parts.push("下書き");
      submitBtn.textContent = parts.length
        ? `${parts.join(" + ")} を作成`
        : "(サービスのアクション未設定)";
    }
    updatePreview();
  }
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

  // ---- メール送付: サービスのフラグに応じて Meet / Task / Draft を作成 ----
  async function handleMail(form, status) {
    const company = form.elements.company.value.trim();
    if (!company) return setStatus(status, "会社名を入力してください", "error");

    const activeSvc = getActiveService();
    if (!activeSvc) {
      return setStatus(status, "サービスを選択してください", "error");
    }
    const needDraft = activeSvc.enableDraft !== false;
    const needTask  = activeSvc.enableTask  !== false;
    const needMeet  = activeSvc.enableMeet  === true;
    if (!needDraft && !needTask && !needMeet) {
      return setStatus(status, "このサービスはアクション未設定です。各種設定で調整してください", "error");
    }

    const serviceLabel = activeSvc.name || MAIL_TITLE_PREFIX;
    const taskTitle = `【${MAIL_TITLE_PREFIX}】${company}`;
    const meetTitle = `【${serviceLabel}】${company}`;
    const toAddr = emailInput.value.trim();
    const errors = [];
    const done = [];
    let meetUrl = ""; // Draft 用に保持

    // 1. Google Meet 付き予定
    if (needMeet) {
      const startAt = startAtInput.value;
      if (!startAt) return setStatus(status, "Meet 予定の開始日時を入力してください", "error");
      const start = new Date(startAt);
      if (isNaN(start.getTime())) return setStatus(status, "日時が不正です", "error");
      const duration = parseInt(form.elements.duration.value, 10) || 30;

      setStatus(status, "Meet 予定を作成中…", "info");
      try {
        const ev = await insertEvent({
          summary: meetTitle,
          startDate: start,
          durationMinutes: duration,
          withMeet: true,
        });
        meetUrl =
          ev.hangoutLink ||
          ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ||
          "";
        done.push("Meet予定" + (meetUrl ? `(${meetUrl})` : ""));
      } catch (e) {
        console.error("insertEvent (Meet) failed", e);
        errors.push("Meet予定: " + (e?.result?.error?.message || e?.message || e));
      }
    }

    // 2. Google Tasks
    if (needTask) {
      setStatus(status, "タスク登録中…", "info");
      try {
        await createTask({
          title: taskTitle,
          notes: buildTaskNotes(form, toAddr),
          due: new Date(),
        });
        done.push("タスク");
      } catch (e) {
        console.error("createTask failed", e);
        errors.push("タスク: " + (e?.result?.error?.message || e?.message || e));
      }
    }

    // 3. Gmail 下書き
    if (needDraft) {
      setStatus(status, "Gmail 下書き作成中…", "info");
      try {
        const now = new Date();
        // Meet 予定がある場合、{時刻}/{日付} は予定日時を採用
        const meetStart = needMeet && startAtInput.value ? new Date(startAtInput.value) : null;
        const dateBase = meetStart && !isNaN(meetStart.getTime()) ? meetStart : now;
        const vars = {
          company,
          contact: form.elements.contact.value.trim(),
          phone: "",
          date: dateBase.toLocaleDateString("ja-JP"),
          time: dateBase.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
          service: serviceLabel,
          meet: meetUrl,
        };
        const subject = renderTemplate(activeSvc.mailSubject, vars);
        let body = renderTemplate(activeSvc.mailBody, vars);

        // 雛形に MeetURL 変数が無い場合、Meet URL を末尾に自動転記
        if (meetUrl && !templateHasMeetVar(activeSvc.mailBody)) {
          body = body.replace(/\s+$/, "") + `\n\n──────\n📞 Google Meet:\n${meetUrl}`;
        }

        const signature = getMailSignature();
        if (signature) body = body.replace(/\s+$/, "") + "\n\n" + signature;

        await createDraft({ to: toAddr, subject, body });
        done.push("下書き");
      } catch (e) {
        console.error("createDraft failed", e);
        errors.push("下書き: " + (e?.result?.error?.message || e?.message || e));
      }
    }

    if (errors.length === 0) {
      setStatus(status, `${company} を登録: ${done.join(" + ")}`, "ok");
      resetEntryFields();
      updatePreview();
      await refresh(true);
    } else {
      const msg = done.length
        ? `成功: ${done.join(" + ")} / 失敗: ${errors.join(" / ")}`
        : "全失敗: " + errors.join(" / ");
      setStatus(status, msg, "error");
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

// サービスセレクタの表示用ラベル (バッジ付き)
function formatServiceLabel(svc) {
  const flags = [];
  if (svc.enableMeet) flags.push("🎥");
  if (svc.enableTask !== false) flags.push("📋");
  if (svc.enableDraft !== false) flags.push("📧");
  return `${svc.name}${flags.length ? "  " + flags.join("") : ""}`;
}

// タイトル組み立て: メール送付は 「【資料送付】会社名」、再架電は従来通り
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
