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
  const pageKey = `${APP}:${location.pathname.replace(/\/$/, '') || '/'}`;
  const historyKey = `${pageKey}:history`;
  let editMode = false;
  let editables = [];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const nowLabel = () => new Date().toLocaleString('ja-JP', { hour12: false });
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
  const storageGet = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const storageSet = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  function css() {
    const style = document.createElement('style');
    style.dataset.editorSkip = 'true';
    style.textContent = `
      .editor-toolbar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:8px;align-items:center;max-width:min(94vw,980px);padding:10px 12px;background:rgba(6,26,46,.96);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;font-size:12px;line-height:1.2;backdrop-filter:blur(12px)}
      .editor-toolbar strong{color:#fff;font-size:12px;white-space:nowrap}.editor-toolbar button,.editor-toolbar select{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);color:#fff;border-radius:9px;padding:9px 10px;font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer}.editor-toolbar button:hover{background:rgba(255,255,255,.16)}.editor-toolbar .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-toolbar .danger{background:#7f1d1d;border-color:#991b1b}.editor-toolbar select{max-width:230px}.editor-toolbar option{color:#111}.editor-toolbar .status{color:rgba(255,255,255,.76);min-width:120px}.editor-toolbar .spacer{width:1px;height:24px;background:rgba(255,255,255,.2)}
      [data-editable-text]{outline-offset:3px;transition:outline-color .15s,background .15s}[data-editable-text].is-editing{outline:1px dashed rgba(245,158,11,.9);background:rgba(245,158,11,.09);cursor:text}[data-editable-text].is-edited{box-shadow:inset 0 -0.45em rgba(245,158,11,.16)}[data-editable-text]:focus{outline:2px solid #f59e0b!important;background:#fffbe8!important}

      .editor-intro-overlay{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;padding:20px;background:rgba(2,18,32,.62);backdrop-filter:blur(6px)}
      .editor-intro-dialog{width:min(620px,94vw);max-height:min(760px,92vh);overflow:auto;background:#fff;color:#172033;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.35);font:14px/1.8 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-intro-dialog__head{padding:22px 24px 16px;border-bottom:1px solid #eef0f4;background:linear-gradient(135deg,#f8fbff,#fff7e6)}.editor-intro-dialog__eyebrow{margin:0 0 6px;color:#044072;font-size:12px;font-weight:900;letter-spacing:.14em}.editor-intro-dialog h2{margin:0;color:#061a2e;font-size:22px;line-height:1.45}.editor-intro-dialog__body{padding:22px 24px}.editor-intro-dialog ol{margin:0 0 18px;padding-left:1.4em}.editor-intro-dialog li{margin:0 0 10px}.editor-intro-dialog strong{color:#044072}.editor-intro-dialog__note{margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#f8fafc;color:#475467;font-size:13px}.editor-intro-dialog__actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:16px 24px 22px;border-top:1px solid #eef0f4}.editor-intro-dialog button{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:999px;padding:10px 16px;font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer}.editor-intro-dialog button:hover{background:#f8fafc}.editor-intro-dialog .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-intro-dialog .primary:hover{background:#d97706;border-color:#d97706;color:#fff}
      .editor-toast{position:fixed;right:18px;top:18px;z-index:2147483001;background:#044072;color:#fff;padding:12px 14px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);font:700 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-help{position:fixed;right:18px;bottom:82px;z-index:2147482999;width:min(360px,92vw);padding:16px;background:#fff;color:#1a1a1a;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.18);font:13px/1.7 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-help h3{margin:0 0 8px;color:#044072;font-size:15px}.editor-help p{margin:0 0 8px}.editor-help code{background:#f3f4f6;padding:1px 5px;border-radius:4px}
      @media(max-width:760px){.editor-toolbar{left:10px;right:10px;bottom:10px;transform:none;display:grid;grid-template-columns:1fr 1fr;gap:7px}.editor-toolbar strong,.editor-toolbar .status,.editor-toolbar .spacer{display:none}.editor-toolbar button,.editor-toolbar select{width:100%;min-width:0}.editor-help{bottom:142px;right:10px}}
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
  }

  function applySaved() {
    const saved = storageGet(pageKey, {});
    editables.forEach((el) => {
      const value = saved[el.dataset.editId];
      if (typeof value === 'string' && value !== el.textContent) {
        el.textContent = value;
        el.classList.add('is-edited');
      }
    });
  }

  function collect() {
    const data = {};
    editables.forEach((el) => {
      const text = el.textContent;
      if (text !== el.dataset.originalText) data[el.dataset.editId] = text;
    });
    return data;
  }

  function setMode(on) {
    editMode = on;
    editables.forEach((el) => {
      el.contentEditable = on ? 'plaintext-only' : 'false';
      el.spellcheck = false;
      el.classList.toggle('is-editing', on);
    });
    $('.editor-toggle').textContent = on ? '\u7de8\u96c6\u7d42\u4e86' : '\u7de8\u96c6\u958b\u59cb';
    setStatus(on ? '\u6587\u5b57\u3092\u76f4\u63a5\u7de8\u96c6\u3067\u304d\u307e\u3059' : '\u95b2\u89a7\u30e2\u30fc\u30c9');
  }

  function save() {
    const data = collect();
    const history = storageGet(historyKey, []);
    history.unshift({ at: new Date().toISOString(), label: nowLabel(), data });
    storageSet(pageKey, data);
    storageSet(historyKey, history.slice(0, 80));
    editables.forEach(el => el.classList.toggle('is-edited', Object.prototype.hasOwnProperty.call(data, el.dataset.editId)));
    refreshHistory();
    toast('\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002\u5909\u66f4\u5c65\u6b74\u306b\u8ffd\u52a0\u3055\u308c\u3066\u3044\u307e\u3059\u3002');
    setStatus(`\u4fdd\u5b58\u6e08\u307f: ${Object.keys(data).length}\u7b87\u6240`);
  }

  function restore(index) {
    const history = storageGet(historyKey, []);
    const item = history[index];
    if (!item) return;
    storageSet(pageKey, item.data || {});
    editables.forEach((el) => {
      const value = item.data?.[el.dataset.editId];
      el.textContent = typeof value === 'string' ? value : el.dataset.originalText;
      el.classList.toggle('is-edited', typeof value === 'string');
    });
    toast(`${item.label} \u306e\u72b6\u614b\u3092\u5fa9\u5143\u3057\u307e\u3057\u305f\u3002`);
    setStatus('\u5c65\u6b74\u304b\u3089\u5fa9\u5143\u6e08\u307f');
  }

  function clearCurrent() {
    if (!confirm('\u3053\u306e\u30da\u30fc\u30b8\u306e\u73fe\u5728\u306e\u7de8\u96c6\u5185\u5bb9\u3092\u521d\u671f\u72b6\u614b\u306b\u623b\u3057\u307e\u3059\u3002\u5c65\u6b74\u306f\u6b8b\u308a\u307e\u3059\u3002\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f')) return;
    localStorage.removeItem(pageKey);
    editables.forEach((el) => { el.textContent = el.dataset.originalText; el.classList.remove('is-edited'); });
    toast('\u73fe\u5728\u306e\u7de8\u96c6\u5185\u5bb9\u3092\u30af\u30ea\u30a2\u3057\u307e\u3057\u305f\u3002');
    setStatus('\u521d\u671f\u72b6\u614b');
  }

  function exportJson() {
    const payload = { page: location.pathname, current: storageGet(pageKey, {}), history: storageGet(historyKey, []) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `page-edits-${location.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function refreshHistory() {
    const select = $('.editor-history');
    if (!select) return;
    const history = storageGet(historyKey, []);
    select.innerHTML = '<option value="">\u5c65\u6b74\u3092\u9078\u629e</option>' + history.map((h, i) => `<option value="${i}">${h.label} / ${Object.keys(h.data || {}).length}\u7b87\u6240</option>`).join('');
  }

  function setStatus(text) { const el = $('.editor-status'); if (el) el.textContent = text; }
  function toast(text) {
    const old = $('.editor-toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'editor-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function help() {
    const old = $('.editor-help');
    if (old) { old.remove(); return; }
    const el = document.createElement('div');
    el.className = 'editor-help';
    el.dataset.editorSkip = 'true';
    el.innerHTML = '<h3>\u7de8\u96c6\u30e2\u30fc\u30c9\u306b\u3064\u3044\u3066</h3><p><strong>\u7de8\u96c6\u958b\u59cb</strong>\u3092\u62bc\u3059\u3068\u3001\u30da\u30fc\u30b8\u5185\u306e\u6587\u5b57\u3060\u3051\u3092\u76f4\u63a5\u7de8\u96c6\u3067\u304d\u307e\u3059\u3002\u30ec\u30a4\u30a2\u30a6\u30c8\u3084HTML\u69cb\u9020\u306f\u305d\u306e\u307e\u307e\u3067\u3059\u3002</p><p><strong>\u4fdd\u5b58</strong>\u3059\u308b\u3068\u3001\u3053\u306e\u30da\u30fc\u30b8\u5c02\u7528\u306e\u5909\u66f4\u5185\u5bb9\u3068\u5c65\u6b74\u304c\u30d6\u30e9\u30a6\u30b6\u306b\u4fdd\u5b58\u3055\u308c\u307e\u3059\u3002</p><p>\u5c65\u6b74\u306f <code>localStorage</code> \u306b\u6b8b\u308a\u307e\u3059\u3002\u5225PC\u3078\u6e21\u3059\u5834\u5408\u306fJSON\u51fa\u529b\u3092\u4f7f\u3063\u3066\u304f\u3060\u3055\u3044\u3002</p>';
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
          <p class="editor-intro-dialog__eyebrow">\u7de8\u96c6\u6a5f\u80fd\u306e\u4f7f\u3044\u65b9</p>
          <h2 id="editorIntroTitle">\u30da\u30fc\u30b8\u306e\u6587\u5b57\u3092\u76f4\u63a5\u5909\u66f4\u3057\u3001\u4fdd\u5b58\u5c65\u6b74\u3092\u6b8b\u305b\u307e\u3059</h2>
        </div>
        <div class="editor-intro-dialog__body">
          <ol>
            <li><strong>\u7de8\u96c6\u958b\u59cb</strong>\u3092\u62bc\u3059\u3068\u3001\u30da\u30fc\u30b8\u5185\u306e\u6587\u5b57\u3092\u305d\u306e\u5834\u3067\u66f8\u304d\u63db\u3048\u3089\u308c\u307e\u3059\u3002</li>
            <li>\u5909\u66f4\u3057\u305f\u3044\u898b\u51fa\u3057\u30fb\u672c\u6587\u30fb\u30dc\u30bf\u30f3\u6587\u5b57\u3092\u30af\u30ea\u30c3\u30af\u3057\u3066\u3001\u30c6\u30ad\u30b9\u30c8\u3092\u76f4\u63a5\u5165\u529b\u3057\u307e\u3059\u3002</li>
            <li><strong>\u4fdd\u5b58</strong>\u3092\u62bc\u3059\u3068\u3001\u73fe\u5728\u306e\u5909\u66f4\u5185\u5bb9\u304c\u3053\u306e\u30da\u30fc\u30b8\u5c02\u7528\u306b\u4fdd\u5b58\u3055\u308c\u3001\u5909\u66f4\u5c65\u6b74\u306b\u8ffd\u52a0\u3055\u308c\u307e\u3059\u3002</li>
            <li><strong>\u5c65\u6b74\u3092\u9078\u629e</strong>\u3057\u3066<strong>\u5fa9\u5143</strong>\u3092\u62bc\u3059\u3068\u3001\u904e\u53bb\u306e\u4fdd\u5b58\u72b6\u614b\u306b\u623b\u305b\u307e\u3059\u3002</li>
            <li><strong>JSON\u51fa\u529b</strong>\u3067\u3001\u4ed6\u306ePC\u3084\u7d0d\u54c1\u7528\u306b\u5909\u66f4\u30c7\u30fc\u30bf\u3092\u66f8\u304d\u51fa\u305b\u307e\u3059\u3002</li>
          </ol>
          <p class="editor-intro-dialog__note">\u203b\u4fdd\u5b58\u5148\u306f\u73fe\u5728\u306e\u30d6\u30e9\u30a6\u30b6\u306e localStorage \u3067\u3059\u3002HTML\u30d5\u30a1\u30a4\u30eb\u81ea\u4f53\u306f\u66f8\u304d\u63db\u3048\u307e\u305b\u3093\u3002</p>
        </div>
        <div class="editor-intro-dialog__actions">
          <button type="button" class="editor-intro-close">\u9589\u3058\u308b</button>
          <button type="button" class="primary editor-intro-start">\u7de8\u96c6\u3092\u958b\u59cb\u3059\u308b</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
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
    bar.innerHTML = `
      <strong>\u30da\u30fc\u30b8\u6587\u5b57\u7de8\u96c6</strong>
      <button type="button" class="editor-toggle">\u7de8\u96c6\u958b\u59cb</button>
      <button type="button" class="primary editor-save">\u4fdd\u5b58</button>
      <select class="editor-history" aria-label="\u5909\u66f4\u5c65\u6b74"></select>
      <button type="button" class="editor-restore">\u5fa9\u5143</button>
      <button type="button" class="editor-export">JSON\u51fa\u529b</button>
      <button type="button" class="danger editor-clear">\u521d\u671f\u5316</button>
      <span class="spacer"></span>
      <button type="button" class="editor-help-btn">?</button>
      <span class="status editor-status">\u95b2\u89a7\u30e2\u30fc\u30c9</span>
    `;
    document.body.appendChild(bar);
    $('.editor-toggle').addEventListener('click', () => setMode(!editMode));
    $('.editor-save').addEventListener('click', save);
    $('.editor-restore').addEventListener('click', () => {
      const v = $('.editor-history').value;
      if (v !== '') restore(Number(v));
    });
    $('.editor-export').addEventListener('click', exportJson);
    $('.editor-clear').addEventListener('click', clearCurrent);
    $('.editor-help-btn').addEventListener('click', help);
    refreshHistory();
  }

  function init() {
    css();
    scan();
    applySaved();
    toolbar();
    showIntroDialog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
