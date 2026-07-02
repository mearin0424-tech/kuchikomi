/* ページ内編集機能（テキスト + 画像）
 * - 「プレビュー / 編集」をワンクリックで切替。プレビューは訪問者と同じ見た目
 * - 編集モード: テキスト直接編集、画像クリックで差し替え、段落ホバーで画像挿入
 * - 「変更内容」で編集の記録を一覧表示。AI指示用レポート/JSONとしてコピー・出力可能
 * - 保存先はブラウザの localStorage（ページ単位）。履歴・復元対応
 */
(() => {
  const APP = 'kcc-page-editor';
  const TEXT_SELECTOR = [
    'h1','h2','h3','h4','h5','h6','p','li','dt','dd','blockquote','figcaption',
    'a','button','label','span','strong','em','small','th','td','caption','summary',
    '.banner__title','.banner__sub','.banner__cta','.strength__title','.strength__sub'
  ].join(',');
  const SKIP_SELECTOR = [
    'script','style','noscript','svg','path','iframe','canvas','video','audio',
    '.editor-toolbar','.editor-history-panel','.editor-toast','.editor-intro-overlay',
    '.editor-intro-dialog','.editor-img-dialog','.editor-changes-overlay','.editor-insert-chip','.editor-fab','[data-editor-skip]'
  ].join(',');
  // 編集可能な画像: img と プレースホルダsvg（装飾アイコンsvgは role なしのため除外される）
  const IMG_SELECTOR = 'img, svg[role="img"]';
  // 画像スキャン用スキップ（SKIP_SELECTORは'svg'を含むため流用不可）
  const IMG_SKIP_SELECTOR = '.editor-toolbar,.editor-intro-overlay,.editor-img-dialog__overlay,.editor-changes-overlay,.editor-insert-chip,.editor-fab,[data-editor-skip]';
  const INSERT_TARGET = /^(P|H1|H2|H3|H4|H5|H6|BLOCKQUOTE)$/;

  const pageKey = `${APP}:${location.pathname.replace(/\/$/, '') || '/'}`;
  const historyKey = `${pageKey}:history`;
  const imagesKey = `${pageKey}:images`;
  const insertsKey = `${pageKey}:inserts`;
  const introSeenKey = `${APP}:intro-seen`;      // サイト共通: 説明ダイアログは初回のみ
  const toolbarOpenKey = `${APP}:toolbar-open`;  // サイト共通: ツールバー展開状態を記憶

  let editMode = false;
  let showingOriginal = false;   // 「変更前を表示」中か
  let originalViewSnap = null;   // 変更前表示に入る前の作業状態（テキスト）
  let editables = [];
  const textOriginals = new Map();   // editId -> 初期innerHTML
  const imgOriginals = new Map();    // imgId  -> 初期outerHTML（data属性なし）
  let imgState = {};                 // imgId  -> {src?, alt?} 差し替え内容（未保存分含む作業状態）
  let insState = [];                 // [{id, afterId, src, alt}] 挿入画像

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const nowLabel = () => new Date().toLocaleString('ja-JP', { hour12: false });
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const storageGet = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const storageSet = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (err) {
      alert('保存容量の上限に達しました。画像のサイズを小さくするか、URL指定をご利用ください。');
      return false;
    }
  };

  const hasReadableText = (el) => {
    if (!el || el.closest(SKIP_SELECTOR)) return false;
    if (el.children.length > 4) return false;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 1200) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  };

  function sanitizeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script').forEach((el) => el.remove());
    tpl.content.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && attr.value.trim().toLowerCase().startsWith('javascript:')) el.removeAttribute(attr.name);
      });
    });
    return tpl.innerHTML;
  }

  const htmlToText = (html) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    return (tpl.content.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const truncate = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

  /* ---------------- スタイル ---------------- */
  function css() {
    const style = document.createElement('style');
    style.dataset.editorSkip = 'true';
    style.textContent = `
      .editor-toolbar{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:8px;align-items:center;max-width:min(96vw,1080px);padding:10px 12px;background:rgba(6,26,46,.96);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.22);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;font-size:12px;line-height:1.2;backdrop-filter:blur(12px)}
      .editor-toolbar strong{color:#fff;font-size:12px;white-space:nowrap}
      .editor-toolbar button,.editor-toolbar select{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);color:#fff;border-radius:9px;padding:9px 10px;font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer;white-space:nowrap}
      .editor-toolbar button:hover{background:rgba(255,255,255,.16)}
      .editor-toolbar .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-toolbar .primary:hover{background:#fbbf24}
      .editor-toolbar .danger{background:#7f1d1d;border-color:#991b1b}
      .editor-toolbar select{max-width:190px}.editor-toolbar option{color:#111}
      .editor-toolbar .status{color:rgba(255,255,255,.76);min-width:110px}
      .editor-toolbar .spacer{width:1px;height:24px;background:rgba(255,255,255,.2)}
      .editor-seg{display:inline-flex;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:3px;gap:2px}
      .editor-seg button{border:0!important;background:transparent!important;border-radius:7px!important;padding:7px 12px!important}
      .editor-seg button.is-active{background:#f59e0b!important;color:#061a2e!important}
      .editor-orig.is-on{background:#0ea5e9;border-color:#0ea5e9;color:#04233a}

      [data-editable-text]{outline-offset:3px;transition:outline-color .15s,background .15s}[data-editable-text].is-editing{outline:1px dashed rgba(245,158,11,.9);background:rgba(245,158,11,.09);cursor:text}[data-editable-text].is-edited{box-shadow:inset 0 -0.45em rgba(245,158,11,.16)}[data-editable-text]:focus{outline:2px solid #f59e0b!important;background:#fffbe8!important}
      .is-editing-img{outline:2px dashed rgba(4,64,114,.8)!important;outline-offset:2px;cursor:pointer!important}
      .is-editing-img:hover{outline-color:#f59e0b!important}

      .editor-intro-overlay{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;padding:20px;background:rgba(2,18,32,.62);backdrop-filter:blur(6px)}
      .editor-intro-dialog{width:min(640px,94vw);max-height:min(760px,92vh);overflow:auto;background:#fff;color:#172033;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.35);font:14px/1.8 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}.editor-intro-dialog__head{padding:22px 24px 16px;border-bottom:1px solid #eef0f4;background:linear-gradient(135deg,#f8fbff,#fff7e6)}.editor-intro-dialog__eyebrow{margin:0 0 6px;color:#044072;font-size:12px;font-weight:900;letter-spacing:.14em}.editor-intro-dialog h2{margin:0;color:#061a2e;font-size:21px;line-height:1.45}.editor-intro-dialog__body{padding:22px 24px}.editor-intro-dialog ol{margin:0 0 18px;padding-left:1.4em}.editor-intro-dialog li{margin:0 0 10px}.editor-intro-dialog strong{color:#044072}.editor-intro-dialog__note{margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#f8fafc;color:#475467;font-size:13px}.editor-intro-dialog__actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:16px 24px 22px;border-top:1px solid #eef0f4}.editor-intro-dialog button{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:999px;padding:10px 16px;font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer}.editor-intro-dialog button:hover{background:#f8fafc}.editor-intro-dialog .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-intro-dialog .primary:hover{background:#d97706;border-color:#d97706;color:#fff}
      .editor-toast{position:fixed;right:18px;top:18px;z-index:2147483005;background:#044072;color:#fff;padding:12px 14px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);font:700 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}

      .editor-img-dialog__overlay{position:fixed;inset:0;z-index:2147483003;display:grid;place-items:center;padding:20px;background:rgba(2,18,32,.55);backdrop-filter:blur(4px)}
      .editor-img-dialog{width:min(480px,94vw);max-height:92vh;overflow:auto;background:#fff;color:#172033;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.35);font:13px/1.7 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}
      .editor-img-dialog__head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eef0f4;font-weight:900;color:#044072;font-size:14px}
      .editor-img-dialog__close{appearance:none;border:0;background:rgba(0,0,0,.06);width:30px;height:30px;border-radius:999px;font-size:16px;cursor:pointer;color:#374151}
      .editor-img-dialog__close:hover{background:rgba(0,0,0,.12)}
      .editor-img-dialog__body{padding:16px 18px}
      .editor-img-dialog__drop{position:relative;display:grid;place-items:center;min-height:150px;max-height:240px;overflow:hidden;background:repeating-conic-gradient(#f1f3f7 0 25%,#fff 0 50%) 0 0/18px 18px;border:2px dashed #cbd5e1;border-radius:12px;margin-bottom:6px;cursor:pointer;transition:border-color .15s,background-color .15s}
      .editor-img-dialog__drop:hover,.editor-img-dialog__drop.is-over{border-color:#f59e0b}
      .editor-img-dialog__drop [data-preview]{display:contents}
      .editor-img-dialog__drop img{max-width:100%;max-height:230px;object-fit:contain}
      .editor-img-dialog__drop svg{width:100%;height:100%;min-height:150px;max-height:230px}
      .editor-img-dialog__drop-empty{color:#98a2b3;font-size:12px;text-align:center;padding:12px}
      .editor-img-dialog__drop-hint{margin:0 0 14px;color:#667085;font-size:11.5px;text-align:center}
      .editor-img-dialog__row{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
      .editor-img-dialog__row input[type=text]{flex:1;min-width:160px;border:1px solid #d3d9e2;border-radius:8px;padding:9px 10px;font:500 13px/1.4 inherit}
      .editor-img-dialog__row input[type=text]:focus{outline:2px solid #f59e0b;outline-offset:1px}
      .editor-img-dialog__label{font-weight:800;color:#044072;font-size:12px;margin:12px 0 6px}
      .editor-img-dialog button{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:9px;padding:9px 13px;font:800 12.5px/1 inherit;cursor:pointer}
      .editor-img-dialog button:hover{background:#f8fafc}
      .editor-img-dialog .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-img-dialog .primary:hover{background:#d97706;color:#fff}
      .editor-img-dialog .danger{background:#fff;border-color:#f3caca;color:#bb0000}.editor-img-dialog .danger:hover{background:#fdf2f2}
      .editor-img-dialog__foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 18px 16px;border-top:1px solid #eef0f4}

      .editor-changes-overlay{position:fixed;inset:0;z-index:2147483004;display:grid;place-items:center;padding:20px;background:rgba(2,18,32,.6);backdrop-filter:blur(5px)}
      .editor-changes{width:min(760px,95vw);max-height:92vh;display:flex;flex-direction:column;background:#fff;color:#172033;border-radius:16px;box-shadow:0 24px 90px rgba(0,0,0,.4);font:13px/1.7 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif}
      .editor-changes__head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef0f4}
      .editor-changes__head h2{margin:0;font-size:16px;color:#044072}
      .editor-changes__head .sub{color:#667085;font-size:11.5px;margin-top:2px}
      .editor-changes__body{overflow:auto;padding:14px 20px;flex:1}
      .editor-changes__section{margin:0 0 18px}
      .editor-changes__section h3{margin:0 0 8px;font-size:13px;color:#044072;border-left:4px solid #f59e0b;padding-left:8px}
      .editor-changes__empty{color:#98a2b3;font-size:12.5px;padding:6px 0}
      .editor-change{border:1px solid #eef0f4;border-radius:10px;padding:10px 12px;margin-bottom:8px}
      .editor-change__loc{font-size:11px;color:#667085;margin-bottom:6px}
      .editor-change__loc code{background:#f3f4f6;border-radius:4px;padding:1px 6px;font-size:10.5px}
      .editor-change__badge{display:inline-block;font-size:10px;font-weight:900;border-radius:4px;padding:2px 6px;margin-left:6px;vertical-align:1px}
      .editor-change__badge.is-saved{background:#e7f6ec;color:#137a3d}
      .editor-change__badge.is-unsaved{background:#feefe0;color:#b45309}
      .editor-change__before{background:#fdf2f2;border-radius:6px;padding:6px 9px;margin-bottom:4px;color:#7a1d1d;text-decoration:line-through;text-decoration-color:rgba(122,29,29,.4)}
      .editor-change__after{background:#effaf3;border-radius:6px;padding:6px 9px;color:#14532d}
      .editor-change__img{display:flex;gap:10px;align-items:center}
      .editor-change__thumb{width:74px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;flex:none;background:#f8fafc}
      .editor-changes__foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 20px 16px;border-top:1px solid #eef0f4}
      .editor-changes__foot button{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:999px;padding:10px 15px;font:800 12.5px/1 inherit;cursor:pointer}
      .editor-changes__foot button:hover{background:#f8fafc}
      .editor-changes__foot .primary{background:#f59e0b;border-color:#f59e0b;color:#061a2e}.editor-changes__foot .primary:hover{background:#d97706;color:#fff}

      .editor-insert-chip{position:absolute;z-index:2147482998;display:none;align-items:center;gap:5px;padding:7px 12px;border:1px solid rgba(4,64,114,.35);border-radius:999px;background:#fff;color:#044072;font:800 11.5px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.18);cursor:pointer}
      .editor-insert-chip:hover{background:#044072;color:#fff}

      .editor-toolbar.is-collapsed{display:none}
      .editor-fab{position:fixed;left:18px;bottom:74px;z-index:2147483000;display:none;align-items:center;gap:7px;padding:11px 16px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(6,26,46,.94);color:#fff;box-shadow:0 12px 34px rgba(0,0,0,.24);font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;cursor:pointer;backdrop-filter:blur(10px)}
      .editor-fab:hover{background:rgba(4,64,114,.96)}.editor-fab.is-visible{display:inline-flex}
      @media(max-width:760px){.editor-toolbar{left:10px;right:10px;bottom:84px;transform:none;display:grid;grid-template-columns:1fr 1fr;gap:7px}.editor-toolbar.is-collapsed{display:none}.editor-toolbar strong,.editor-toolbar .status,.editor-toolbar .spacer{display:none}.editor-toolbar button,.editor-toolbar select{width:100%;min-width:0}.editor-seg{grid-column:1/-1;display:flex}.editor-seg button{flex:1}.editor-fab{left:10px;bottom:84px}}
    `;
    document.head.appendChild(style);
  }

  /* ---------------- スキャン ---------------- */
  function scan() {
    let idx = 0;
    // 画像(img/プレースホルダsvg)を含む要素はテキスト編集対象外にする。
    // 内側の文字要素が個別に編集対象になり、画像差し替えとテキスト編集が干渉しない。
    const candidates = $$(TEXT_SELECTOR).filter(hasReadableText)
      .filter((el) => !el.querySelector(IMG_SELECTOR));
    const candSet = new Set(candidates);
    // 入れ子は最外殻のみ編集対象（内部のタグ構造を壊さないため innerHTML 単位で扱う）
    editables = candidates.filter((el) => {
      let p = el.parentElement;
      while (p) { if (candSet.has(p)) return false; p = p.parentElement; }
      return true;
    }).map((el) => {
      const id = el.dataset.editId || `t${idx++}`;
      el.dataset.editId = id;
      el.dataset.editableText = 'true';
      textOriginals.set(id, el.innerHTML);
      return el;
    });
  }

  function scanImages() {
    let idx = 0;
    $$(IMG_SELECTOR).forEach((el) => {
      if (el.closest(IMG_SKIP_SELECTOR)) return;
      if (el.closest('.site-logo')) return;  // ロゴはページ単位差し替え対象外
      const id = `i${idx++}`;
      imgOriginals.set(id, el.outerHTML);
      el.setAttribute('data-img-id', id);
    });
  }

  /* ---------------- 適用 ---------------- */
  function applySavedText() {
    const saved = storageGet(pageKey, {});
    editables.forEach((el) => {
      const value = saved[el.dataset.editId];
      if (typeof value !== 'string') return;
      if (value.includes('<')) el.innerHTML = sanitizeHtml(value);
      else el.textContent = value;
      el.classList.add('is-edited');
    });
  }

  function applyImage(id) {
    let cur = document.querySelector(`[data-img-id="${id}"]`);
    const origHtml = imgOriginals.get(id);
    if (!cur || !origHtml) return;
    // いったん元の要素に戻す
    const tpl = document.createElement('template');
    tpl.innerHTML = origHtml;
    let node = tpl.content.firstElementChild;
    node.setAttribute('data-img-id', id);
    cur.replaceWith(node);
    const entry = showingOriginal ? null : imgState[id];
    if (entry && (entry.src || entry.alt != null)) {
      if (node.tagName.toLowerCase() === 'img') {
        if (entry.src) node.src = entry.src;
        if (entry.alt != null) node.alt = entry.alt;
      } else if (entry.src) {
        // プレースホルダsvg → img に差し替え（枠いっぱいに表示）
        const img = document.createElement('img');
        img.setAttribute('data-img-id', id);
        img.src = entry.src;
        img.alt = entry.alt || '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        node.replaceWith(img);
        node = img;
      }
    }
    node.classList.toggle('is-editing-img', editMode);
  }

  function applyAllImages() { imgOriginals.forEach((_, id) => applyImage(id)); }

  function applyInserts() {
    $$('[data-inserted-id]').forEach((el) => el.remove());
    if (showingOriginal) return;
    insState.forEach((ins) => {
      const anchor = document.querySelector(`[data-edit-id="${ins.afterId}"]`);
      if (!anchor || !ins.src) return;
      const img = document.createElement('img');
      img.setAttribute('data-inserted-id', ins.id);
      img.src = ins.src;
      img.alt = ins.alt || '';
      img.style.cssText = 'max-width:100%;height:auto;display:block;margin:18px auto;border-radius:10px;';
      img.classList.toggle('is-editing-img', editMode);
      anchor.insertAdjacentElement('afterend', img);
    });
  }

  /* ---------------- 収集・保存 ---------------- */
  function collectText() {
    const data = {};
    editables.forEach((el) => {
      const id = el.dataset.editId;
      const html = el.innerHTML;
      if (html !== textOriginals.get(id)) data[id] = html;
    });
    return data;
  }

  function unsavedCount() {
    const savedText = storageGet(pageKey, {});
    let n = 0;
    editables.forEach((el) => {
      const id = el.dataset.editId;
      const base = typeof savedText[id] === 'string' ? savedText[id] : textOriginals.get(id);
      if (el.innerHTML !== base && el.textContent !== base) n++;
    });
    if (JSON.stringify(imgState) !== JSON.stringify(storageGet(imagesKey, {}))) n++;
    if (JSON.stringify(insState) !== JSON.stringify(storageGet(insertsKey, []))) n++;
    return n;
  }

  function refreshStatus() {
    if (showingOriginal) { setStatus('変更前（元の状態）を表示中'); return; }
    const n = unsavedCount();
    if (editMode) {
      setStatus(n > 0 ? `未保存の変更 ${n}箇所（Ctrl+Sで保存）` : 'テキスト編集・画像クリックで差し替え');
    } else {
      setStatus(n > 0 ? `プレビュー中（未保存 ${n}箇所）` : 'プレビュー中');
    }
  }

  function setMode(on) {
    if (on && showingOriginal) setOriginalView(false);
    editMode = on;
    editables.forEach((el) => {
      el.contentEditable = on ? 'plaintext-only' : 'false';
      el.spellcheck = false;
      el.classList.toggle('is-editing', on);
    });
    $$('[data-img-id], [data-inserted-id]').forEach((el) => el.classList.toggle('is-editing-img', on));
    const chip = $('.editor-insert-chip');
    if (chip && !on) chip.style.display = 'none';
    const segPreview = $('.editor-mode-preview');
    const segEdit = $('.editor-mode-edit');
    if (segPreview) segPreview.classList.toggle('is-active', !on);
    if (segEdit) segEdit.classList.toggle('is-active', on);
    if (on) setToolbarOpen(true);
    refreshStatus();
  }

  /* ---------------- 変更前を表示（オリジナル表示） ---------------- */
  function setOriginalView(on) {
    if (on === showingOriginal) return;
    if (on) {
      if (editMode) setMode(false);
      // 現在の作業状態（テキスト）を退避してから元に戻す
      originalViewSnap = {};
      editables.forEach((el) => { originalViewSnap[el.dataset.editId] = el.innerHTML; });
      showingOriginal = true;
      editables.forEach((el) => {
        const html = textOriginals.get(el.dataset.editId);
        if (html.includes('<')) el.innerHTML = html; else el.textContent = html;
      });
      applyAllImages();
      applyInserts();
    } else {
      showingOriginal = false;
      if (originalViewSnap) {
        editables.forEach((el) => {
          const html = originalViewSnap[el.dataset.editId];
          if (typeof html !== 'string') return;
          if (html.includes('<')) el.innerHTML = sanitizeHtml(html); else el.textContent = html;
        });
        originalViewSnap = null;
      }
      applyAllImages();
      applyInserts();
    }
    const btn = $('.editor-orig');
    if (btn) {
      btn.classList.toggle('is-on', showingOriginal);
      btn.textContent = showingOriginal ? '変更後を表示' : '変更前を表示';
    }
    refreshStatus();
  }

  function save() {
    if (showingOriginal) setOriginalView(false);
    const data = collectText();
    const history = storageGet(historyKey, []);
    history.unshift({ at: new Date().toISOString(), label: nowLabel(), data, images: imgState, inserts: insState });
    const ok = storageSet(pageKey, data) &&
               storageSet(imagesKey, imgState) &&
               storageSet(insertsKey, insState) &&
               storageSet(historyKey, history.slice(0, 50));
    if (!ok) return;
    editables.forEach((el) => el.classList.toggle('is-edited', Object.prototype.hasOwnProperty.call(data, el.dataset.editId)));
    refreshHistory();
    const total = Object.keys(data).length + Object.keys(imgState).length + insState.length;
    toast(`保存しました（${total}箇所）。変更履歴に追加されています。`);
    refreshStatus();
  }

  function restore(index) {
    if (showingOriginal) setOriginalView(false);
    const history = storageGet(historyKey, []);
    const item = history[index];
    if (!item) return;
    storageSet(pageKey, item.data || {});
    storageSet(imagesKey, item.images || {});
    storageSet(insertsKey, item.inserts || []);
    // テキスト
    editables.forEach((el) => {
      const id = el.dataset.editId;
      const value = item.data ? item.data[id] : undefined;
      const html = typeof value === 'string' ? value : textOriginals.get(id);
      if (html.includes('<')) el.innerHTML = sanitizeHtml(html);
      else el.textContent = html;
      el.classList.toggle('is-edited', typeof value === 'string');
    });
    // 画像
    imgState = item.images || {};
    insState = item.inserts || [];
    applyAllImages();
    applyInserts();
    toast(`${item.label} の状態を復元しました。`);
    refreshStatus();
  }

  function clearCurrent() {
    if (!confirm('このページの現在の編集内容（テキスト・画像）を初期状態に戻します。履歴は残ります。よろしいですか？')) return;
    if (showingOriginal) setOriginalView(false);
    localStorage.removeItem(pageKey);
    localStorage.removeItem(imagesKey);
    localStorage.removeItem(insertsKey);
    editables.forEach((el) => {
      const html = textOriginals.get(el.dataset.editId);
      if (html.includes('<')) el.innerHTML = html; else el.textContent = html;
      el.classList.remove('is-edited');
    });
    imgState = {};
    insState = [];
    applyAllImages();
    applyInserts();
    if (editMode) setMode(true);
    toast('現在の編集内容をクリアしました。');
    refreshStatus();
  }

  /* ---------------- 変更内容の記録・レポート ---------------- */
  function describeOriginalImage(id) {
    const html = imgOriginals.get(id) || '';
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const el = tpl.content.firstElementChild;
    if (!el) return '(不明)';
    if (el.tagName.toLowerCase() === 'img') return `画像 ${el.getAttribute('src') || ''}`;
    return `プレースホルダ「${el.getAttribute('aria-label') || '画像'}」`;
  }

  const describeSrc = (src) => (String(src || '').startsWith('data:') ? '[アップロード画像（ブラウザ内保存）]' : src);

  function buildChangeData() {
    const savedText = storageGet(pageKey, {});
    const texts = [];
    editables.forEach((el) => {
      const id = el.dataset.editId;
      const cur = el.innerHTML;
      const orig = textOriginals.get(id);
      if (cur === orig) return;
      texts.push({
        id,
        tag: el.tagName.toLowerCase(),
        before: htmlToText(orig),
        after: htmlToText(cur),
        beforeHtml: orig,
        afterHtml: cur,
        saved: savedText[id] === cur,
      });
    });
    const savedImages = storageGet(imagesKey, {});
    const images = Object.entries(imgState).map(([id, entry]) => ({
      id,
      original: describeOriginalImage(id),
      src: entry.src || '',
      alt: entry.alt || '',
      saved: JSON.stringify(savedImages[id]) === JSON.stringify(entry),
    }));
    const savedInserts = storageGet(insertsKey, []);
    const inserts = insState.map((ins) => {
      const anchor = document.querySelector(`[data-edit-id="${ins.afterId}"]`);
      return {
        id: ins.id,
        anchorText: anchor ? truncate(htmlToText(anchor.innerHTML), 40) : `(要素 ${ins.afterId})`,
        src: ins.src,
        alt: ins.alt || '',
        saved: savedInserts.some((x) => JSON.stringify(x) === JSON.stringify(ins)),
      };
    });
    return { texts, images, inserts };
  }

  function buildMarkdownReport() {
    const { texts, images, inserts } = buildChangeData();
    const n = unsavedCount();
    const lines = [];
    lines.push('# HP編集内容レポート');
    lines.push('');
    lines.push(`- ページ: ${location.pathname}`);
    lines.push(`- 出力日時: ${nowLabel()}`);
    lines.push(`- 保存状態: ${n > 0 ? `未保存の変更 ${n}箇所あり` : 'すべて保存済み'}`);
    lines.push('');
    lines.push(`## テキスト変更（${texts.length}件）`);
    if (!texts.length) lines.push('（なし）');
    texts.forEach((t, i) => {
      lines.push('');
      lines.push(`### ${i + 1}. <${t.tag}> 要素${t.saved ? '' : '（未保存）'}`);
      lines.push(`- 変更前: ${t.before}`);
      lines.push(`- 変更後: ${t.after}`);
    });
    lines.push('');
    lines.push(`## 画像の差し替え（${images.length}件）`);
    if (!images.length) lines.push('（なし）');
    images.forEach((m, i) => {
      lines.push('');
      lines.push(`### ${i + 1}. ${m.original}${m.saved ? '' : '（未保存）'}`);
      if (m.src) lines.push(`- 新しい画像: ${describeSrc(m.src)}`);
      if (m.alt) lines.push(`- altテキスト: ${m.alt}`);
    });
    lines.push('');
    lines.push(`## 挿入した画像（${inserts.length}件）`);
    if (!inserts.length) lines.push('（なし）');
    inserts.forEach((s, i) => {
      lines.push('');
      lines.push(`### ${i + 1}. 「${s.anchorText}」の直後に挿入${s.saved ? '' : '（未保存）'}`);
      lines.push(`- 画像: ${describeSrc(s.src)}`);
      if (s.alt) lines.push(`- altテキスト: ${s.alt}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('※このレポートを元に、該当ページのHTML/生成スクリプトへ変更を反映してください。');
    return lines.join('\n');
  }

  function exportPayload() {
    return {
      page: location.pathname,
      exportedAt: new Date().toISOString(),
      current: storageGet(pageKey, {}),
      images: storageGet(imagesKey, {}),
      inserts: storageGet(insertsKey, []),
      working: { text: collectText(), images: imgState, inserts: insState },
      history: storageGet(historyKey, []),
    };
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `page-edits-${location.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // コピー失敗時はテキストを表示して手動コピーできるようにする
  function showCopyFallback(text, title) {
    const old = $('.editor-copy-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'editor-img-dialog__overlay editor-copy-overlay';
    overlay.dataset.editorSkip = 'true';
    overlay.innerHTML = `
      <div class="editor-img-dialog" role="dialog" aria-modal="true" style="width:min(640px,94vw)">
        <div class="editor-img-dialog__head">
          <span>${esc(title || '内容を手動でコピーしてください')}</span>
          <button type="button" class="editor-img-dialog__close" data-act="close" aria-label="閉じる">×</button>
        </div>
        <div class="editor-img-dialog__body">
          <textarea readonly style="width:100%;box-sizing:border-box;height:min(50vh,380px);font:12px/1.6 Consolas,Menlo,monospace;border:1px solid #d3d9e2;border-radius:8px;padding:10px"></textarea>
          <p class="editor-img-dialog__drop-hint" style="text-align:left;margin-top:8px">自動コピーができない環境のため表示しています。全選択済みなので Ctrl+C でコピーできます。</p>
        </div>
        <div class="editor-img-dialog__foot">
          <button type="button" data-act="close">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const ta = overlay.querySelector('textarea');
    ta.value = text;
    ta.focus();
    ta.select();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-act="close"]')) overlay.remove();
    });
  }

  function copyText(text, title) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      if (ok) toast('コピーしました');
      else showCopyFallback(text, title);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast('コピーしました'), fallback);
    } else fallback();
  }

  function closeChangesDialog() {
    const el = $('.editor-changes-overlay');
    if (el) el.remove();
  }

  function openChangesDialog() {
    closeChangesDialog();
    const { texts, images, inserts } = buildChangeData();
    const n = unsavedCount();
    const badge = (saved) => `<span class="editor-change__badge ${saved ? 'is-saved' : 'is-unsaved'}">${saved ? '保存済み' : '未保存'}</span>`;
    const textRows = texts.map((t) => `
      <div class="editor-change">
        <div class="editor-change__loc"><code>&lt;${esc(t.tag)}&gt;</code>${badge(t.saved)}</div>
        <div class="editor-change__before">${esc(truncate(t.before, 160))}</div>
        <div class="editor-change__after">${esc(truncate(t.after, 160))}</div>
      </div>`).join('');
    const imageRows = images.map((m) => `
      <div class="editor-change">
        <div class="editor-change__loc">${esc(m.original)}${badge(m.saved)}</div>
        <div class="editor-change__img">
          ${m.src ? `<img class="editor-change__thumb" src="${esc(m.src)}" alt="">` : ''}
          <div>
            <div>新しい画像: ${esc(truncate(describeSrc(m.src), 90))}</div>
            ${m.alt ? `<div>alt: ${esc(m.alt)}</div>` : ''}
          </div>
        </div>
      </div>`).join('');
    const insertRows = inserts.map((s) => `
      <div class="editor-change">
        <div class="editor-change__loc">「${esc(s.anchorText)}」の直後${badge(s.saved)}</div>
        <div class="editor-change__img">
          <img class="editor-change__thumb" src="${esc(s.src)}" alt="">
          <div>
            <div>画像: ${esc(truncate(describeSrc(s.src), 90))}</div>
            ${s.alt ? `<div>alt: ${esc(s.alt)}</div>` : ''}
          </div>
        </div>
      </div>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'editor-changes-overlay';
    overlay.dataset.editorSkip = 'true';
    overlay.innerHTML = `
      <div class="editor-changes" role="dialog" aria-modal="true">
        <div class="editor-changes__head">
          <div>
            <h2>このページの変更内容</h2>
            <div class="sub">${esc(location.pathname)}｜${n > 0 ? `未保存の変更 ${n}箇所あり` : 'すべて保存済み'}</div>
          </div>
          <button type="button" class="editor-img-dialog__close" data-act="close" aria-label="閉じる">×</button>
        </div>
        <div class="editor-changes__body">
          <div class="editor-changes__section">
            <h3>テキスト変更（${texts.length}件）</h3>
            ${textRows || '<div class="editor-changes__empty">変更はありません</div>'}
          </div>
          <div class="editor-changes__section">
            <h3>画像の差し替え（${images.length}件）</h3>
            ${imageRows || '<div class="editor-changes__empty">変更はありません</div>'}
          </div>
          <div class="editor-changes__section">
            <h3>挿入した画像（${inserts.length}件）</h3>
            ${insertRows || '<div class="editor-changes__empty">変更はありません</div>'}
          </div>
        </div>
        <div class="editor-changes__foot">
          <button type="button" class="primary" data-act="copy-md">レポートをコピー（AI指示用）</button>
          <button type="button" data-act="copy-json">JSONをコピー</button>
          <button type="button" data-act="download-json">JSONファイル出力</button>
          <button type="button" data-act="close">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) { closeChangesDialog(); return; }
      const btn = event.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') closeChangesDialog();
      else if (act === 'copy-md') copyText(buildMarkdownReport(), 'AI指示用レポート');
      else if (act === 'copy-json') copyText(JSON.stringify(exportPayload(), null, 2), '編集データ（JSON）');
      else if (act === 'download-json') exportJson();
    });
  }

  /* ---------------- 画像ダイアログ ---------------- */
  // 画像ファイル → data URL（大きい画像は自動で縮小）
  function fileToDataUrl(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const keepAsIs = scale === 1 && file.size < 400 * 1024;
        if (keepAsIs) { cb(reader.result); return; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        cb(canvas.toDataURL(type, 0.85));
      };
      img.onerror = () => alert('画像を読み込めませんでした。');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function closeImageDialog() {
    const el = $('.editor-img-dialog__overlay');
    if (el) el.remove();
  }

  /* mode: 'slot'(既存画像) / 'insert'(挿入済み画像) / 'new'(新規挿入, afterIdが対象) */
  function openImageDialog(mode, id, afterId) {
    closeImageDialog();
    const isNew = mode === 'new';
    const isInsert = mode === 'insert';
    const titleText = isNew ? '画像を挿入' : '画像の差し替え';
    const overlay = document.createElement('div');
    overlay.className = 'editor-img-dialog__overlay';
    overlay.dataset.editorSkip = 'true';
    overlay.innerHTML = `
      <div class="editor-img-dialog" role="dialog" aria-modal="true">
        <div class="editor-img-dialog__head">
          <span>${titleText}</span>
          <button type="button" class="editor-img-dialog__close" data-act="close" aria-label="閉じる">×</button>
        </div>
        <div class="editor-img-dialog__body">
          <div class="editor-img-dialog__drop" data-drop tabindex="0" role="button" aria-label="画像を選択">
            <div data-preview></div>
          </div>
          <p class="editor-img-dialog__drop-hint">クリックしてファイルを選択／ここに画像をドラッグ＆ドロップ／Ctrl+Vで貼り付け</p>
          <input type="file" accept="image/*" hidden data-file>
          <div class="editor-img-dialog__label">画像URLで指定する場合</div>
          <div class="editor-img-dialog__row">
            <input type="text" data-url placeholder="https://example.com/photo.jpg">
            <button type="button" data-act="url">URLを適用</button>
          </div>
          <div class="editor-img-dialog__label">代替テキスト（alt）</div>
          <div class="editor-img-dialog__row">
            <input type="text" data-alt placeholder="画像の説明（SEO・アクセシビリティ用）">
          </div>
        </div>
        <div class="editor-img-dialog__foot">
          ${!isNew && !isInsert ? '<button type="button" class="danger" data-act="reset">元の画像に戻す</button>' : ''}
          ${isInsert ? '<button type="button" class="danger" data-act="remove">この画像を削除</button>' : ''}
          <button type="button" data-act="close">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const preview = $('[data-preview]', overlay);
    const altInput = $('[data-alt]', overlay);
    const urlInput = $('[data-url]', overlay);
    const dropzone = $('[data-drop]', overlay);
    const fileInput = $('[data-file]', overlay);

    const currentEntry = () => {
      if (mode === 'insert') return insState.find((x) => x.id === id) || null;
      if (mode === 'slot') return imgState[id] || null;
      return null;
    };

    function renderPreview() {
      const entry = currentEntry();
      if (entry && entry.src) {
        preview.innerHTML = `<img src="${entry.src.replace(/"/g, '&quot;')}" alt="">`;
      } else if (mode === 'slot') {
        preview.innerHTML = imgOriginals.get(id) || '<span class="editor-img-dialog__drop-empty">（画像なし）</span>';
      } else {
        preview.innerHTML = '<span class="editor-img-dialog__drop-empty">画像が未選択です<br>クリックまたはドラッグ＆ドロップで選択</span>';
      }
    }

    function applyChosen(src) {
      if (mode === 'new') {
        const ins = { id: 'ins' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), afterId, src, alt: altInput.value.trim() };
        insState.push(ins);
        applyInserts();
        // 以後は挿入済み画像の編集として続行（削除ボタンを追加）
        mode = 'insert'; id = ins.id; afterId = null;
        overlay.querySelector('.editor-img-dialog__head span').textContent = '画像の差し替え';
        const foot = overlay.querySelector('.editor-img-dialog__foot');
        if (!foot.querySelector('[data-act="remove"]')) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'danger';
          removeBtn.dataset.act = 'remove';
          removeBtn.textContent = 'この画像を削除';
          foot.prepend(removeBtn);
        }
      } else if (mode === 'insert') {
        const ins = insState.find((x) => x.id === id);
        if (ins) { ins.src = src; applyInserts(); }
      } else {
        imgState[id] = { ...(imgState[id] || {}), src };
        applyImage(id);
      }
      renderPreview();
      refreshStatus();
    }

    // 初期値
    const entry = currentEntry();
    if (entry && entry.alt) altInput.value = entry.alt;
    else if (mode === 'slot') {
      const cur = document.querySelector(`[data-img-id="${id}"]`);
      if (cur && cur.tagName.toLowerCase() === 'img') altInput.value = cur.alt || '';
    }
    renderPreview();

    // ドラッグ＆ドロップ / クリック選択 / 貼り付け
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) fileToDataUrl(file, applyChosen);
    });
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      fileToDataUrl(item.getAsFile(), applyChosen);
    };
    document.addEventListener('paste', onPaste);
    const cleanup = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('paste', onPaste);
        cleanup.disconnect();
      }
    });
    cleanup.observe(document.body, { childList: true });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) { closeImageDialog(); return; }
      const btn = event.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'url') {
        const url = urlInput.value.trim();
        if (!url) { alert('URLを入力してください。'); return; }
        applyChosen(url);
      } else if (act === 'reset') {
        delete imgState[id];
        applyImage(id);
        renderPreview();
        refreshStatus();
      } else if (act === 'remove') {
        insState = insState.filter((x) => x.id !== id);
        applyInserts();
        refreshStatus();
        closeImageDialog();
      } else if (act === 'close') {
        closeImageDialog();
      }
    });

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      fileToDataUrl(file, (src) => applyChosen(src));
      event.target.value = '';
    });

    altInput.addEventListener('change', () => {
      const alt = altInput.value.trim();
      if (mode === 'insert') {
        const ins = insState.find((x) => x.id === id);
        if (ins) { ins.alt = alt; applyInserts(); }
      } else if (mode === 'slot') {
        imgState[id] = { ...(imgState[id] || {}), alt };
        applyImage(id);
      }
      refreshStatus();
    });
  }

  /* ---------------- 画像クリック・挿入チップ ---------------- */
  function bindImageEvents() {
    // 編集モード中の画像クリックで差し替えダイアログ（リンク遷移より先に捕捉）
    document.addEventListener('click', (event) => {
      if (!editMode) return;
      const inserted = event.target.closest('[data-inserted-id]');
      if (inserted) {
        event.preventDefault(); event.stopPropagation();
        openImageDialog('insert', inserted.getAttribute('data-inserted-id'));
        return;
      }
      const slot = event.target.closest('[data-img-id]');
      if (slot) {
        event.preventDefault(); event.stopPropagation();
        openImageDialog('slot', slot.getAttribute('data-img-id'));
      }
    }, true);

    // 段落・見出しへのホバーで「＋画像」チップ表示
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'editor-insert-chip';
    chip.dataset.editorSkip = 'true';
    chip.textContent = '🖼 ＋画像';
    chip.title = 'この文章の直後に画像を挿入';
    document.body.appendChild(chip);

    document.addEventListener('mouseover', (event) => {
      if (!editMode) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.editor-insert-chip')) return;
      const block = event.target.closest('[data-editable-text]');
      if (!block || !INSERT_TARGET.test(block.tagName)) return;
      const rect = block.getBoundingClientRect();
      chip.style.display = 'inline-flex';
      chip.style.top = `${window.scrollY + rect.bottom - 12}px`;
      chip.style.left = `${Math.max(8, window.scrollX + rect.right - 96)}px`;
      chip.dataset.targetId = block.dataset.editId;
    });

    chip.addEventListener('click', () => {
      if (chip.dataset.targetId) openImageDialog('new', null, chip.dataset.targetId);
      chip.style.display = 'none';
    });
  }

  /* ---------------- UIパーツ ---------------- */
  function refreshHistory() {
    const select = $('.editor-history');
    if (!select) return;
    const history = storageGet(historyKey, []);
    select.innerHTML = '<option value="">履歴を選択</option>' + history.map((h, i) => {
      const count = Object.keys(h.data || {}).length + Object.keys(h.images || {}).length + (h.inserts || []).length;
      return `<option value="${i}">${h.label} / ${count}箇所</option>`;
    }).join('');
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
          <h2 id="editorIntroTitle">ページの文字と画像を直接変更し、記録を残せます</h2>
        </div>
        <div class="editor-intro-dialog__body">
          <ol>
            <li>ツールバーの<strong>「プレビュー / 編集」</strong>で表示モードを切り替えます。プレビューは訪問者と同じ見た目です。</li>
            <li>編集モードでは、ページ内の<strong>文字をその場で書き換え</strong>られます。<strong>画像をクリック</strong>すると差し替え（ファイル・URL・alt）ができます。</li>
            <li>段落や見出しにマウスを重ねると<strong>「🖼 ＋画像」</strong>が表示され、直後に画像を挿入できます。</li>
            <li><strong>保存</strong>（Ctrl+S）で変更がこのページ専用に記録され、履歴から<strong>復元</strong>できます。<strong>「変更前を表示」</strong>で元の状態と見比べられます。</li>
            <li><strong>「変更内容」</strong>ボタンで編集の記録を一覧できます。<strong>AI指示用レポート</strong>やJSONとしてコピー・出力し、HP本体への反映に活用できます。</li>
          </ol>
          <p class="editor-intro-dialog__note">※保存先は現在のブラウザの localStorage です。HTMLファイル自体は書き換えません。この説明は右下ツールバーの「?」からいつでも再表示できます。</p>
        </div>
        <div class="editor-intro-dialog__actions">
          <button type="button" class="editor-intro-close">閉じる</button>
          <button type="button" class="primary editor-intro-start">編集を開始する</button>
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

  function setToolbarOpen(open) {
    const bar = $('.editor-toolbar');
    const fab = $('.editor-fab');
    if (!bar || !fab) return;
    bar.classList.toggle('is-collapsed', !open);
    fab.classList.toggle('is-visible', !open);
    storageSet(toolbarOpenKey, open);
  }

  function toolbar() {
    const bar = document.createElement('div');
    bar.className = 'editor-toolbar';
    bar.dataset.editorSkip = 'true';
    bar.innerHTML = `
      <strong>ページ編集</strong>
      <div class="editor-seg" role="group" aria-label="表示モード">
        <button type="button" class="editor-mode-preview is-active">プレビュー</button>
        <button type="button" class="editor-mode-edit">✎ 編集</button>
      </div>
      <button type="button" class="primary editor-save">保存</button>
      <button type="button" class="editor-changes-btn">変更内容</button>
      <button type="button" class="editor-orig">変更前を表示</button>
      <select class="editor-history" aria-label="変更履歴"></select>
      <button type="button" class="editor-restore">復元</button>
      <button type="button" class="danger editor-clear">初期化</button>
      <span class="spacer"></span>
      <button type="button" class="editor-help-btn" title="使い方を表示">?</button>
      <button type="button" class="editor-minimize" title="ツールバーをしまう">－</button>
      <span class="status editor-status">プレビュー中</span>
    `;
    document.body.appendChild(bar);

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'editor-fab';
    fab.dataset.editorSkip = 'true';
    fab.innerHTML = '✎ ページ編集';
    fab.title = '編集ツールバーを開く';
    document.body.appendChild(fab);

    $('.editor-mode-preview').addEventListener('click', () => setMode(false));
    $('.editor-mode-edit').addEventListener('click', () => setMode(true));
    $('.editor-save').addEventListener('click', save);
    $('.editor-changes-btn').addEventListener('click', openChangesDialog);
    $('.editor-orig').addEventListener('click', () => setOriginalView(!showingOriginal));
    $('.editor-restore').addEventListener('click', () => {
      const v = $('.editor-history').value;
      if (v !== '') restore(Number(v));
    });
    $('.editor-clear').addEventListener('click', clearCurrent);
    $('.editor-help-btn').addEventListener('click', showIntroDialog);
    $('.editor-minimize').addEventListener('click', () => { if (editMode) setMode(false); setToolbarOpen(false); });
    fab.addEventListener('click', () => setToolbarOpen(true));
    refreshHistory();
    setToolbarOpen(storageGet(toolbarOpenKey, false));
  }

  function bindShortcuts() {
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && editMode) {
        event.preventDefault();
        save();
      } else if (event.key === 'Escape' && $('.editor-img-dialog__overlay')) {
        closeImageDialog();
      } else if (event.key === 'Escape' && $('.editor-changes-overlay')) {
        closeChangesDialog();
      } else if (event.key === 'Escape' && editMode && !$('.editor-intro-overlay')) {
        setMode(false);
      }
    });
    document.addEventListener('input', (event) => {
      if (editMode && event.target instanceof Element && event.target.closest('[data-editable-text]')) refreshStatus();
    });
    window.addEventListener('beforeunload', (event) => {
      // 編集モード中に未保存の変更がある場合のみ警告（動的差し替えを誤検知しないため）
      if (editMode && !showingOriginal && unsavedCount() > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  function init() {
    css();
    scan();
    scanImages();
    imgState = storageGet(imagesKey, {});
    insState = storageGet(insertsKey, []);
    applySavedText();
    applyAllImages();
    applyInserts();
    toolbar();
    bindImageEvents();
    bindShortcuts();
    refreshStatus();
    // 使い方ダイアログは初回訪問時のみ自動表示（以降は「?」ボタンから）
    if (!storageGet(introSeenKey, false)) {
      storageSet(introSeenKey, true);
      showIntroDialog();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
