// サービス(商品)ごとのメール雛形管理 + アクティブサービス追跡
const SERVICES_KEY = "cfg_services";
const ACTIVE_KEY = "cfg_active_service";

const DEFAULT_SUBJECT = "【{会社名}様】資料送付のご案内";
const DEFAULT_BODY = `{会社名}
{担当者名} 様

お世話になっております。

ご依頼いただきました資料を送付いたします。
ご確認のほどよろしくお願いいたします。

ご不明な点などございましたら、お気軽にご連絡ください。

----
(差出人情報)`;

export function getServices() {
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveServices(services) {
  localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
}

export function newDefaultService(name = "デフォルト") {
  return {
    id: makeId(),
    name,
    mailSubject: DEFAULT_SUBJECT,
    mailBody: DEFAULT_BODY,
  };
}

export function addService(service) {
  const list = getServices();
  const id = service.id || makeId();
  const s = {
    id,
    name: (service.name || "").trim() || "(無題)",
    mailSubject: service.mailSubject || DEFAULT_SUBJECT,
    mailBody: service.mailBody || DEFAULT_BODY,
  };
  list.push(s);
  saveServices(list);
  // 最初に追加されたサービスは自動的にアクティブに
  if (list.length === 1) setActiveServiceId(id);
  return s;
}

export function updateService(id, updates) {
  const list = getServices();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  list[i] = {
    ...list[i],
    name: (updates.name ?? list[i].name).trim() || "(無題)",
    mailSubject: updates.mailSubject ?? list[i].mailSubject,
    mailBody: updates.mailBody ?? list[i].mailBody,
  };
  saveServices(list);
  return list[i];
}

export function deleteService(id) {
  const list = getServices().filter((s) => s.id !== id);
  saveServices(list);
  if (getActiveServiceId() === id) {
    // アクティブが消えたら先頭に切り替え or 解除
    setActiveServiceId(list[0]?.id || null);
  }
}

export function getActiveServiceId() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function setActiveServiceId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveService() {
  const id = getActiveServiceId();
  if (!id) return null;
  return getServices().find((s) => s.id === id) || null;
}

// 雛形変数の置換
export function renderTemplate(tpl, vars) {
  if (!tpl) return "";
  return tpl
    .replaceAll("{会社名}", vars.company || "")
    .replaceAll("{担当者名}", vars.contact || "")
    .replaceAll("{電話番号}", vars.phone || "")
    .replaceAll("{日付}", vars.date || "")
    .replaceAll("{時刻}", vars.time || "")
    .replaceAll("{サービス名}", vars.service || "");
}

// フォールバック用デフォルト雛形(サービスが1件も無いとき)
export function getDefaultTemplate() {
  return { mailSubject: DEFAULT_SUBJECT, mailBody: DEFAULT_BODY };
}

function makeId() {
  return "svc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
