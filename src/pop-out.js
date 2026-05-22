// Document Picture-in-Picture API でメインパネルを常時最前面の小窓に切り出す
// 対応: Chrome / Edge 116+
let pipWindow = null;
let placeholder = null;

export function initPopOut() {
  const btn = document.getElementById("popout-btn");
  if (!("documentPictureInPicture" in window)) {
    btn.disabled = true;
    btn.title = "このブラウザは Document Picture-in-Picture に未対応 (Chrome/Edge 116+ が必要)";
    btn.textContent = "📌 浮き出す (未対応)";
    return;
  }
  btn.addEventListener("click", togglePopOut);
}

async function togglePopOut() {
  if (pipWindow) {
    pipWindow.close();
    return;
  }

  const main = document.getElementById("authed-section");
  if (!main || main.hidden) {
    alert("ログイン後に利用できます");
    return;
  }

  pipWindow = await documentPictureInPicture.requestWindow({
    width: 380,
    height: 640,
  });

  // 現在ページの全 stylesheet を PiP 窓に複製
  copyStyles(pipWindow.document);

  // 背景色を本体と揃える
  pipWindow.document.body.style.cssText =
    "margin:0; background:#f4f6fa; font-family:-apple-system,'Segoe UI','Hiragino Sans','Yu Gothic UI',sans-serif;";

  // main 要素を PiP 窓へ移動（同じ DOM ノードなので listener / state は維持）
  placeholder = document.createComment("pip-placeholder");
  main.parentNode.insertBefore(placeholder, main);
  pipWindow.document.body.appendChild(main);

  updateButtonLabel(true);

  pipWindow.addEventListener("pagehide", () => {
    // 窓が閉じたら main を元の位置に戻す
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(main, placeholder);
      placeholder.remove();
    } else {
      document.body.appendChild(main);
    }
    pipWindow = null;
    placeholder = null;
    updateButtonLabel(false);
  });
}

function copyStyles(targetDoc) {
  for (const sheet of document.styleSheets) {
    try {
      const cssText = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = targetDoc.createElement("style");
      style.textContent = cssText;
      targetDoc.head.appendChild(style);
    } catch {
      // CORS 等で cssRules が読めない場合は <link> で代替
      if (sheet.href) {
        const link = targetDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  }
}

function updateButtonLabel(active) {
  const btn = document.getElementById("popout-btn");
  if (!btn) return;
  btn.textContent = active ? "📌 戻す" : "📌 浮き出す";
}
