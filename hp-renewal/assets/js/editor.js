(() => {
  const APP = 'kcc-page-editor';
  const TEXT_SELECTOR = [
    'h1','h2','h3','h4','h5','h6','p','li','dt','dd','blockquote','figcaption',
    'a','button','label','span','strong','em','small','th','td','caption','summary'
  ].join(',');
  const SKIP_SELECTOR = [
    'script','style','noscript','svg','path','iframe','canvas','video','audio',
    '.editor-toolbar','.editor-history-panel','.editor-toast','.editor-intro-overlay','.editor-intro-dialog','[data-editor-skip]'
  ].join(',');
  const EDITOR_ATTRS = ['data-edit-id', 'data-editable-text', 'data-original-text', 'data-original-html', 'contenteditable', 'spellcheck'];
  const EDITOR_CLASSES = ['is-editing', 'is-edited'];
  const pagePath = location.pathname;
  // 旧バージョン（ブラウザ保存）の編集データ
  const legacyKey = `${APP}:${pagePath.replace(/\/$/, '') || '/'}`;
  const introKey = `${APP}:intro-seen`;
  const articleMatch = /^\/(column|knowledge|notice)\/([a-z0-9-]+)\/?(?:index\.html)?$/i.exec(pagePath);
  let editMode = false;
  let editables = [];
  let roots = [];
  let saving = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const hasReadableText = (el) => {
    if (!el || el.closest(SKIP_SELECTOR)) return false;
    if (el.children.length > 4) return false;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 1) return false;
    if (text.length > 1200) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  };
  const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 保存できなくても動作は続ける */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* noop */ } }
  };

  async function api(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `通信エラー（${res.status}）`);
    return data;
  }

  function css() {
    const style = document.createElement('style');
    style.dataset.editorSkip = 'true';
    style.textContent = `
      .editor-toolbar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:8px;align-items:center;max-width:min(94vw,1080px);padding:10px 12px;background:rgba(6,26,46,.96);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;font-size:12px;line-height:1.2;backdrop-filter:blur(12px)}
      .editor-toolbar strong{color:#fff;font-size:12px;white-space:nowrap}.editor-toolbar button,.editor-toolbar select,.editor-toolbar a{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);color:#fff;border-radius:9px;padding:9px 10px;font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap}.editor-toolbar button:hover,.editor-toolbar a:hover{background:rgba(255,255,255,.16);opacity:1}.editor-toolbar button:disabled{opacity:.45;cursor:default}.editor-toolbar .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-toolbar .accent{background:#0048be;border-color:#0048be}.editor-toolbar select{max-width:230px}.editor-toolbar option{color:#111}.editor-toolbar .status{color:rgba(255,255,255,.76);min-width:120px}.editor-toolbar .status.is-dirty{color:#fcd34d}.editor-toolbar .spacer{width:1px;height:24px;background:rgba(255,255,255,.2)}
      [data-editable-text]{outline-offset:3px;transition:outline-color .15s,background .15s}[data-editable-text].is-editing{outline:1px dashed rgba(245,158,11,.9);background:rgba(245,158,11,.09);cursor:text}[data-editable-text].is-edited{box-shadow:inset 0 -0.45em rgba(245,158,11,.16)}[data-editable-text]:focus{outline:2px solid #f59e0b!important;background:#fffbe8!important}

      .editor-intro-overlay{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;padding:20px;background:rgba(2,18,32,.62);backdrop-filter:blur(6px)}
      .editor-intro-dialog{width:min(620px,94vw);max-height:min(760px,92vh);overflow:auto;background:#fff;color:#172033;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.35);font:14px/1.8 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-intro-dialog__head{padding:22px 24px 16px;border-bottom:1px solid #eef0f4;background:linear-gradient(135deg,#f8fbff,#fff7e6)}.editor-intro-dialog__eyebrow{margin:0 0 6px;color:#044072;font-size:12px;font-weight:900;letter-spacing:.14em}.editor-intro-dialog h2{margin:0;color:#061a2e;font-size:22px;line-height:1.45}.editor-intro-dialog__body{padding:22px 24px}.editor-intro-dialog ol{margin:0 0 18px;padding-left:1.4em}.editor-intro-dialog li{margin:0 0 10px}.editor-intro-dialog strong{color:#044072}.editor-intro-dialog__note{margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#f8fafc;color:#475467;font-size:13px}.editor-intro-dialog__actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:16px 24px 22px;border-top:1px solid #eef0f4}.editor-intro-dialog button{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:999px;padding:10px 16px;font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer}.editor-intro-dialog button:hover{background:#f8fafc}.editor-intro-dialog .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-intro-dialog .primary:hover{background:#d97706;border-color:#d97706;color:#fff}
      .editor-toast{position:fixed;right:18px;top:18px;z-index:2147483001;max-width:min(420px,92vw);background:#044072;color:#fff;padding:12px 14px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);font:700 12px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-toast.is-error{background:#991b1b}.editor-help{position:fixed;right:18px;bottom:82px;z-index:2147482999;width:min(380px,92vw);padding:16px;background:#fff;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.18);font:13px/1.7 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-help h3{margin:0 0 8px;color:#044072;font-size:15px}.editor-help p{margin:0 0 8px}.editor-help code{background:#f3f4f6;padding:1px 5px;border-radius:4px}
      @media(max-width:760px){.editor-toolbar{left:10px;right:10px;bottom:10px;transform:none;display:grid;grid-template-columns:1fr 1fr;gap:7px}.editor-toolbar strong,.editor-toolbar .status,.editor-toolbar .spacer{display:none}.editor-toolbar button,.editor-toolbar select,.editor-toolbar a{width:100%;min-width:0;text-align:center}.editor-help{bottom:190px;right:10px}}
    `;
    document.head.appendChild(style);
  }

  function scan() {
    let idx = 0;
    editables = $$(TEXT_SELECTOR).filter(hasReadableText).map((el) => {
      const id = el.dataset.editId || `t${idx++}`;
      el.dataset.editId = id;
      el.dataset.editableText = 'true';
      el.dataset.originalText = el.textContent;
      return el;
    });
    // 入れ子になった編集対象は一番外側だけを編集可能にする（リンクや強調を含んだまま編集できる）
    roots = editables.filter((el) => !el.parentElement.closest('[data-editable-text]'));
    roots.forEach((el) => { el.dataset.originalHtml = el.innerHTML; });
  }

  const changedRoots = () => roots.filter((el) => el.innerHTML !== el.dataset.originalHtml);

  function refreshDirty() {
    const count = changedRoots().length;
    roots.forEach((el) => el.classList.toggle('is-edited', el.innerHTML !== el.dataset.originalHtml));
    const status = $('.editor-status');
    if (status) status.classList.toggle('is-dirty', count > 0);
    const saveBtn = $('.editor-save');
    if (saveBtn) saveBtn.disabled = count === 0 || saving;
    if (count) setStatus(`未反映の変更 ${count}箇所`);
    else setStatus(editMode ? '文字を直接編集できます' : '閲覧モード');
    return count;
  }

  function setMode(on) {
    editMode = on;
    roots.forEach((el) => {
      el.contentEditable = on ? 'true' : 'false';
      el.spellcheck = false;
    });
    editables.forEach((el) => el.classList.toggle('is-editing', on && roots.includes(el)));
    $('.editor-toggle').textContent = on ? '編集終了' : '編集開始';
    refreshDirty();
  }

  // 表示中の要素が、HTMLファイル上のどの要素にあたるかを body からの位置で求める
  function domPath(el) {
    const steps = [];
    let node = el;
    while (node && node !== document.body) {
      steps.unshift([...node.parentElement.children].indexOf(node));
      node = node.parentElement;
    }
    return node === document.body ? steps : null;
  }

  function resolvePath(body, steps) {
    let node = body;
    for (const i of steps) {
      node = node && node.children[i];
      if (!node) return null;
    }
    return node;
  }

  function cleanHtml(el) {
    const clone = el.cloneNode(true);
    [clone, ...clone.querySelectorAll('*')].forEach((node) => {
      EDITOR_ATTRS.forEach((attr) => node.removeAttribute(attr));
      EDITOR_CLASSES.forEach((cls) => node.classList.remove(cls));
      if (node.getAttribute('class') === '') node.removeAttribute('class');
    });
    return clone.innerHTML.replace(/&nbsp;/g, ' ');
  }

  function originalHtml(el) {
    const tmp = el.cloneNode(false);
    tmp.innerHTML = el.dataset.originalHtml;
    return cleanHtml(tmp);
  }

  async function save() {
    const changed = changedRoots();
    if (!changed.length || saving) return;
    saving = true;
    refreshDirty();
    setStatus('HPに反映中…');
    try {
      const { html } = await api(`/api/page?path=${encodeURIComponent(pagePath)}`);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const skipped = [];
      changed.forEach((el) => {
        const steps = domPath(el);
        const target = steps && resolvePath(doc.body, steps);
        // ファイル側が編集前と同じ内容のときだけ書き換える（別の場所で更新されていたら上書きしない）
        const matches = target && target.tagName === el.tagName && normalize(target.innerHTML.replace(/&nbsp;/g, ' ')) === normalize(originalHtml(el));
        if (!matches) { skipped.push(el); return; }
        target.innerHTML = cleanHtml(el);
      });
      const applied = changed.length - skipped.length;
      if (applied > 0) {
        await api('/api/page', { method: 'POST', body: JSON.stringify({ path: pagePath, bodyHtml: doc.body.innerHTML.replace(/\s+$/, '\n') }) });
      }
      changed.filter((el) => !skipped.includes(el)).forEach((el) => { el.dataset.originalHtml = el.innerHTML; el.dataset.originalText = el.textContent; });
      if (applied > 0) storage.remove(legacyKey);
      if (skipped.length) {
        toast(`${applied}箇所をHPに反映しました。${skipped.length}箇所はファイルが別の場所で更新されていたため反映できませんでした。ページを再読み込みしてから編集し直してください。`, true);
      } else {
        toast(`${applied}箇所をHPに反映しました。変更前の状態は履歴に残っています。`);
      }
      await refreshHistory();
    } catch (err) {
      toast(`保存できませんでした：${err.message}`, true);
    } finally {
      saving = false;
      refreshDirty();
    }
  }

  async function restore() {
    const select = $('.editor-history');
    const id = select.value;
    if (!id) { toast('復元する履歴を選択してください', true); return; }
    const label = select.selectedOptions[0].textContent;
    if (!confirm(`「${label}」の状態にページを戻して、HPに反映します。現在の状態も履歴に残ります。よろしいですか？`)) return;
    try {
      await api('/api/restore', { method: 'POST', body: JSON.stringify({ path: pagePath, id }) });
      location.reload();
    } catch (err) {
      toast(`復元できませんでした：${err.message}`, true);
    }
  }

  function discard() {
    if (changedRoots().length && !confirm('まだHPに反映していない変更を破棄して、ページを読み込み直します。よろしいですか？')) return;
    location.reload();
  }

  async function refreshHistory() {
    const select = $('.editor-history');
    if (!select) return;
    try {
      const { history } = await api(`/api/history?path=${encodeURIComponent(pagePath)}`);
      select.innerHTML = `<option value="">変更履歴（${history.length}件）</option>` + history.map((h) => `<option value="${h.id}">${h.label} の保存前</option>`).join('');
    } catch {
      select.innerHTML = '<option value="">履歴を取得できません</option>';
    }
  }

  // 以前のバージョンでブラウザに保存した編集内容があれば、読み込めるようにする
  function legacyEdits() {
    try {
      const data = JSON.parse(storage.get(legacyKey) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch { return {}; }
  }

  function importLegacy() {
    const data = legacyEdits();
    let count = 0;
    editables.forEach((el) => {
      const value = data[el.dataset.editId];
      if (typeof value === 'string' && value !== el.textContent) {
        const root = roots.includes(el) ? el : el.parentElement.closest('[data-editable-text]');
        if (!root) return;
        el.textContent = value;
        count += 1;
      }
    });
    $('.editor-legacy')?.remove();
    if (!editMode) setMode(true);
    refreshDirty();
    toast(count ? `ブラウザに保存されていた ${count}箇所の編集を読み込みました。「保存してHPに反映」を押すとファイルに書き込まれます。` : '読み込める編集はありませんでした。');
  }

  function setStatus(text) { const el = $('.editor-status'); if (el) el.textContent = text; }
  function toast(text, isError = false) {
    const old = $('.editor-toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = `editor-toast${isError ? ' is-error' : ''}`;
    el.dataset.editorSkip = 'true';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 7000 : 3200);
  }

  function help() {
    const old = $('.editor-help');
    if (old) { old.remove(); return; }
    const el = document.createElement('div');
    el.className = 'editor-help';
    el.dataset.editorSkip = 'true';
    el.innerHTML = `<h3>編集モードについて</h3>
      <p><strong>編集開始</strong>を押すと、ページ内の文字を直接書き換えられます。</p>
      <p><strong>保存してHPに反映</strong>を押すと、このページのHTMLファイルに直接書き込まれます。JSONの書き出しや手作業での反映は不要です。</p>
      <p>保存のたびに変更前の状態が <code>_backups/</code> に残り、<strong>変更履歴</strong>から復元できます。</p>
      ${articleMatch ? '<p>記事の章立て（見出しの追加・並べ替え・削除など）を変えたい場合は<strong>記事を構成ごと編集</strong>を使ってください。</p>' : ''}`;
    document.body.appendChild(el);
  }

  function showIntroDialog() {
    const old = $('.editor-intro-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'editor-intro-overlay';
    overlay.dataset.editorSkip = 'true';
    overlay.innerHTML = `
      <section class="editor-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="editorIntroTitle" data-editor-skip="true">
        <div class="editor-intro-dialog__head">
          <p class="editor-intro-dialog__eyebrow">編集機能の使い方</p>
          <h2 id="editorIntroTitle">ページの文字を直接変更し、そのままHPに反映できます</h2>
        </div>
        <div class="editor-intro-dialog__body">
          <ol>
            <li><strong>編集開始</strong>を押すと、ページ内の文字をその場で書き換えられます。</li>
            <li>変更したい見出し・本文・ボタン文字をクリックして、テキストを直接入力します。</li>
            <li><strong>保存してHPに反映</strong>を押すと、このページのHTMLファイルが更新されます。</li>
            <li><strong>変更履歴</strong>を選んで<strong>復元</strong>を押すと、過去の状態に戻せます。</li>
            ${articleMatch ? '<li>記事・コラムは<strong>記事を構成ごと編集</strong>から、章立て・見出し・段落の追加や並べ替えもできます。</li>' : ''}
          </ol>
          <p class="editor-intro-dialog__note">※編集用サーバー（<code>node server.js</code>）で開いているときだけ表示されます。公開サーバーにアップロードしたHTMLには編集ツールは表示されません。</p>
        </div>
        <div class="editor-intro-dialog__actions">
          <button type="button" class="editor-intro-close">閉じる</button>
          <button type="button" class="primary editor-intro-start">編集を開始する</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    storage.set(introKey, '1');
    const close = () => overlay.remove();
    $('.editor-intro-close', overlay).addEventListener('click', close);
    $('.editor-intro-start', overlay).addEventListener('click', () => { close(); setMode(true); });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(event) {
      if (event.key !== 'Escape') return;
      close();
      document.removeEventListener('keydown', onKey);
    });
  }

  function toolbar() {
    const bar = document.createElement('div');
    bar.className = 'editor-toolbar';
    bar.dataset.editorSkip = 'true';
    const articleLink = articleMatch ? `<a class="accent" href="/admin/editor/?path=${articleMatch[1]}/${articleMatch[2]}">記事を構成ごと編集</a>` : '<a href="/admin/editor/">記事エディタ</a>';
    const hasLegacy = Object.keys(legacyEdits()).length > 0;
    bar.innerHTML = `
      <strong>ページ編集</strong>
      <button type="button" class="editor-toggle">編集開始</button>
      <button type="button" class="primary editor-save" disabled>保存してHPに反映</button>
      <select class="editor-history" aria-label="変更履歴"><option value="">変更履歴</option></select>
      <button type="button" class="editor-restore">復元</button>
      <button type="button" class="editor-discard">変更を破棄</button>
      ${articleLink}
      ${hasLegacy ? '<button type="button" class="editor-legacy">ブラウザ保存分を読込</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="editor-help-btn">?</button>
      <span class="status editor-status">閲覧モード</span>
    `;
    document.body.appendChild(bar);
    $('.editor-toggle').addEventListener('click', () => setMode(!editMode));
    $('.editor-save').addEventListener('click', save);
    $('.editor-restore').addEventListener('click', restore);
    $('.editor-discard').addEventListener('click', discard);
    $('.editor-help-btn').addEventListener('click', help);
    $('.editor-legacy')?.addEventListener('click', importLegacy);
  }

  function bindEditing() {
    document.addEventListener('input', (e) => {
      if (e.target.closest && e.target.closest('[data-editable-text]')) refreshDirty();
    });
    // 編集中はリンクやボタンが反応しないようにする
    document.addEventListener('click', (e) => {
      if (!editMode) return;
      const el = e.target.closest && e.target.closest('[data-editable-text]');
      if (el) e.preventDefault();
    }, true);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      const el = e.target.closest && e.target.closest('[data-editable-text]');
      if (el && editMode && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    document.addEventListener('paste', (e) => {
      const el = e.target.closest && e.target.closest('[data-editable-text]');
      if (!el || !editMode) return;
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    window.addEventListener('beforeunload', (e) => {
      if (!changedRoots().length) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  async function init() {
    // 編集用サーバー（node server.js）で開いているときだけ編集ツールを出す
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) return;
    } catch {
      return;
    }
    css();
    scan();
    toolbar();
    bindEditing();
    refreshHistory();
    if (!storage.get(introKey)) showIntroDialog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
