// 認証情報は localStorage が優先。空ならハードコード値(あなた専用) を fallback。
// 他の人が使う場合は画面の「⚙ 設定」から自分の Client ID / API Key を保存してください。
const STORAGE_CLIENT_ID = "cfg_client_id";
const STORAGE_API_KEY = "cfg_api_key";

const DEFAULT_CLIENT_ID = "25632244416-hk0gft5reu91gi6juth32m0acn6tfsva.apps.googleusercontent.com";
const DEFAULT_API_KEY = "AIzaSyCMTIny2Li9n_auoI1D77EA0ls32yM60uU";

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v.trim() : fallback;
  } catch {
    return fallback;
  }
}

export const CLIENT_ID = load(STORAGE_CLIENT_ID, DEFAULT_CLIENT_ID);
export const API_KEY = load(STORAGE_API_KEY, DEFAULT_API_KEY);

// 設定 UI から参照するための定数(同じキー名を使う)
export const CONFIG_KEYS = {
  CLIENT_ID: STORAGE_CLIENT_ID,
  API_KEY: STORAGE_API_KEY,
};

export const SCOPES =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/tasks";
export const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
  "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest",
  "https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest",
];
// 後方互換
export const DISCOVERY_DOC = DISCOVERY_DOCS[0];
export const CALENDAR_ID = "primary";
export const TIMEZONE = "Asia/Tokyo";

export const POLL_INTERVAL_MS = 30_000;
export const LOOKAHEAD_DAYS = 7;
