// 認証情報は localStorage に保存。各ユーザはアプリの「⚙ 各種設定」で
// 自分の Client ID / API Key を入力してください。
// このリポジトリは公開可能。ハードコードのデフォルト値は持ちません。
const STORAGE_CLIENT_ID = "cfg_client_id";
const STORAGE_API_KEY = "cfg_api_key";

const DEFAULT_CLIENT_ID = "";
const DEFAULT_API_KEY = "";

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
