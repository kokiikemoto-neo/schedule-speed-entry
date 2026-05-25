import { syncEvents, startTime, endTime } from "./calendar.js";
import { listTasks, completeTask } from "./tasks.js";
import { isSignedIn } from "./auth.js";
import { setBanner } from "./status-banner.js";
import { POLL_INTERVAL_MS, LOOKAHEAD_DAYS } from "./config.js";

const el = {};
let pollHandle = null;
let renderTimer = null;
let lastEvents = [];
let lastTasks = [];
let inflight = false;

export function initNextEvent() {
  el.list = document.getElementById("event-list");
  el.status = document.getElementById("next-event-status");

  document.getElementById("refresh-btn").addEventListener("click", () => refresh(true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}

export async function refresh(force = false) {
  if (!isSignedIn()) {
    console.log("next-event: skip refresh, not signed in");
    return;
  }
  if (inflight && !force) return;
  inflight = true;
  setStatus("更新中…", "info");
  let step = "init";
  try {
    step = "syncEvents";
    const [events, tasks] = await Promise.all([syncEvents(), listTasks()]);
    lastEvents = events;
    lastTasks = tasks;
    console.log("next-event: synced", events.length, "events,", tasks.length, "tasks");
    step = "render";
    safeRender();
    step = "status";
    const stamp = new Date().toLocaleTimeString("ja-JP");
    setStatus(`最終更新 ${stamp}`, "ok");
    step = "banner";
    try {
      setBanner("ok", `✅ 予定 ${events.length} / タスク ${tasks.length} (${stamp})`);
    } catch (e) { console.warn("banner failed", e); }
  } catch (err) {
    console.error(`next-event: refresh failed at step '${step}'`, err, err?.stack);
    const code = err?.status ?? err?.result?.error?.code ?? "?";
    const msg = err?.result?.error?.message || err?.message || String(err);
    setStatus(`取得失敗 [${step}/${code}]: ${msg}`, "error");
    try { setBanner("error", `❌ [${step}] ${msg}`); } catch {}
  } finally {
    inflight = false;
  }
}

function safeRender() {
  try { render(); }
  catch (e) { console.error("render threw:", e, e?.stack); throw new Error(`render: ${e?.message || e}`); }
}

function render() {
  if (!el.list || !el.list.isConnected) {
    el.list = document.getElementById("event-list");
  }
  if (!el.list) return;

  const now = Date.now();
  const horizon = now + LOOKAHEAD_DAYS * 86_400_000;
  el.list.innerHTML = "";

  // events + tasks をマージ
  const eventItems = lastEvents
    .filter((e) => endTime(e) > now)
    .map((e) => ({
      kind: "event",
      raw: e,
      start: startTime(e),
      end: endTime(e),
      title: e.summary || "(無題)",
      isAllDay: !e.start?.dateTime,
    }));

  const taskItems = lastTasks
    .filter((t) => t.status !== "completed")
    .map((t) => {
      // 期限なし → 今日扱い
      const dueMs = t.due ? new Date(t.due).getTime() : now;
      return {
        kind: "task",
        raw: t,
        start: dueMs,
        end: dueMs + 86_400_000,
        title: t.title || "(無題タスク)",
        isAllDay: true,
        taskId: t.id,
      };
    })
    .filter((t) => t.start <= horizon);

  const items = [...eventItems, ...taskItems].sort((a, b) => a.start - b.start);

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "event-empty";
    empty.textContent = "予定なし (今後1週間)";
    el.list.appendChild(empty);
    scheduleNextRender();
    return;
  }

  let lastDay = null;
  let nowMarkerInserted = false;

  for (const item of items) {
    const dayKey = ymd(item.start);
    const inProgress = item.kind === "event" && item.start <= now && item.end > now;

    if (dayKey !== lastDay) {
      const sep = document.createElement("li");
      sep.className = "day-separator";
      sep.textContent = dayLabel(item.start);
      el.list.appendChild(sep);
      lastDay = dayKey;
    }

    if (!nowMarkerInserted && item.start > now) {
      el.list.appendChild(buildNowMarker(now));
      nowMarkerInserted = true;
    }

    if (item.kind === "task") {
      el.list.appendChild(buildTaskItem(item));
    } else {
      el.list.appendChild(buildEventItem(item, inProgress, now));
    }
  }

  if (!nowMarkerInserted) {
    el.list.appendChild(buildNowMarker(now));
  }

  scheduleNextRender();
}

function buildEventItem(item, inProgress, now) {
  const li = document.createElement("li");
  li.className = "event-item";
  if (inProgress) li.classList.add("in-progress");
  if (item.isAllDay) li.classList.add("all-day");

  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = item.isAllDay ? "終日" : `${fmtTime(item.start)}~${fmtTime(item.end)}`;

  const title = document.createElement("span");
  title.className = "event-title";
  title.textContent = item.title;

  li.appendChild(time);
  li.appendChild(title);

  if (inProgress) {
    const badge = document.createElement("span");
    badge.className = "event-badge in-progress";
    badge.textContent = `進行中・残${fmtDuration(item.end - now)}`;
    li.appendChild(badge);
  } else if (item.start > now && item.start - now < 60 * 60 * 1000) {
    const badge = document.createElement("span");
    badge.className = "event-badge upcoming";
    badge.textContent = `あと${fmtDuration(item.start - now)}`;
    li.appendChild(badge);
  }
  return li;
}

function buildTaskItem(item) {
  const li = document.createElement("li");
  li.className = "event-item task-item";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "task-checkbox";
  cb.title = "完了にする";
  cb.addEventListener("change", async () => {
    if (!cb.checked) return;
    cb.disabled = true;
    li.classList.add("task-completing");
    try {
      await completeTask(item.taskId);
      lastTasks = lastTasks.filter((t) => t.id !== item.taskId);
      render();
    } catch (e) {
      console.error("completeTask failed", e);
      cb.checked = false;
      cb.disabled = false;
      li.classList.remove("task-completing");
      alert("タスク完了に失敗: " + (e?.result?.error?.message || e?.message || e));
    }
  });

  const title = document.createElement("span");
  title.className = "event-title";
  title.textContent = item.title;

  const badge = document.createElement("span");
  badge.className = "event-badge task";
  badge.textContent = "タスク";

  li.appendChild(cb);
  li.appendChild(title);
  li.appendChild(badge);
  return li;
}

function buildNowMarker(now) {
  const li = document.createElement("li");
  li.className = "now-marker";
  li.textContent = `現在 ${fmtTime(now)}`;
  return li;
}

function scheduleNextRender() {
  if (renderTimer) clearTimeout(renderTimer);
  const msUntilNextMinute = 60_000 - (Date.now() % 60_000) + 100;
  renderTimer = setTimeout(() => {
    lastEvents = lastEvents.filter((e) => endTime(e) > Date.now());
    render();
  }, msUntilNextMinute);
}

function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(ts) {
  const target = new Date(ts);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "明日";
  if (diffDays === -1) return "昨日";
  return new Date(ts).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}

function fmtTime(ts) {
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

function setStatus(msg, kind = "") {
  if (!el.status || !el.status.isConnected) {
    el.status = document.getElementById("next-event-status");
  }
  if (!el.status) return;
  el.status.textContent = msg;
  el.status.className = "status" + (kind ? " " + kind : "");
}

export function startPolling() {
  stopPolling();
  refresh();
  pollHandle = setInterval(() => refresh(), POLL_INTERVAL_MS);
}

export function stopPolling() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
}
