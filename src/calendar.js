import { CALENDAR_ID, TIMEZONE, LOOKAHEAD_DAYS } from "./config.js";
import { refreshToken } from "./auth.js";

const SYNC_TOKEN_KEY = "gcal_sync_token";
const EVENT_CACHE_KEY = "gcal_event_cache";

function getSyncToken() {
  return localStorage.getItem(SYNC_TOKEN_KEY);
}
function saveSyncToken(token) {
  if (token) localStorage.setItem(SYNC_TOKEN_KEY, token);
}
function clearSyncToken() {
  localStorage.removeItem(SYNC_TOKEN_KEY);
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveCache(events) {
  localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(events));
}

// 増分同期: 初回フル → 以後は syncToken で差分のみ
// 410 (Gone) → syncToken 失効 → 再フル同期
// 401 (Unauthorized) → トークン期限切れ → サイレント再取得して 1 回だけリトライ
export async function syncEvents(_retry = 0) {
  const syncToken = getSyncToken();
  try {
    if (syncToken) {
      console.log("calendar: delta sync");
      return await fetchDelta(syncToken);
    }
    console.log("calendar: full sync");
    return await fetchFull();
  } catch (err) {
    const code = err?.status ?? err?.result?.error?.code;
    console.warn("calendar: sync error code", code, err);
    if (code === 410) {
      console.log("calendar: syncToken expired, falling back to full sync");
      clearSyncToken();
      return await fetchFull();
    }
    if (code === 401 && _retry === 0) {
      console.log("calendar: 401 received, refreshing token and retrying once");
      await refreshToken();
      return await syncEvents(_retry + 1);
    }
    throw err;
  }
}

async function fetchFull() {
  const events = [];
  let pageToken;
  let nextSyncToken;
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000).toISOString();
  do {
    const resp = await gapi.client.calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: false,
      maxResults: 250,
      pageToken,
    });
    events.push(...(resp.result.items || []));
    pageToken = resp.result.nextPageToken;
    nextSyncToken = resp.result.nextSyncToken;
  } while (pageToken);
  saveSyncToken(nextSyncToken);
  const merged = normalizeAndSort(events);
  saveCache(merged);
  return merged;
}

// syncToken 利用時は timeMin/timeMax/orderBy 等を併用不可
async function fetchDelta(syncToken) {
  const byId = new Map(loadCache().map((e) => [e.id, e]));
  let pageToken;
  let nextSyncToken;
  do {
    const resp = await gapi.client.calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken,
      pageToken,
      singleEvents: true,
    });
    for (const item of resp.result.items || []) {
      if (item.status === "cancelled") byId.delete(item.id);
      else byId.set(item.id, item);
    }
    pageToken = resp.result.nextPageToken;
    nextSyncToken = resp.result.nextSyncToken;
  } while (pageToken);
  saveSyncToken(nextSyncToken);
  const merged = normalizeAndSort([...byId.values()]);
  saveCache(merged);
  return merged;
}

function normalizeAndSort(events) {
  const now = Date.now();
  const horizon = now + LOOKAHEAD_DAYS * 86_400_000;
  return events
    .filter((e) => e.status !== "cancelled")
    .filter((e) => endTime(e) >= now) // 終了済みは除外
    .filter((e) => startTime(e) <= horizon) // 期間外(7日より先)は除外
    .sort((a, b) => startTime(a) - startTime(b));
}

export function startTime(event) {
  const s = event.start?.dateTime || event.start?.date;
  return s ? new Date(s).getTime() : Infinity;
}

export function endTime(event) {
  const e = event.end?.dateTime || event.end?.date;
  return e ? new Date(e).getTime() : Infinity;
}

// 「今最も近い予定」= 終了時刻が現在より後の最初の予定
export function getNextEvent(events) {
  const now = Date.now();
  return events.find((e) => endTime(e) > now) || null;
}

export async function insertEvent({ summary, startDate, durationMinutes, withMeet = false }) {
  const end = new Date(startDate.getTime() + durationMinutes * 60_000);
  const resource = {
    summary,
    start: { dateTime: startDate.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
  };
  if (withMeet) {
    resource.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const params = { calendarId: CALENDAR_ID, resource };
  if (withMeet) params.conferenceDataVersion = 1;
  const resp = await gapi.client.calendar.events.insert(params);
  return resp.result;
}

// 終日イベント: 当日 1 日 (end は翌日の日付=排他)
export async function insertAllDayEvent({ summary, date = new Date() }) {
  const startStr = ymdString(date);
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const endStr = ymdString(next);
  const resp = await gapi.client.calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: {
      summary,
      start: { date: startStr },
      end: { date: endStr },
    },
  });
  return resp.result;
}

function ymdString(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
