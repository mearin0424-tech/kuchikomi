# hp-renewal

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
hp-renewal/
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
├── assets/
│   ├── css/style.css            共通スタイル（デザインシステム）
│   ├── js/main.js               ナビ／FAQの開閉
│   └── img/                     ローカル画像置場（必要に応じて）
└── _source_dump/                旧サイトHTML（取得した参考用、削除可）
```

## 確認方法

ローカルでブラウザ起動するだけで動きます。

```powershell
# 例: Pythonで簡易サーバを立てる
cd hp-renewal
python -m http.server 8080
# → http://localhost:8080 にアクセス
```

## 未対応・要差し替え

ローンチ前に置き換えてください：

- ヘッダーCTAの電話番号 `tel:0000000000`（`index.html`）
- お問い合わせフォームの送信先（`contact/index.html` の `action="#"`）
- 特商法表記の所在地・代表者名・支払期日（`regulation/index.html`）
- お知らせ（`news/index.html` のサンプル4件を実データに差し替え）
- 旧サイトのCMS依存部分（`/column/:slug`, `/news/:slug` の動的記事）は、microCMS等の導入かMarkdown静的化を別途検討
- 旧サイトの画像 — 今は旧Studio配信URL（`storage.googleapis.com/production-os-assets/...`）をそのまま参照しています。Studio側で公開停止すると404になるため、`assets/img/` に保存し直すのが安全です。

## LP統合について

姉妹フォルダ `../lp-design-mock/` にGoogleマップ口コミ対策LP（着手金ゼロ・成果報酬訴求）の試作があります。
コーポレートHPの導線として `/lp1` 配下に組み込む場合、`hp-renewal/lp1/` を新設し当該HTMLを移植してください。
