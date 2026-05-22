// Google Tasks: 作成 / 一覧取得 / 完了マーク
import { refreshToken } from "./auth.js";

const TASKLIST = "@default";

// 作成 (due は Date オブジェクト or undefined)
export async function createTask({ title, notes, due }, _retry = 0) {
  if (!gapi.client.tasks) {
    throw new Error(
      "Tasks API が読み込まれていません。Google Cloud Console で 'Tasks API' を有効化し、再ログインしてください。"
    );
  }
  const resource = { title, notes: notes || undefined };
  if (due instanceof Date && !isNaN(due.getTime())) {
    // Tasks API は due に RFC3339 を要求。時刻部分は無視されるが必須
    resource.due = new Date(due.getFullYear(), due.getMonth(), due.getDate()).toISOString();
  }
  try {
    const resp = await gapi.client.tasks.tasks.insert({
      tasklist: TASKLIST,
      resource,
    });
    return resp.result;
  } catch (err) {
    const code = err?.status ?? err?.result?.error?.code;
    if (code === 401 && _retry === 0) {
      await refreshToken();
      return createTask({ title, notes, due }, _retry + 1);
    }
    throw err;
  }
}

// 直近のタスクを取得 (未完了のみ)
export async function listTasks(_retry = 0) {
  if (!gapi.client.tasks) return [];
  try {
    const resp = await gapi.client.tasks.tasks.list({
      tasklist: TASKLIST,
      showCompleted: false,
      showHidden: false,
      maxResults: 100,
    });
    return resp.result.items || [];
  } catch (err) {
    const code = err?.status ?? err?.result?.error?.code;
    if (code === 401 && _retry === 0) {
      await refreshToken();
      return listTasks(_retry + 1);
    }
    console.warn("listTasks failed", err);
    return [];
  }
}

// タスクを完了にする
export async function completeTask(taskId, _retry = 0) {
  if (!gapi.client.tasks) return null;
  try {
    const resp = await gapi.client.tasks.tasks.patch({
      tasklist: TASKLIST,
      task: taskId,
      resource: { status: "completed" },
    });
    return resp.result;
  } catch (err) {
    const code = err?.status ?? err?.result?.error?.code;
    if (code === 401 && _retry === 0) {
      await refreshToken();
      return completeTask(taskId, _retry + 1);
    }
    throw err;
  }
}
