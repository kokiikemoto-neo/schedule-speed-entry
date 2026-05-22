# Sales Follower

営業フォローアップを Google ツール (Calendar / Gmail / Tasks) と連携して半自動化するブラウザツール。

- 📞 **再架電予定** → Google カレンダーに自動登録
- 📧 **メール送付** → Google Tasks + Gmail 下書きを一括作成 (サービス別の雛形対応、署名自動付与)
- 📋 **サービスごとの雛形** — 商品別のフォローテンプレを管理
- 📌 **浮き出し小窓** — Document Picture-in-Picture で常時最前面
- 🔒 **データは利用者の Google アカウントとブラウザのみ** (アプリ運営者のサーバには何も送信されない)

公開 URL を開いて Google ログインするだけ。サーバ側に何も持たない静的 SPA です。

---

## 🚀 公開デプロイ手順

### A. Vercel (推奨・5分)

1. このリポジトリを GitHub に push
2. [https://vercel.com/new](https://vercel.com/new) で当該リポジトリを Import
3. Framework Preset: **Other** (ビルド設定なし)
4. **Deploy** クリック → `https://<project>.vercel.app/` が発行される
5. デプロイ URL を Google Cloud Console (後述) に登録

`vercel.json` でセキュリティヘッダと no-cache を自動配信。push のたびに自動再デプロイ。

### B. Netlify

1. GitHub に push
2. [https://app.netlify.com/start](https://app.netlify.com/start) → リポジトリを接続
3. Publish directory: **`.`** / Build command: **空欄**
4. Deploy → URL 発行

`netlify.toml` で同じヘッダ設定が入る。

### C. GitHub Pages

1. リポジトリの **Settings** → **Pages**
2. Source: **Deploy from a branch** → Branch: `main` / `/ (root)`
3. URL: `https://<user>.github.io/<repo>/`

> 注: GitHub Pages はカスタムヘッダを送れないので、no-cache 制御はブラウザ側の `<meta>` 任せになります。

---

## 🛠 Google Cloud Console 側の設定

### 必要な API を有効化

[Google Cloud Console](https://console.cloud.google.com/) でプロジェクト選択後:

- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) → 有効化
- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) → 有効化
- [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com) → 有効化

### OAuth クライアント ID に公開 URL を追加

「APIとサービス」→「認証情報」→ OAuth 2.0 クライアント ID を開き、**承認済み JavaScript 生成元** に以下を追加 (末尾スラッシュ無し):

```
http://localhost:5173
https://your-domain.vercel.app
```

カスタムドメインを使う場合はそれも追加。

### API キーの制限 (推奨)

「APIとサービス」→「認証情報」→ API キー:

- **アプリケーションの制限**: HTTP リファラを選び、`https://your-domain.vercel.app/*` と `http://localhost:5173/*` を許可
- **API の制限**: Calendar API / Gmail API / Tasks API のみに絞る

---

## 🌐 OAuth 同意画面 (一般公開する場合)

社内利用なら **Internal** モードで完結します。広く一般公開するなら以下:

### 1. 必要なリンクを Cloud Console に登録

- アプリケーションのホームページ: `https://your-domain.vercel.app/`
- プライバシーポリシー URL: `https://your-domain.vercel.app/#privacy`
- 利用規約 URL: `https://your-domain.vercel.app/#terms`
- アプリのロゴ: 120×120px 以上の PNG

### 2. スコープを明示

機密スコープを使うため、Cloud Console で以下を申請:

| スコープ | 用途 |
|---|---|
| `auth/calendar.events` | カレンダー予定の作成 |
| `auth/gmail.compose` | Gmail 下書きの作成 (送信なし) |
| `auth/tasks` | Google Tasks の作成・完了 |

### 3. ドメイン所有確認

[Search Console](https://search.google.com/search-console) でデプロイ先ドメインの所有を証明。

### 4. アプリを「公開」して Google レビューに送る

「テスト」モードのままだとテストユーザ (最大100名) しか使えません。「公開」を押すと Google の審査 (1〜2週間) が始まります。

---

## 🧪 ローカル開発

```powershell
python dev-server.py
# → http://localhost:5173/
```

OAuth クライアントの「承認済み JavaScript 生成元」に `http://localhost:5173` を入れておく必要があります。

---

## 📁 ファイル構成

```
schedule-speed-entry/
├── index.html              # エントリ・ランディング・モーダル群
├── dev-server.py           # no-cache 強制版 HTTP サーバ (開発用)
├── vercel.json             # Vercel デプロイ設定
├── netlify.toml            # Netlify デプロイ設定
├── README.md               # このファイル
└── src/
    ├── main.js             # 起動・モーダル制御・ハッシュルーティング
    ├── auth.js             # Google OAuth (GIS) + トークン自動更新
    ├── calendar.js         # Calendar API (増分同期 + 401リトライ)
    ├── gmail.js            # Gmail 下書き作成 (UTF-8対応)
    ├── tasks.js            # Google Tasks 作成・一覧・完了
    ├── next-event.js       # 直近予定+タスク一覧描画
    ├── quick-add.js        # 登録フォーム (再架電/メール送付分岐)
    ├── services.js         # サービス(雛形)管理
    ├── settings.js         # 設定モーダル制御・署名管理
    ├── pop-out.js          # Document Picture-in-Picture
    ├── status-banner.js    # 上部ステータスバナー
    ├── config.js           # 認証情報 (localStorage 優先, fallback あり)
    └── style.css
```

---

## 🔗 公開 URL のディープリンク

ハッシュで直接モーダルを開けます。

| URL | 開くもの |
|---|---|
| `https://your-domain/#privacy` | プライバシーポリシー |
| `https://your-domain/#terms` | 利用規約 |
| `https://your-domain/#howto` | 導入方法 |

Google Cloud Console の「プライバシーポリシー URL」欄にそのまま貼れます。

---

## 🐛 トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `取得失敗 [syncEvents/401]` が一瞬出る | OAuth トークン期限切れ。自動リトライで次回ポーリングで復旧 |
| `アプリは確認されていません` 警告 | OAuth 同意画面がテストモード。自分をテストユーザに追加するか「公開」へ |
| `redirect_uri_mismatch` | OAuth クライアントの「承認済み JavaScript 生成元」に該当 URL を追加 |
| `Gmail API が読み込まれていません` | Cloud Console で Gmail API を有効化 |
| `Tasks API が読み込まれていません` | Cloud Console で Tasks API を有効化 |
| API エラー [403] referrer blocked | API キーのリファラ制限を確認 |

---

## 📜 ライセンス

社内利用および個人利用向け。再配布・商用転用は規約 (`#terms`) を参照。

---

## 📮 連絡先

`koki.ikemoto@neo-career.co.jp`
