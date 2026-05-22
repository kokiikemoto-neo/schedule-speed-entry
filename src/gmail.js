// Gmail Draft 作成 (UTF-8 件名・本文対応)
import { refreshToken } from "./auth.js";

// RFC 2822 形式 + base64url エンコードで gapi.client.gmail.users.drafts.create に渡す
export async function createDraft({ to, subject, body }, _retry = 0) {
  if (!gapi.client.gmail) {
    throw new Error(
      "Gmail API が読み込まれていません。Google Cloud Console で 'Gmail API' を有効化し、APIキーの制限を確認してから再ログインしてください。"
    );
  }

  const message = buildRfc2822({ to, subject, body });
  const raw = base64UrlEncode(message);

  try {
    const resp = await gapi.client.gmail.users.drafts.create({
      userId: "me",
      resource: { message: { raw } },
    });
    return resp.result;
  } catch (err) {
    const code = err?.status ?? err?.result?.error?.code;
    if (code === 401 && _retry === 0) {
      await refreshToken();
      return createDraft({ to, subject, body }, _retry + 1);
    }
    throw err;
  }
}

function buildRfc2822({ to, subject, body }) {
  const lines = [];
  if (to) lines.push(`To: ${to}`);
  lines.push(`Subject: ${encodeMimeWord(subject || "")}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push(""); // body separator
  lines.push(base64Encode(body || ""));
  return lines.join("\r\n");
}

// 件名向け: UTF-8 → Base64 → "=?UTF-8?B?...?=" でラップ
function encodeMimeWord(s) {
  if (!s) return "";
  return `=?UTF-8?B?${base64Encode(s)}?=`;
}

// UTF-8 文字列を base64 化
function base64Encode(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

// 標準 base64 → URL-safe base64 (=パディング除去)
function base64UrlEncode(s) {
  return base64Encode(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
