# lp（ランディングページ）

広告などの流入先として使うLPを、1つずつフォルダに分けて置きます。HP（`../hp/`）と同じドメインで公開し、フォーム・計測の仕組みは HP のものを共通で使います。

## フォルダ名の付け方

`<媒体>-<テーマ>-<申込の形>` の順で、LPの特徴がわかる英語の名前にします。フォルダ名がそのまま公開URLになります。

| 例 | 意味 |
|---|---|
| `google-maps-review-free-diagnosis` | Googleマップの口コミ対策に特化・無料診断で申し込み |
| `sns-review-line-consult`（例） | SNSの口コミ対策・LINE相談で申し込み |

## 一覧

| フォルダ | 公開URL | 内容 |
|---|---|---|
| [`google-maps-review-free-diagnosis/`](google-maps-review-free-diagnosis/) | https://kuchikomi-taisaku.com/lp/google-maps-review-free-diagnosis/ | 法人向け・Googleマップ口コミ対策・無料診断。Studio版（旧URL `/biz-hidden-gad`）を移植 |

## ファイル構成（各LP共通）

| ファイル | 内容 |
|---|---|
| `index.html` | ページ本体（文章の修正はここ。HP の `node server.js` 起動中はページ上の編集ツールでも直せます） |
| `lp.css` | デザイン |
| `lp.js` | ページ内の動き（FAQの開閉・カルーセルなど） |
| `images/` | 画像（WebPなどに圧縮して置く） |

HP 側の共通ファイルは、ルートからの絶対パス（`/assets/...`）で読み込みます。
- `/assets/css/lp-form.css`：無料診断フォームのデザイン
- `/assets/js/track.js`：アクセス計測・フォーム送信（送信先は `/backend/form.php`）

## 確認方法

HP の編集サーバーで確認できます。

```powershell
cd "C:\Users\meari\OneDrive\デスクトップ\mearin0424-tech\kuchikomi\hp"
node server.js
# → http://localhost:8080/lp/google-maps-review-free-diagnosis/
```

GitHub Pages ではフォームのデザインや計測（ルートからの絶対パスで読み込むもの）が効かないため、見た目の確認は上記のローカル環境か公開サーバーで行ってください。

## 公開

リポジトリの `lp/` フォルダを、XServer の `public_html/lp/` にアップロードします（HP は `hp/` の中身を `public_html/` に）。

## google-maps-review-free-diagnosis の補足

Studio で公開していた `https://kuchikomi-taisaku.com/biz-hidden-gad` を、素の HTML/CSS/JS に移植したものです。文章・画像・配色・余白は Studio の設計データから取得し、PC表示はブロックごとの高さまで Studio 版と一致させています（ブレークポイントも Studio と同じ 1140px / 768px / 480px）。

- フォームの種別は `lp`、送信後は `/thanks-diagnosis/` に移動します。
- Studio 版で設定されていた Googleタグマネージャー（`GTM-NG2Z93L6`）と Googleアナリティクス（`G-ZFC9VNNNQZ`）を、このLPと HP の `thanks-diagnosis/` に入れてあります（公開ドメインでのみ読み込み）。
- 旧URL `/biz-hidden-gad` と `/thanks-2` は、HP の `.htaccess` で新しいURLへ転送します（広告URLの `?utm_...` は引き継がれます）。

### 切り替え時に確認すること

1. Google広告の最終ページURLを `https://kuchikomi-taisaku.com/lp/google-maps-review-free-diagnosis/` に変更する（変更前でも旧URLからの転送で表示されます）。
2. Studio 側の「カスタムコード」設定に、GTM・GA以外のタグ（広告の計測タグなど）が入っていないか確認し、あれば `index.html` の `<head>` に移す。
3. GTM で「フォーム送信完了」をコンバージョンにしている場合、トリガーのページURLを `/thanks-2` から `/thanks-diagnosis/` に変更する。
4. 公開後、旧URL `https://kuchikomi-taisaku.com/biz-hidden-gad?utm_source=test` が新URLに転送されること、フォームがテスト送信できることを確認する。
