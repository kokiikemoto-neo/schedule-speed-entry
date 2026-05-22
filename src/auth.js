import { CLIENT_ID, API_KEY, DISCOVERY_DOCS, SCOPES } from "./config.js";

let tokenClient;
let refreshHandle = null;
const listeners = new Set();
// refreshToken() を await 可能にするための Promise resolver
let pendingTokenResolvers = [];

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(state) {
  for (const fn of listeners) fn(state);
}

export async function initAuth() {
  await Promise.all([initGapi(), initGis()]);
}

function initGapi() {
  return new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        // 読み込まれた API を表示(診断用)
        console.log("gapi: loaded APIs", Object.keys(gapi.client).filter(k => !k.startsWith("_") && typeof gapi.client[k] === "object"));
        if (!gapi.client.gmail) {
          console.warn("gapi: gmail API not loaded. Gmail API が Cloud Console で有効化されているか、API キーの制限を確認してください。");
        }
        resolve();
      } catch (e) {
        console.error("gapi.client.init failed", e);
        reject(e);
      }
    });
  });
}

function initGis() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      // 待機している refreshToken() の Promise を解決(エラー時は reject)
      const resolvers = pendingTokenResolvers;
      pendingTokenResolvers = [];

      if (resp.error) {
        console.error("auth callback error", resp);
        notify({ signedIn: false, error: resp.error });
        resolvers.forEach((r) => r.reject(resp));
        return;
      }

      // 付与されたスコープを検証(同意画面でカレンダーのチェックを外されているケース対策)
      const granted = (resp.scope || "").split(" ");
      const missing = SCOPES.split(" ").filter((s) => !granted.includes(s));
      console.log("auth: granted scopes", granted);
      if (missing.length) {
        console.error("auth: missing scopes", missing);
        notify({
          signedIn: false,
          error: `必要な権限が許可されていません: ${missing.join(", ")} (再度ログインし「Google カレンダー」へのアクセスを許可してください)`,
        });
        resolvers.forEach((r) => r.reject(new Error("missing scopes")));
        return;
      }

      // GIS は通常 gapi.client にトークンを自動連携するが、念のため明示的にセット
      gapi.client.setToken({ access_token: resp.access_token });
      console.log("auth: token acquired, expires in", resp.expires_in, "sec");
      scheduleRefresh(resp.expires_in);
      notify({ signedIn: true });
      resolvers.forEach((r) => r.resolve(resp));
    },
  });
}

export function signIn() {
  if (!tokenClient) return;
  const hasToken = !!gapi.client.getToken();
  tokenClient.requestAccessToken({ prompt: hasToken ? "" : "consent" });
}

export function signOut() {
  const token = gapi.client.getToken();
  if (refreshHandle) {
    clearTimeout(refreshHandle);
    refreshHandle = null;
  }
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
    gapi.client.setToken(null);
  }
  notify({ signedIn: false });
}

export function isSignedIn() {
  return !!gapi.client?.getToken();
}

// 401 で API が落ちた時に呼ぶ。サイレント再取得を要求し、新トークンが取れるまで await できる。
export function refreshToken() {
  if (!tokenClient) return Promise.reject(new Error("token client not initialized"));
  return new Promise((resolve, reject) => {
    pendingTokenResolvers.push({ resolve, reject });
    try {
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (e) {
      pendingTokenResolvers = pendingTokenResolvers.filter((r) => r.resolve !== resolve);
      reject(e);
    }
  });
}

function scheduleRefresh(expiresIn) {
  if (refreshHandle) clearTimeout(refreshHandle);
  // 期限の 1 分前にサイレント再取得
  const refreshIn = Math.max(60, (expiresIn || 3600) - 60) * 1000;
  refreshHandle = setTimeout(() => {
    try {
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (e) {
      console.error("token refresh failed", e);
    }
  }, refreshIn);
}
