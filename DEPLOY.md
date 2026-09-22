# 本番公開の手順書（XServer）

新しいHP・LPを `https://kuchikomi-taisaku.com/` で公開し、**申し込み（無料診断・お問い合わせ）が最後まで届く状態**にするための手順とチェックリストです。上から順に進めてください。終わった項目は `[ ]` を `[x]` にしておくと進み具合が分かります。

> GitHub に push しただけでは公開されません。GitHub は保管用で、公開サーバー（XServer）へは別途アップロードが必要です。

---

## 全体の流れ

```
お客様がフォーム送信
  → XServer の backend/form.php が受け取り、サーバー内（backend/data/）に保存
  → 担当者へ通知メール ／ お客様へ自動返信メール
  → サンクスページ（/thanks/ ・ /thanks-diagnosis/）へ移動
```

申し込みの窓口は **無料診断（`/form/`）・お問い合わせフォーム（`/contact/`）・LINE（`https://lin.ee/gVRUtOl`）** の3つです。電話・メールでの受付はしていません。

---

## 1. 公開前に中身を直す

- [ ] **お知らせ一覧の見本記事を差し替える**
  `hp/news/index.html` に見本のお知らせ（「ホームページをリニューアルいたしました」など5件）が残っています。実際のお知らせに差し替えるか、不要なものを消してください。
- [ ] **特定商取引法に基づく表記を確認する**（`hp/regulation/index.html`）
  - 事業者名・代表者・所在地・支払時期が正しいか確認する。
  - 電話番号を載せない場合は、「電話番号：ご請求があった場合、遅滞なく開示いたします」のような一文が必要です（特定商取引法上、電話番号の表示か開示の案内が求められます）。文言は専門家にご確認ください。
- [ ] **料金の表記がそろっているか確認する**
  サイトは「完全成功報酬制・初期費用0円・金額は個別見積り」に統一しています（料金ページ・FAQ・特商法表記）。実際の契約条件と合っているか確認してください。

---

## 2. フォーム受付の設定ファイル（config.php）を作る

**これがないと、送信ボタンを押してもエラーになり、申し込みが届きません。**

1. [ ] `hp/backend/config.sample.php` をコピーし、同じフォルダに `config.php` という名前で保存する。
2. [ ] `config.php` の次の値を書き換える。

   | 項目 | 入れる値 |
   |---|---|
   | `mail_to` | 申し込みの通知を受け取るメールアドレス（普段見ているアドレス） |
   | `mail_from` | XServer で作る送信専用アドレス。**公開ドメインのアドレスにする**（例 `no-reply@kuchikomi-taisaku.com`）。Gmail などにすると迷惑メール扱いされやすくなります |
   | `mail_from_name` | 送信者名（そのままで可） |
   | `auto_reply` | お客様への自動返信を送るなら `true`（そのままで可） |
   | `signature` | 自動返信メールの署名（所在地など。必要に応じて修正） |
   | `stats_token` | アクセス解析用の合言葉。24文字以上のランダムな文字列にする |

   `stats_token` は PowerShell で次を実行すると作れます。

   ```powershell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
   ```

> `config.php` には秘密の値が入るため、GitHub には登録されない設定になっています（`.gitignore`）。このPCとXServerにだけ置いてください。

---

## 3. XServer の設定

1. [ ] **送信専用のメールアドレスを作る**
   サーバーパネル →「メールアカウント設定」で、`config.php` の `mail_from` に書いたアドレス（例 `no-reply@kuchikomi-taisaku.com`）を作成する。
2. [ ] **PHP のバージョンを 8.1 以上にする**
   サーバーパネル →「PHP Ver.切替」で、対象ドメインを 8.1 以上（推奨 8.3）にする。
3. [ ] **SSL（https）を有効にする**
   サーバーパネル →「SSL設定」で無料独自SSLを追加する（ドメインをXServerに向けた後でないと追加できない場合があります → 手順5のあとで行う）。

---

## 4. ファイルをアップロードする

XServer のファイルマネージャー、または FTP ソフト（FileZilla など）でアップロードします。

1. [ ] `hp/` フォルダの**中身**を `public_html/` にアップロードする（`hp` フォルダごとではなく中身）。
2. [ ] リポジトリ直下の `lp/` フォルダを `public_html/lp/` としてアップロードする。
3. [ ] 手順2で作った `config.php` が `public_html/backend/config.php` にあることを確認する。
4. [ ] `public_html/backend/data/` フォルダに PHP が書き込めることを確認する（通常はそのままで可。送信テストで保存エラーが出たら、このフォルダの権限を `755` か `705` にする）。

**アップロードしないもの**（誤って上げても外からは見えない設定にしてありますが、上げないのが安全です）

| アップロードしない | 理由 |
|---|---|
| `content/`（リポジトリ直下） | 記事の元データ。ページは生成済みのHTMLが `hp/` に入っています |
| `hp/_backups/`・`hp/_config/` | 編集の控え・このPC用の設定 |
| `hp/build/`・`hp/server.js`・`hp/_generate.py`・`hp/README.md` | 手元での編集・生成用 |
| `hp/admin/` | 運営者用の画面（手元専用） |
| `lp-design-mock/` | 以前の試作 |

> 記事エディタで画像を入れた場合は、`hp/assets/img/articles/` も忘れずにアップロードしてください（`hp/` の中身ごと上げれば含まれます）。

---

## 5. ドメインを XServer に向ける

今の `kuchikomi-taisaku.com` は Studio のサイトを表示しています。切り替えるまで新しいサイトは公開されません。

1. [ ] XServer のサーバーパネル →「ドメイン設定」に `kuchikomi-taisaku.com` を追加する（未追加の場合）。
2. [ ] ドメインを管理しているサービス（お名前.com・Studio など）で、ネームサーバーを XServer のもの（`ns1.xserver.jp` 〜 `ns5.xserver.jp`）に変更する。
   - 反映には数時間〜最大72時間ほどかかります。
   - 切り替え中は、旧サイト・新サイトのどちらかが表示されます。
3. [ ] 反映後、手順3-3の SSL を設定し、`https://kuchikomi-taisaku.com/` が開けることを確認する。
4. [ ] 旧サイト（Studio）の公開は、新サイトの表示を確認してから止める。

> 広告で使っている旧LPのURL（`/biz-hidden-gad`）は、自動で新しいLP（`/lp/google-maps-review-free-diagnosis/`）へ転送されます。広告の `?utm_...` なども引き継がれます。

---

## 6. 公開後の動作確認

### 申し込み（いちばん大事）

次の4か所から1回ずつテスト送信し、表の3点がすべてそろうことを確認してください。

| フォーム | ページ | 送信後に移動するページ |
|---|---|---|
| [ ] 無料診断 | `/form/` | `/thanks/` |
| [ ] 無料診断（別ページ） | `/diagnosis-form/` | `/thanks-diagnosis/` |
| [ ] お問い合わせ | `/contact/` | `/thanks/` |
| [ ] LP（上下2か所のフォームのどちらか） | `/lp/google-maps-review-free-diagnosis/` | `/thanks-diagnosis/` |

各フォームで確認すること：

- [ ] サンクスページに移動する
- [ ] `mail_to` に「【サイト受付】〜」という通知メールが届く（送信内容・流入元が書かれている）
- [ ] 入力したメールアドレスに「【口コミ対策センター】お問い合わせを受け付けました」という自動返信が届く

> 送信してから3秒以内に押した場合や、ボット対策の隠し項目が埋まっている場合は、エラーは出ずに保存されません（いたずら対策）。テストでは入力に3秒以上かけてください。
>
> メールが届かないときは、迷惑メールフォルダを確認し、`config.php` の `mail_from` が XServer で作ったアドレスになっているか確認してください。

### そのほか

- [ ] 画面下の固定バー・ページ下部の「LINEで相談」が、正しいLINEアカウント（`https://lin.ee/gVRUtOl`）を開く
- [ ] ヘッダーの「無料で診断」、ページ下部の「お問い合わせ」が正しいページを開く
- [ ] スマホで、トップ・サービス内容・料金・LP・フォームの表示が崩れていない
- [ ] `https://kuchikomi-taisaku.com/biz-hidden-gad` を開くと新しいLPに転送される
- [ ] `https://kuchikomi-taisaku.com/admin/` と `/build/` が開けない（404になる）
- [ ] `https://kuchikomi-taisaku.com/backend/config.php` が開けない（403になる）
- [ ] LP と `/thanks-diagnosis/` で Googleタグマネージャー（GTM-NG2Z93L6）が動いている（Google広告のコンバージョン計測用。タグマネージャーのプレビューで確認）

### アクセス解析（管理画面）

- [ ] 手元で `hp` フォルダの `node server.js` を起動し、`http://localhost:8080/admin/dashboard.html` を開く
- [ ] 「接続設定」に `https://kuchikomi-taisaku.com/backend/stats.php` と、`config.php` の `stats_token` を入力する
- [ ] テスト送信した分が「フォーム送信」に数えられていることを確認する

### 検索エンジン

- [ ] Google Search Console にドメインを登録し、サイトマップ `https://kuchikomi-taisaku.com/sitemap.xml` を送信する

---

## 7. 公開後の更新のしかた

- 記事（コラム・基礎知識・お知らせ・成功事例）は、手元で `node server.js` を起動して記事エディタ（`http://localhost:8080/admin/editor/`）で編集・保存します。保存すると `hp/` 内のHTMLが作り直されるので、**変わったファイルを XServer にアップロードし直してください**（`sitemap.xml` も更新されます）。
- 変更は GitHub にも `git push` しておくと、控えとして残ります。
- 詳しい編集方法は [`hp/README.md`](hp/README.md)、LPの追加方法は [`lp/README.md`](lp/README.md) を参照してください。
