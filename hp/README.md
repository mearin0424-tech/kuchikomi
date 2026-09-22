# hp（コーポレートサイト）

`https://kuchikomi-taisaku.com/`（Studio製・一般社団法人 口コミ対策センター）のリニューアル用静的サイト。

## 経緯

旧サイトはStudio.Designで構築されており、Nuxt製SPAとして配信されているため、生HTMLからは本文を取得できませんでした（curl/Wayback Machineいずれも空のSPAシェルのみ）。
そのため本フォルダは、Studio内のメタデータから抽出した情報（サイト名、説明文、配色、フォント、ページ構成、画像URL）を元に、**素のHTML/CSSで再構築**したものです。

抽出済みの旧サイトメタ情報:
- タイトル: 一般社団法人 口コミ対策センター
- ディスクリプション: ネット上の風評から事業者の信用を守る専門機関。
- カラー: navy `#044072` / blue `#0048be` / red `#bb0000` / bg `#f8f7f6` / accent `#f59e0b`
- フォント: Noto Sans JP / Hiragino Kaku Gothic ProN / Zen Old Mincho
- 旧ページ: `/`, `/about`, `/service`, `/message`, `/recruit`, `/news`, `/column`, `/contact`, `/privacypolicy`, `/social-policy`, `/security-policy`, `/regulation`, `/lp1` ほかLP多数

## ディレクトリ構成

```
hp/
├── index.html                   トップページ
├── about/index.html             当センターについて
├── service/index.html           サービス内容
├── message/index.html           代表挨拶
├── recruit/index.html           採用情報
├── news/index.html              お知らせ
├── contact/index.html           お問い合わせ
├── privacypolicy/index.html     プライバシーポリシー
├── social-policy/index.html     ソーシャルメディアポリシー
├── security-policy/index.html   情報セキュリティ基本方針
├── regulation/index.html        特定商取引法に基づく表記
├── form/ ・ diagnosis-form/     無料診断フォーム（公開中LPと同じ2段階フォーム）
├── assets/
│   ├── css/style.css            共通スタイル（デザインシステム）
│   ├── css/lp-form.css          無料診断フォームの見た目
│   ├── js/main.js               ナビ／FAQの開閉
│   ├── js/editor.js             ページ文字編集ツールバー（ローカル起動時のみ表示）
│   ├── js/track.js              アクセス計測・フォーム送信
│   └── img/                     画像
├── admin/                       運営者ページ（入口・モックログイン）／editor/ 記事エディタ／dashboard.html アクセス解析 ※公開サーバーでは非公開
├── backend/                     フォーム受付・計測・集計（PHP、XServerで動作）
├── server.js                    ローカル用のプレビュー＆編集サーバー（Node.js）
├── _backups/                    編集前のHTMLの控え（自動作成・git管理外）
└── _config/                     アクセス解析の接続設定（自動作成・git管理外）
```

## ローカルでの起動方法

### 1. 必要なもの

- **Node.js**（LTS版）… https://nodejs.org からインストールします。
  PowerShell で `node -v` と打ってバージョンが表示されればOKです。
- ほかに追加でインストールするもの（npm パッケージなど）はありません。

### 2. 起動する

PowerShell を開いて、次の2行を実行します。

```powershell
cd "C:\Users\meari\OneDrive\デスクトップ\mearin0424-tech\kuchikomi\hp"
node server.js
```

次のように表示されれば起動しています。**作業中はこの PowerShell の画面を閉じないでください**（閉じるとサーバーが止まり、保存できなくなります）。

```
Site is running at http://localhost:8080
記事エディタ: http://localhost:8080/admin/editor/
アクセス解析: http://localhost:8080/admin/dashboard.html
LP（../lp/ フォルダ）: http://localhost:8080/lp/<LP名>/
```

### 3. ブラウザで開く

| 開くURL | できること |
|---|---|
| http://localhost:8080/ | サイトのプレビュー。各ページ下部のツールバーで文字を直接編集 |
| http://localhost:8080/admin/ | 運営者ページ（ツールの入口。デモ用ログイン: admin / kuchikomi） |
| http://localhost:8080/admin/editor/ | 記事エディタ（コラム・基礎知識・お知らせを章立てから編集） |
| http://localhost:8080/admin/dashboard.html | アクセス解析（公開サイトの閲覧数・流入元・申し込み） |
| http://localhost:8080/lp/google-maps-review-free-diagnosis/ | LP（`../lp/` フォルダのページも同じサーバーで確認・編集できます） |

URLの末尾の `/` は付けなくても自動で補われます。

### 4. 終了する

`node server.js` を実行している PowerShell で **Ctrl + C** を押します。

### うまくいかないとき

| 症状 | 対処 |
|---|---|
| `node` が見つからない（'node' は認識されていません） | Node.js をインストールし、PowerShell を開き直してください |
| `EADDRINUSE`（ポートが使用中）と出る | すでに別の画面で起動しています。その画面を使うか、`$env:PORT=8081; node server.js` のように番号を変えて起動し、http://localhost:8081 を開きます |
| 画面の見た目が崩れる・変更が反映されない | ブラウザで **Ctrl + F5**（キャッシュを使わず再読み込み） |
| 編集ツールバーが出ない／管理画面が「接続できません」と出る | `node server.js` が起動しているか、URLが `http://localhost:8080/...` になっているか確認します（ファイルを直接開いた場合は編集できません） |
| サイトは見られるが編集・保存だけできない | 編集はこのPCからのアクセスに限定しています。別の端末から編集する場合は `$env:ALLOW_REMOTE_EDIT="1"; node server.js` で起動します（社内LANなど信頼できるネットワークでのみ） |

### ファイルを直接開く場合

`start index.html` のようにファイルを直接ブラウザで開いても、見た目の確認はできます。ただし編集・保存、管理画面、フォーム送信は使えません。

### フォーム送信と計測をローカルで試す（任意）

フォーム送信・計測・集計は PHP（公開サーバー用）で動くため、`node server.js` だけでは試せません。公開前に手元で確かめたい場合：

1. https://windows.php.net/download/ から PHP 8.3 の「VS16 x64 Non Thread Safe」zip を取得して展開し、`php.ini-development` を `php.ini` にコピーして、`extension=pdo_sqlite` と `extension=mbstring` の行頭の `;` を外します。
2. `backend/config.sample.php` をコピーして `backend/config.php` を作ります（テスト用の値でOK）。
3. **サイトのコピー**（`hp` と `lp` フォルダを OneDrive の外に複製したもの）で、次を実行します。
   ```powershell
   C:\path\to\php\php.exe -S 127.0.0.2:8795 -t .
   ```
4. ブラウザで http://127.0.0.2:8795/ を開きます。`localhost` では計測しない設定のため、`127.0.0.2` を使います。
5. 送信された内容は `backend/data/analytics.sqlite` に保存されます。メールは手元では送られません（公開サーバーで確認します）。

### 注意：OneDrive 上での作業について

このフォルダは OneDrive で同期されています。複数のPCで同じフォルダを同時に開いていると、同期の食い違いで**ファイルが消えたり、`server-（PC名）.js` のような重複ファイルができたり**することがあります（実際に発生しました）。

- 編集は1台のPCで行い、もう1台では OneDrive の同期を一時停止してください。
- ファイルが消えた場合は、`git status` で確認し、`git checkout -- （ファイル名）` で元に戻せます。
- 長く使う場合は、作業フォルダを OneDrive の外（例: `C:\dev\kuchikomi`）に置き、PC間は GitHub 経由で共有するのが安全です。

## 編集機能（HPへ直接反映）

`node server.js` で起動したときだけ、各ページ下部に編集ツールバーが表示されます（`start index.html` で直接開いた場合や、公開サーバーでは表示されません）。保存するとHTMLファイルが直接書き換わるため、JSONの書き出しは不要です。

- **ページ文字編集**（全ページ）: 「編集開始」→ 文字を直接書き換え →「保存してHPに反映」。
- **記事エディタ** `http://localhost:8080/admin/editor/`（コラム `column/`・基礎知識 `knowledge/`・お知らせ `notice/`）
  - 記事タイトル、見出し下の説明文、英字ラベル、SEOタイトル、メタディスクリプション、一覧ページの紹介文（お知らせは日付・分類）
  - 本文をブロック単位で編集：章見出し(H2)・小見出し(H3/H4)・段落・箇条書き・番号リスト・引用・補足・HTML（表など）
  - 章立ての変更：ブロックの追加／削除／複製／種類変更、ドラッグ・▲▼での並べ替え、章（H2〜次のH2まで）ごとの移動・削除
  - 記事タイトルを変えると、パンくず・一覧・フッターなどサイト内のリンク文字も自動で書き換わります。
- **変更履歴**: 保存のたびに変更前のHTMLが `_backups/` に残り（1ファイル100件まで）、ツールバーの「変更履歴」から復元できます。`_backups/` はgit管理外です。
- 編集APIはこのPC（localhost）からのアクセスのみ受け付けます。LAN内の別端末から編集する場合は `ALLOW_REMOTE_EDIT=1` を付けて起動してください。
- 注意: `_generate.py` でページを再生成すると、編集内容は上書きされます。

## アクセス解析・フォーム受付（XServer）

公開サイトでは `assets/js/track.js` が閲覧・流入元・申込ボタンのクリックを記録し、フォーム（`form/`・`contact/`・`diagnosis-form/`）の送信を受け付けます。受け取り側は `backend/`（PHP 8.1以上＋SQLite）です。

- 記録するもの: 閲覧したページ、流入元（サイト内の前のページ／外部サイト名／`utm_source`）、申込ボタン（フォーム・問い合わせ・電話・LINEへのリンク）のクリック、フォーム送信。Cookieは使わず、タブを閉じるまでの「訪問」単位で集計します。IPアドレスは保存しません。
- フォームのデザイン・流れ: `form/`・`diagnosis-form/`・`../lp/` のLPは同じ2段階フォーム（HPのURL →「診断開始」→ 連絡先）。見た目は `assets/css/lp-form.css`、メールか電話の「いずれか必須」チェックや2段階の動きは `assets/js/track.js` にあります。
- フォーム送信: 入力内容を `backend/data/analytics.sqlite` に保存し、`mail_to` にメール通知、送信者に自動返信してからサンクスページへ移動します。
- 手元（`node server.js`）や GitHub Pages で開いたときは記録しません。

### 初期設定

1. `backend/config.sample.php` をコピーして `backend/config.php` を作り、次を書き換えます。
   - `mail_to`: 通知を受け取るアドレス
   - `mail_from`: XServer で作成した公開ドメインのメールアドレス（例: `no-reply@kuchikomi-taisaku.com`）
   - `stats_token`: 24文字以上のランダムな文字列（管理画面との合言葉）
2. XServer のサーバーパネルで、対象ドメインの PHP バージョンを 8.1 以上にします。
3. `hp/` の中身を `public_html` に、リポジトリ直下の `lp/` フォルダを `public_html/lp/` にアップロードします。`_config/`・`_backups/` はアップロードしないでください（`admin/` などは `.htaccess` で公開されないようにしてあります）。
4. 公開サイトのフォームからテスト送信し、通知メールとサンクスページを確認します。
5. 手元で `node server.js` を起動し、`http://localhost:8080/admin/dashboard.html` の「接続設定」に `https://（ドメイン）/backend/stats.php` と `stats_token` を入力します（このPCの `_config/analytics.json` にだけ保存されます）。

## 未対応・要差し替え

ローンチ前に置き換えてください：

- ヘッダーCTAの電話番号 `tel:0000000000`（`index.html`）
- フォームの通知先メールアドレス（`backend/config.php` の `mail_to` / `mail_from`）
- 特商法表記の所在地・代表者名・支払期日（`regulation/index.html`）
- お知らせ（`news/index.html` のサンプル4件を実データに差し替え）
- 旧サイトのCMS依存部分（`/column/:slug`, `/news/:slug` の動的記事）は、microCMS等の導入かMarkdown静的化を別途検討
- 旧サイトの画像 — 今は旧Studio配信URL（`storage.googleapis.com/production-os-assets/...`）をそのまま参照しています。Studio側で公開停止すると404になるため、`assets/img/` に保存し直すのが安全です。

## LP（ランディングページ）

LP は HP と同じ階層の `../lp/` フォルダにあります（公開URLは `https://kuchikomi-taisaku.com/lp/<LP名>/`）。フォームのデザイン（`assets/css/lp-form.css`）・送信・計測（`assets/js/track.js`、`backend/`）は HP のものを共通で使います。詳しくは [`../lp/README.md`](../lp/README.md) を参照してください。
