// 画面上部の接続状態バナー
let el = null;

export function initStatusBanner() {
  el = document.getElementById("conn-banner");
}

export function setBanner(kind, msg) {
  if (!el || !el.isConnected) {
    el = document.getElementById("conn-banner");
  }
  if (!el) return;
  el.className = "conn-banner conn-" + kind;
  el.textContent = msg;
}
