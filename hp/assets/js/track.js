// アクセス計測（閲覧・流入元・申込ボタン）とフォーム送信。送信先は backend/*.php（XServer）
(() => {
  const script = document.currentScript;
  if (!script) return;
  const root = new URL('../../', script.src); // assets/js/ から見たサイトのトップ
  const endpoint = (name) => new URL(`backend/${name}.php`, root).href;
  const host = location.hostname;
  // 手元での確認（node server.js / ファイル直開き）や GitHub Pages のプレビューでは記録しない
  const measuring = /^https?:$/.test(location.protocol)
    && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)
    && !host.endsWith('github.io')
    && !navigator.webdriver;

  const store = {
    get(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境でも続行 */ } }
  };

  // サイト内URLを「/column/it-law/」のようなサイト内パスに変換（サイト外なら null）
  function sitePath(url) {
    let u;
    try { u = new URL(url, location.href); } catch { return null; }
    if (u.origin !== location.origin || !u.pathname.startsWith(root.pathname)) return null;
    return `/${u.pathname.slice(root.pathname.length)}`.replace(/index\.html$/, '');
  }

  const path = sitePath(location.href) || location.pathname;
  const title = (document.title || '').split(/[｜|]/)[0].trim();
  const isArticle = /^\/(column|knowledge|notice)\/[^/]+\/$/.test(path);

  // 訪問（タブを閉じるまで）ごとのランダムID。Cookie は使わない
  let sid = store.get('kcc:sid');
  if (!sid) {
    sid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    store.set('kcc:sid', sid);
  }

  function referrer() {
    const campaign = new URLSearchParams(location.search).get('utm_source');
    if (campaign) return { refType: 'campaign', ref: campaign.slice(0, 100) };
    if (!document.referrer) return { refType: 'direct', ref: '' };
    const internal = sitePath(document.referrer);
    if (internal) return { refType: 'internal', ref: internal };
    try { return { refType: 'external', ref: new URL(document.referrer).hostname }; } catch { return { refType: 'direct', ref: '' }; }
  }

  function send(payload) {
    if (!measuring) return;
    const body = JSON.stringify({ sid, path, title, ...payload });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint('track'), new Blob([body], { type: 'text/plain' }))) return;
    } catch { /* fetch で再試行 */ }
    fetch(endpoint('track'), { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  }

  // ---- 閲覧 ----
  const ref = referrer();
  if (!store.get('kcc:entry')) store.set('kcc:entry', { ...ref, path });
  if (isArticle) store.set('kcc:last-article', path);
  send({ type: 'view', ...ref });

  // ---- 申込ボタン（フォーム・問い合わせ・電話・LINEへのリンク）のクリック ----
  const CTA = [
    { kind: '無料診断・申込フォーム', test: (p) => p === '/form/' },
    { kind: '無料診断フォーム', test: (p) => p === '/diagnosis-form/' },
    { kind: 'お問い合わせ', test: (p) => p === '/contact/' }
  ];
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('[data-editor-skip]')) return;
    const href = a.getAttribute('href') || '';
    let kind = '';
    if (href.startsWith('tel:')) kind = '電話';
    else if (/line\.me|lin\.ee/.test(href)) kind = 'LINE';
    else if (href.length > 1 && href.startsWith('#') && document.getElementById(href.slice(1))?.querySelector('form[data-form]')) kind = '無料診断（ページ内フォーム）';
    else {
      const target = sitePath(a.href);
      const hit = target && target !== path && CTA.find((c) => c.test(target));
      if (hit) kind = hit.kind;
    }
    if (kind) send({ type: 'cta', detail: kind, refType: 'internal', ref: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
  }, true);

  // ---- フォーム送信 ----
  // 各項目を「見出しラベル：入力内容」の形にまとめて送る（HTML側に name 属性がなくても動く）
  function collectFields(form) {
    const fields = [];
    // data-field があればその単位、なければフォーム直下の要素ごとに1項目とみなす
    const groups = form.querySelector('[data-field]') ? [...form.querySelectorAll('[data-field]')] : [...form.children];
    groups.forEach((group) => {
      const controls = [...group.querySelectorAll('input, textarea, select')].filter((c) => !['submit', 'button', 'hidden'].includes(c.type) && c.name !== 'website');
      if (!controls.length) return;
      const heading = [...group.querySelectorAll('label')].find((l) => !l.querySelector('input, textarea, select'));
      const labelEl = heading && heading.cloneNode(true);
      // 「必須」「任意」などのバッジは項目名に含めない
      labelEl?.querySelectorAll('.lpf-badge, span').forEach((b) => { if (b.classList.contains('lpf-badge') || /^(必須|任意|いずれか必須)$/.test(b.textContent.trim())) b.remove(); });
      const label = labelEl ? labelEl.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim() : '';
      if (!label) {
        // 見出しのないグループ＝プライバシーポリシー同意欄
        const consent = controls.find((c) => c.type === 'checkbox');
        if (consent) fields.push({ label: 'プライバシーポリシーへの同意', value: consent.checked ? '同意する' : '同意しない' });
        return;
      }
      const values = [];
      const dateRows = new Set();
      controls.forEach((c) => {
        if (c.type === 'checkbox' || c.type === 'radio') {
          if (c.checked) values.push((c.closest('label')?.textContent || c.value).replace(/\s+/g, ' ').trim());
        } else if (c.type === 'date' || c.type === 'time') {
          const row = c.parentElement;
          if (dateRows.has(row)) return;
          dateRows.add(row);
          const [date, start, end] = [...row.querySelectorAll('input')].map((i) => i.value);
          if (!date && !start && !end) return;
          const name = row.parentElement?.querySelector('span')?.textContent.trim() || '希望日時';
          values.push(`${name}: ${date || '日付未指定'} ${start || ''}${end ? `～${end}` : ''}`.trim());
        } else if (c.value.trim()) {
          values.push(c.value.trim());
        }
      });
      if (values.length) fields.push({ label, value: values.join('\n'), kind: controls.some((c) => c.type === 'email') ? 'email' : '' });
    });
    return fields;
  }

  function showFormMessage(form, text) {
    let box = form.querySelector('.kcc-form-error');
    if (!box) {
      box = document.createElement('p');
      box.className = 'kcc-form-error';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#fef2f2;color:#991b1b;font-weight:700;line-height:1.7';
      form.appendChild(box);
    }
    box.textContent = text;
  }

  const startedAt = Date.now();
  document.querySelectorAll('form[data-form]').forEach((form) => {
    // ボット対策の隠し項目（人には見えない）
    const trap = document.createElement('input');
    trap.type = 'text';
    trap.name = 'website';
    trap.tabIndex = -1;
    trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(trap);

    // 入力を始めた（2段階フォームなら連絡先欄を開いた）ことを1回だけ記録
    let started = false;
    const markStarted = () => {
      if (started) return;
      started = true;
      send({ type: 'form_start', detail: form.dataset.form, refType: 'internal', ref: '' });
    };

    // メールアドレス・電話番号の「いずれか必須」
    const either = [...form.querySelectorAll('[data-either]')];
    const checkEither = () => {
      if (!either.length) return;
      const ok = either.some((i) => i.value.trim());
      either[0].setCustomValidity(ok ? '' : 'メールアドレスか電話番号のどちらかをご入力ください。');
    };
    either.forEach((i) => i.addEventListener('input', checkEither));
    checkEither();

    // 2段階フォーム（公開中LPと同じ）：URLを入れて「診断開始」→ 連絡先欄が開く
    const step2 = form.querySelector('[data-step2]');
    const isOpen = () => !step2 || form.classList.contains('is-open');
    if (step2) step2.inert = true;
    const openStep2 = () => {
      const url = form.querySelector('.lpf-step1 input');
      if (url && !url.reportValidity()) return;
      if (isOpen()) {
        // 開いた後にもう一度押されたら、未入力の欄へ案内する
        const next = [...step2.querySelectorAll('input, textarea')].find((i) => !i.value.trim()) || step2.querySelector('input');
        next?.focus();
        return;
      }
      form.classList.add('is-open');
      step2.inert = false;
      send({ type: 'cta', detail: '診断開始', refType: 'internal', ref: form.dataset.form });
      markStarted();
      setTimeout(() => { form.classList.add('is-opened'); step2.querySelector('input, textarea')?.focus({ preventScroll: true }); }, 320);
    };
    form.querySelector('[data-step-next]')?.addEventListener('click', openStep2);
    // 送信ボタンが隠れている間はブラウザが Enter で送信しないため、URL欄の Enter で「診断開始」と同じ動きにする
    form.querySelector('.lpf-step1 input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && !isOpen()) { e.preventDefault(); openStep2(); }
    });
    form.addEventListener('focusin', () => { if (isOpen()) markStarted(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isOpen()) { openStep2(); return; } // URL欄で Enter を押したときも2段階目を開く
      checkEither();
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      const original = button ? button.innerHTML : '';
      if (button) { button.disabled = true; button.textContent = '送信中…'; }
      try {
        const res = await fetch(endpoint('form'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form: form.dataset.form,
            fields: collectFields(form),
            website: trap.value,
            elapsed: Date.now() - startedAt,
            sid,
            path,
            entry: store.get('kcc:entry'),
            lastArticle: store.get('kcc:last-article')
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || '送信に失敗しました。');
        location.href = new URL(form.dataset.thanks || 'thanks/', root).href;
      } catch (err) {
        showFormMessage(form, `${err.message} 時間をおいて再度お試しいただくか、LINE（https://lin.ee/gVRUtOl）からご連絡ください。`);
        if (button) { button.disabled = false; button.innerHTML = original; }
      }
    });
  });
})();
