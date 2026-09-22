(() => {
  const SITE = 'https://kuchikomi-taisaku.com';
  const LINE_URL = 'https://lin.ee/gVRUtOl';

  // 本文ブロックの種類
  const TYPES = {
    p: { label: '段落', icon: '¶', tag: 'p', kind: 'text', placeholder: '本文を入力' },
    h2: { label: '章見出し（H2）', icon: 'H2', tag: 'h2', kind: 'text', placeholder: '章のタイトル' },
    h3: { label: '小見出し（H3）', icon: 'H3', tag: 'h3', kind: 'text', placeholder: '小見出し' },
    h4: { label: '見出し（H4）', icon: 'H4', tag: 'h4', kind: 'text', placeholder: '見出し' },
    ul: { label: '箇条書き', icon: '•', tag: 'ul', kind: 'list' },
    ol: { label: '番号付きリスト', icon: '1.', tag: 'ol', kind: 'list' },
    image: { label: '画像', icon: '▣', kind: 'image' },
    table: { label: '表', icon: '▦', kind: 'table' },
    blockquote: { label: '引用', icon: '❝', tag: 'blockquote', kind: 'text', placeholder: '引用文' },
    casenote: { label: '注意書き（※）', icon: '※', tag: 'p', kind: 'text', attrs: ' class="case-note"', className: 'case-note', placeholder: '※注意書き' },
    note: { label: '補足（小さい文字）', icon: 'ｓ', tag: 'p', kind: 'text', attrs: ' class="muted"', className: 'muted', placeholder: '補足・分類など' },
    lead: { label: 'リード文（大きめ）', icon: 'Ｌ', tag: 'p', kind: 'text', attrs: ' style="font-size:17px;color:var(--c-text);line-height:1.95;"', placeholder: '記事冒頭の導入文' },
    html: { label: 'HTML（上級者向け）', icon: '</>', kind: 'html' }
  };
  const ADD_TYPES = ['p', 'h2', 'h3', 'ul', 'ol', 'image', 'table', 'blockquote', 'casenote', 'note', 'lead', 'h4', 'html'];
  const INLINE_TAGS = new Set(['A', 'STRONG', 'EM', 'BR', 'CODE', 'SMALL', 'SPAN', 'MARK', 'SUP', 'SUB']);
  // リンクの候補に出す固定ページ（記事ページから見た相対パス）
  const FIXED_PAGES = [
    ['無料診断フォーム', '/form/'], ['お問い合わせ', '/contact/'], ['料金', '/pricing/'], ['サービス内容', '/service/'],
    ['解決プロセス', '/process/'], ['よくあるご質問', '/faq/'], ['成功事例', '/cases/'], ['当センターについて', '/about/'],
    ['LINEで相談', LINE_URL]
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const els = {
    layout: $('#layout'), offline: $('#offline'), status: $('#status'), toast: $('#toast'),
    stateBadge: $('#stateBadge'), docTitle: $('#docTitle'),
    saveBtn: $('#saveBtn'), previewBtn: $('#previewBtn'), historyBtn: $('#historyBtn'), viewLink: $('#viewLink'),
    newBtn: $('#newBtn'), listSearch: $('#listSearch'), listFilter: $('#listFilter'), articleList: $('#articleList'),
    tabList: $('#tabList'), tabOutline: $('#tabOutline'), panelList: $('#panelList'), panelOutline: $('#panelOutline'),
    outline: $('#outline'), stats: $('#stats'), addChapterBtn: $('#addChapterBtn'),
    blocks: $('#blocks'), addBar: $('#addBar'), bubble: $('#bubble'), fileInput: $('#fileInput'),
    pageUrl: $('#pageUrl'), h1: $('#f-h1'), lead: $('#f-lead'), en: $('#f-en'), seoTitle: $('#f-seoTitle'), description: $('#f-description'),
    titleCount: $('#titleCount'), descCount: $('#descCount'), listingFields: $('#listingFields'),
    published: $('#f-published'), tags: $('#f-tags'), isPublic: $('#f-public'), publicLabel: $('#publicLabel'),
    serpUrl: $('#serpUrl'), serpTitle: $('#serpTitle'), serpDesc: $('#serpDesc'),
    eyecatchPreview: $('#eyecatchPreview'), eyecatchUpload: $('#eyecatchUpload'), eyecatchClear: $('#eyecatchClear'),
    recover: $('#recover'), recoverTime: $('#recoverTime'), recoverYes: $('#recoverYes'), recoverNo: $('#recoverNo'),
    newDialog: $('#newDialog'), newForm: $('#newForm'), nCategory: $('#n-category'), nParentField: $('#n-parentField'), nParent: $('#n-parent'),
    nTitle: $('#n-title'), nSlug: $('#n-slug'), nPrefix: $('#n-prefix'), nError: $('#n-error'), nSubmit: $('#n-submit'),
    linkDialog: $('#linkDialog'), linkForm: $('#linkForm'), lSearch: $('#l-search'), lResults: $('#l-results'), lUrl: $('#l-url'), lBlank: $('#l-blank'), lRemove: $('#l-remove'),
    historyDialog: $('#historyDialog'), historyList: $('#historyList')
  };

  let articles = [];
  let categories = {};
  let current = null;
  let eyecatch = '';
  let dirty = false;
  let saving = false;
  let dragRow = null;
  let lastH1 = '';
  let listFilter = 'all';
  let linkRange = null;
  let linkAnchor = null;
  let linkEdit = null;
  let autosaveTimer = null;

  /* ---------------- 共通 ---------------- */

  const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function api(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `通信エラー（${res.status}）`);
    return data;
  }

  let toastTimer;
  function toast(text, isError = false) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    els.toast.classList.toggle('is-error', isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, isError ? 7000 : 4000);
  }

  function setStatus(text) { els.status.textContent = text; }

  function updateState() {
    if (!current) { els.stateBadge.hidden = true; return; }
    els.stateBadge.hidden = false;
    const draft = !els.isPublic.checked;
    els.stateBadge.textContent = dirty ? '未保存' : (current.draft ? '下書き' : '公開中');
    els.stateBadge.className = `ae-state ${dirty ? 'is-dirty' : current.draft ? 'is-draft' : 'is-public'}`;
    els.publicLabel.textContent = draft ? '下書き（公開しない）' : '公開する';
    els.saveBtn.firstChild.textContent = draft ? '下書きとして保存 ' : '保存してHPに反映 ';
  }

  function markDirty() {
    if (!current) return;
    dirty = true;
    els.saveBtn.disabled = false;
    els.status.classList.add('is-dirty');
    setStatus('未保存の変更があります（Ctrl+S で保存）');
    updateState();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosave, 800);
  }

  function markClean(text) {
    dirty = false;
    els.saveBtn.disabled = !current;
    els.status.classList.remove('is-dirty');
    setStatus(text || '');
    updateState();
  }

  const relFromArticle = (sitePath) => (/^https?:/.test(sitePath) ? sitePath : `../..${sitePath}`);

  /* ---------------- HTML → ブロック ---------------- */

  function parseTable(node) {
    const cellOk = (c) => ![...c.querySelectorAll('*')].some((e) => !INLINE_TAGS.has(e.tagName));
    const trs = $$('tr', node);
    if (!trs.length || node.querySelector('table table, caption, colgroup') || $$('th, td', node).some((c) => !cellOk(c) || c.colSpan > 1 || c.rowSpan > 1)) return null;
    return {
      cls: node.getAttribute('class') || '',
      rows: trs.map((tr) => ({ head: tr.parentElement.tagName === 'THEAD', cells: $$(':scope > th, :scope > td', tr).map((c) => ({ tag: c.tagName.toLowerCase(), html: c.innerHTML.trim() })) }))
    };
  }

  function parseBlocks(html) {
    const doc = new DOMParser().parseFromString(`<div id="ae-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('ae-root');
    const blocks = [];
    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) blocks.push({ type: 'p', html: escapeHtml(text) });
        return;
      }
      if (node.nodeType === Node.COMMENT_NODE) { blocks.push({ type: 'html', html: `<!--${node.data}-->` }); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      const attrCount = node.attributes.length;
      const cls = node.getAttribute('class');
      let type = null;
      if (['h2', 'h3', 'h4', 'p', 'blockquote', 'ul', 'ol'].includes(tag) && attrCount === 0) type = tag;
      else if (tag === 'p' && attrCount === 1 && cls === 'muted') type = 'note';
      else if (tag === 'p' && attrCount === 1 && cls === 'case-note') type = 'casenote';
      else if (tag === 'p' && attrCount === 1 && /font-size:\s*17px/.test(node.getAttribute('style') || '')) type = 'lead';
      if ((type === 'ul' || type === 'ol') && [...node.children].some((c) => c.tagName !== 'LI' || c.attributes.length)) type = null;
      if (type) { blocks.push({ type, html: node.innerHTML.trim() }); return; }
      if (tag === 'figure') {
        const img = node.querySelector(':scope > img');
        const cap = node.querySelector(':scope > figcaption');
        if (img && node.children.length <= 2) { blocks.push({ type: 'image', src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '', caption: cap ? cap.innerHTML.trim() : '' }); return; }
      }
      if (tag === 'table') {
        const table = parseTable(node);
        if (table) { blocks.push({ type: 'table', table }); return; }
      }
      blocks.push({ type: 'html', html: node.outerHTML });
    });
    return blocks;
  }

  /* ---------------- ブロック → HTML ---------------- */

  // 貼り付けやブラウザの編集で紛れ込むタグを、記事で使うタグだけに整える
  function sanitizeInline(container) {
    const walk = (parent) => {
      [...parent.childNodes].forEach((node) => {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        let el = node;
        if (el.tagName === 'B' || el.tagName === 'I') {
          const repl = document.createElement(el.tagName === 'B' ? 'strong' : 'em');
          while (el.firstChild) repl.appendChild(el.firstChild);
          el.replaceWith(repl);
          el = repl;
        }
        if (el.tagName === 'DIV' || el.tagName === 'P') {
          const frag = document.createDocumentFragment();
          if (el.previousSibling) frag.appendChild(document.createElement('br'));
          while (el.firstChild) frag.appendChild(el.firstChild);
          const children = [...frag.childNodes];
          el.replaceWith(frag);
          children.forEach((c) => { if (c.nodeType === Node.ELEMENT_NODE) walk({ childNodes: [c] }); });
          return;
        }
        if (!INLINE_TAGS.has(el.tagName)) {
          const frag = document.createDocumentFragment();
          while (el.firstChild) frag.appendChild(el.firstChild);
          const children = [...frag.childNodes];
          el.replaceWith(frag);
          children.forEach((c) => { if (c.nodeType === Node.ELEMENT_NODE) walk({ childNodes: [c] }); });
          return;
        }
        [...el.attributes].forEach((attr) => {
          const keep = (el.tagName === 'A' && ['href', 'target', 'rel'].includes(attr.name)) || (el.tagName === 'SPAN' && attr.name === 'class');
          if (!keep) el.removeAttribute(attr.name);
        });
        if (el.tagName === 'SPAN' && !el.attributes.length) {
          const frag = document.createDocumentFragment();
          while (el.firstChild) frag.appendChild(el.firstChild);
          el.replaceWith(frag);
          return;
        }
        walk(el);
      });
    };
    walk(container);
    while (container.lastChild && container.lastChild.nodeName === 'BR') container.lastChild.remove();
    return container.innerHTML.replace(/&nbsp;/g, ' ').trim();
  }

  const innerOf = (el) => sanitizeInline(el.cloneNode(true));
  const isBlank = (html) => !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;|\s/g, '');

  function listItems(listEl) {
    const items = $$(':scope > li', listEl).map((li) => innerOf(li)).filter((h) => !isBlank(h));
    const stray = [...listEl.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).map((n) => escapeHtml(n.textContent.trim()));
    return items.concat(stray);
  }

  const IND = '          ';

  function tableToHtml(row) {
    const table = $('table', row);
    const trs = $$('tr', table).map((tr) => ({ head: tr.parentElement.tagName === 'THEAD', cells: $$(':scope > th, :scope > td:not(.ae-table__ctl)', tr).map((c) => ({ tag: c.tagName.toLowerCase(), html: innerOf(c) })) }))
      .filter((r) => r.cells.some((c) => !isBlank(c.html)));
    if (!trs.length) return '';
    const line = (r) => `<tr>${r.cells.map((c) => (c.tag === 'th' && !r.head ? `<th scope="row">${c.html}</th>` : `<${c.tag}>${c.html}</${c.tag}>`)).join('')}</tr>`;
    const head = trs.filter((r) => r.head);
    const body = trs.filter((r) => !r.head);
    const cls = table.dataset.cls ? ` class="${escapeHtml(table.dataset.cls)}"` : '';
    const out = [`<table${cls}>`];
    if (head.length) out.push('<thead>', ...head.map(line), '</thead>');
    out.push('<tbody>', ...body.map(line), '</tbody>', '</table>');
    return out.map((l) => IND + l).join('\n');
  }

  function rowToHtml(row) {
    const type = row.dataset.type;
    const def = TYPES[type];
    if (def.kind === 'html') {
      const value = $('.ae-html', row).value.trim();
      return value ? value.split('\n').map((l) => (l.trim() ? `${IND}${l.replace(/^\s{0,10}/, '')}` : '')).join('\n') : '';
    }
    if (def.kind === 'image') {
      const src = row.dataset.src || '';
      if (!src) return '';
      const alt = $('.ae-img__alt', row).value.trim();
      const cap = $('.ae-img__cap', row).value.trim();
      return `${IND}<figure class="article-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">${cap ? `<figcaption>${escapeHtml(cap)}</figcaption>` : ''}</figure>`;
    }
    if (def.kind === 'table') return tableToHtml(row);
    const editEl = $('.ae-edit', row);
    if (def.kind === 'list') {
      const items = listItems(editEl);
      if (!items.length) return '';
      return `${IND}<${def.tag}${def.attrs || ''}>\n${items.map((h) => `${IND}  <li>${h}</li>`).join('\n')}\n${IND}</${def.tag}>`;
    }
    const inner = innerOf(editEl);
    if (isBlank(inner)) return '';
    return `${IND}<${def.tag}${def.attrs || ''}>${inner}</${def.tag}>`;
  }

  function serializeBody() {
    const parts = [];
    rows().forEach((row) => {
      const html = rowToHtml(row);
      if (!html) return;
      if (parts.length && /^h[2-4]$/.test(row.dataset.type)) parts.push('');
      parts.push(html);
    });
    return parts.join('\n');
  }

  /* ---------------- ブロックの描画 ---------------- */

  const rows = () => $$(':scope > .ae-block', els.blocks);

  function typeSelectHtml(selected) {
    // 画像・表は内容の形が違うので、それ以外の種類とは切り替えない
    const keys = TYPES[selected].kind === 'image' || TYPES[selected].kind === 'table'
      ? [selected, 'html']
      : Object.keys(TYPES).filter((k) => !['image', 'table'].includes(TYPES[k].kind));
    return keys.map((key) => `<option value="${key}"${key === selected ? ' selected' : ''}>${TYPES[key].label}</option>`).join('');
  }

  function tableEditor(table) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-table';
    const t = document.createElement('table');
    if (table.cls) t.className = table.cls;
    t.dataset.cls = table.cls || '';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    table.rows.forEach((r) => (r.head ? thead : tbody).appendChild(tableRow(r.cells)));
    if (thead.children.length) t.appendChild(thead);
    t.appendChild(tbody);
    wrap.appendChild(t);
    const btns = document.createElement('div');
    btns.className = 'ae-table__btns';
    btns.innerHTML = '<button type="button" data-act="row-add">＋ 行を追加</button><button type="button" data-act="col-add">＋ 列を追加</button><button type="button" data-act="col-del">− 右端の列を削除</button>';
    wrap.appendChild(btns);
    return wrap;
  }

  function tableRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((c) => {
      const cell = document.createElement(c.tag);
      cell.className = 'ae-edit ae-cell';
      cell.contentEditable = 'true';
      cell.innerHTML = c.html || '';
      tr.appendChild(cell);
    });
    const ctl = document.createElement('td');
    ctl.className = 'ae-table__ctl';
    ctl.innerHTML = '<button type="button" data-act="row-del" title="この行を削除">×</button>';
    tr.appendChild(ctl);
    return tr;
  }

  function imageEditor(b) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-img';
    wrap.innerHTML = `
      <div class="ae-img__frame">${b.src ? `<img src="${escapeHtml(b.src)}" alt="">` : '<button type="button" class="ae-img__pick" data-act="img-pick">画像を選ぶ<small>JPG・PNG・WebP・GIF（5MBまで。大きい写真は自動で縮小します）</small></button>'}</div>
      <div class="ae-img__fields">
        <label><span>画像の説明（代替テキスト）</span><input type="text" class="ae-img__alt" value="${escapeHtml(b.alt || '')}" placeholder="例：Googleマップの口コミ一覧の画面"></label>
        <label><span>キャプション（任意・画像の下に表示）</span><input type="text" class="ae-img__cap" value="${escapeHtml(b.caption ? new DOMParser().parseFromString(b.caption, 'text/html').body.textContent : '')}"></label>
        ${b.src ? '<button type="button" class="ae-btn" data-act="img-pick">画像を差し替え</button>' : ''}
      </div>`;
    return wrap;
  }

  function createEditor(type, b = {}) {
    const def = TYPES[type];
    if (def.kind === 'html') {
      const ta = document.createElement('textarea');
      ta.className = 'ae-html';
      ta.spellcheck = false;
      ta.value = b.html || '';
      ta.placeholder = '<table>…</table> などのHTMLをそのまま記述できます';
      return ta;
    }
    if (def.kind === 'image') return imageEditor(b);
    if (def.kind === 'table') {
      return tableEditor(b.table || { cls: 'case-profile', rows: [0, 1, 2].map(() => ({ head: false, cells: [{ tag: 'th', html: '' }, { tag: 'td', html: '' }] })) });
    }
    const el = document.createElement(def.tag);
    el.className = `ae-edit${def.className ? ` ${def.className}` : ''}`;
    el.contentEditable = 'true';
    if (def.kind === 'list') el.innerHTML = b.html && /<li[\s>]/i.test(b.html) ? b.html : '<li><br></li>';
    else { el.innerHTML = b.html || ''; el.dataset.placeholder = def.placeholder || ''; }
    return el;
  }

  function createRow(type, b = {}) {
    const row = document.createElement('div');
    row.className = 'ae-block';
    row.dataset.type = type;
    if (type === 'image') row.dataset.src = b.src || '';
    row.innerHTML = `
      <button type="button" class="ae-handle" title="ドラッグして移動" aria-label="ドラッグして移動">⋮⋮</button>
      <div class="ae-block__main">
        <div class="ae-block__head">
          <select class="ae-type" aria-label="ブロックの種類">${typeSelectHtml(type)}</select>
          <span class="ae-chapter"></span>
          <span class="spacer"></span>
          <button type="button" data-act="up" title="1つ上へ">▲</button>
          <button type="button" data-act="down" title="1つ下へ">▼</button>
          <button type="button" data-act="more" title="その他の操作" aria-haspopup="true">…</button>
        </div>
        <div class="ae-block__body"></div>
      </div>
      <div class="ae-insert"><button type="button" data-act="insert">＋ ここに追加</button></div>`;
    $('.ae-block__body', row).appendChild(createEditor(type, b));
    return row;
  }

  // 種類変更時に内容をできるだけ引き継ぐ
  function convertRow(row, newType) {
    const oldDef = TYPES[row.dataset.type];
    const newDef = TYPES[newType];
    let b = {};
    if (newDef.kind === 'html') {
      b.html = rowToHtml(row).replace(/^ {10}/gm, '');
    } else if (oldDef.kind === 'html') {
      const parsed = parseBlocks($('.ae-html', row).value)[0];
      if (parsed && TYPES[parsed.type].kind === newDef.kind) b = parsed;
      else {
        const tmp = document.createElement('div');
        tmp.innerHTML = $('.ae-html', row).value;
        const list = tmp.querySelector('ul,ol');
        b.html = newDef.kind === 'list' && list ? list.innerHTML : sanitizeInline(tmp);
      }
    } else {
      const editEl = $('.ae-edit', row);
      if (oldDef.kind === 'list' && newDef.kind === 'text') b.html = listItems(editEl).join('<br>');
      else if (oldDef.kind === 'text' && newDef.kind === 'list') b.html = innerOf(editEl).split(/<br\s*\/?>/i).filter((h) => !isBlank(h)).map((h) => `<li>${h.trim()}</li>`).join('');
      else if (oldDef.kind === 'list') b.html = listItems(editEl).map((h) => `<li>${h}</li>`).join('');
      else b.html = innerOf(editEl);
    }
    const next = createRow(newType, b);
    row.replaceWith(next);
    return next;
  }

  function renderBlocks(blocks) {
    els.blocks.innerHTML = '';
    blocks.forEach((b) => els.blocks.appendChild(createRow(b.type, b)));
    if (!blocks.length) els.blocks.appendChild(createRow('p'));
    refreshStructure();
  }

  function insertRow(type, afterRow, focus = true) {
    const row = createRow(type);
    if (afterRow) afterRow.after(row);
    else els.blocks.appendChild(row);
    refreshStructure();
    markDirty();
    if (type === 'image') pickImage((src) => setRowImage(row, src));
    else if (focus) focusRow(row);
    return row;
  }

  function focusRow(row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = $('.ae-edit, .ae-html, .ae-img__alt', row);
    if (!target) return;
    setTimeout(() => {
      target.focus();
      if (target.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(target.tagName === 'UL' || target.tagName === 'OL' ? target.lastElementChild || target : target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 250);
  }

  /* ---------------- 構成（章）操作 ---------------- */

  function chapterOf(row) {
    const all = rows();
    const start = all.indexOf(row);
    let end = start + 1;
    while (end < all.length && all[end].dataset.type !== 'h2') end += 1;
    return all.slice(start, end);
  }

  const chapterStarts = () => rows().filter((r) => r.dataset.type === 'h2');

  function moveChapter(row, dir) {
    const starts = chapterStarts();
    const i = starts.indexOf(row);
    if (i < 0) return;
    const mine = chapterOf(row);
    if (dir < 0) {
      if (i === 0) return;
      starts[i - 1].before(...mine);
    } else {
      if (i === starts.length - 1) return;
      const next = chapterOf(starts[i + 1]);
      next[next.length - 1].after(...mine);
    }
    refreshStructure();
    markDirty();
    row.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function moveRow(row, dir) {
    if (dir < 0 && row.previousElementSibling) row.previousElementSibling.before(row);
    if (dir > 0 && row.nextElementSibling) row.nextElementSibling.after(row);
    refreshStructure();
    markDirty();
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function refreshStructure() {
    const all = rows();
    let chapterNo = 0;
    all.forEach((row, i) => {
      const isH2 = row.dataset.type === 'h2';
      if (isH2) chapterNo += 1;
      $('.ae-chapter', row).textContent = isH2 ? `第${chapterNo}章` : '';
      $('[data-act="up"]', row).disabled = i === 0;
      $('[data-act="down"]', row).disabled = i === all.length - 1;
    });
    renderOutline();
    renderStats();
  }

  function renderOutline() {
    const all = rows();
    const items = [];
    const firstHeading = all.findIndex((r) => /^h[2-4]$/.test(r.dataset.type));
    const introCount = firstHeading < 0 ? all.length : firstHeading;
    if (introCount > 0) items.push({ level: 'intro', text: `導入（${introCount}ブロック）`, row: all[0] });
    const starts = chapterStarts();
    let chapterNo = 0;
    all.forEach((row) => {
      const type = row.dataset.type;
      if (!/^h[2-4]$/.test(type)) return;
      if (type === 'h2') chapterNo += 1;
      const text = ($('.ae-edit', row).textContent || '').trim() || '（無題の見出し）';
      items.push({ level: type, text, row, no: type === 'h2' ? chapterNo : null });
    });
    els.outline.innerHTML = '';
    if (!items.length) { els.outline.innerHTML = '<li class="lv-intro"><a>見出しがありません</a></li>'; return; }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = `lv-${item.level}`;
      const a = document.createElement('a');
      a.innerHTML = item.no ? `<span class="ae-outline__num">${item.no}.</span>` : '';
      a.append(item.text);
      a.title = item.text;
      a.addEventListener('click', () => focusRow(item.row));
      li.appendChild(a);
      if (item.level === 'h2') {
        const idx = starts.indexOf(item.row);
        [['▲', '章ごと上へ', -1, idx === 0], ['▼', '章ごと下へ', 1, idx === starts.length - 1]].forEach(([t, title, dir, disabled]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = t; b.title = title; b.disabled = disabled;
          b.addEventListener('click', () => moveChapter(item.row, dir));
          li.appendChild(b);
        });
      }
      els.outline.appendChild(li);
    });
  }

  function renderStats() {
    const text = rows().map((r) => (TYPES[r.dataset.type].kind === 'text' || TYPES[r.dataset.type].kind === 'list' ? $('.ae-edit', r).textContent : '')).join('').replace(/\s/g, '');
    const count = (t) => rows().filter((r) => r.dataset.type === t).length;
    els.stats.innerHTML = `
      <div><dt>本文の文字数</dt><dd>${text.length.toLocaleString()}字</dd></div>
      <div><dt>読むのにかかる時間</dt><dd>約${Math.max(1, Math.round(text.length / 500))}分</dd></div>
      <div><dt>章の数</dt><dd>${count('h2')}</dd></div>
      <div><dt>画像</dt><dd>${count('image')}枚</dd></div>`;
  }

  /* ---------------- メニュー ---------------- */

  function closeMenus() { $$('.ae-menu').forEach((m) => m.remove()); }

  function openMenu(anchor, items) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'ae-menu';
    items.forEach(([label, fn, opts = {}]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = label;
      if (opts.danger) b.classList.add('is-danger');
      if (opts.disabled) b.disabled = true;
      b.addEventListener('click', () => { closeMenus(); fn(); });
      menu.appendChild(b);
    });
    anchor.appendChild(menu);
    return menu;
  }

  const typeButtonLabel = (type) => `<span class="ae-menu__icon">${escapeHtml(TYPES[type].icon)}</span>${TYPES[type].label}`;

  function openInsertMenu(anchor, afterRow) {
    const menu = openMenu(anchor, ADD_TYPES.map((type) => [typeButtonLabel(type), () => insertRow(type, afterRow)]));
    menu.classList.add('ae-menu--grid');
  }

  function openRowMenu(anchor, row) {
    const isH2 = row.dataset.type === 'h2';
    const starts = chapterStarts();
    const idx = starts.indexOf(row);
    const items = [
      ['複製', () => duplicateRow(row)],
      ['このブロックを削除', () => deleteRow(row), { danger: true }]
    ];
    if (isH2) {
      items.push(['章ごと上へ', () => moveChapter(row, -1), { disabled: idx === 0 }]);
      items.push(['章ごと下へ', () => moveChapter(row, 1), { disabled: idx === starts.length - 1 }]);
      items.push(['章を本文ごと削除', () => deleteChapter(row), { danger: true }]);
    }
    const menu = openMenu(anchor, items);
    menu.classList.add('ae-menu--list');
  }

  function buildAddBar() {
    els.addBar.innerHTML = '<span>末尾に追加：</span>';
    ADD_TYPES.slice(0, 9).forEach((type) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = typeButtonLabel(type);
      b.addEventListener('click', () => insertRow(type, null));
      els.addBar.appendChild(b);
    });
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = 'その他…';
    more.addEventListener('click', (e) => { e.stopPropagation(); openInsertMenu(els.addBar, null); });
    els.addBar.appendChild(more);
  }

  function duplicateRow(row) {
    const b = parseBlocks(rowToHtml(row))[0] || { html: '' };
    const copy = createRow(row.dataset.type, b.type === row.dataset.type ? b : { html: b.html });
    row.after(copy);
    refreshStructure();
    markDirty();
  }

  function deleteRow(row) {
    const isChapter = row.dataset.type === 'h2' && chapterOf(row).length > 1;
    const message = isChapter ? 'この章見出しだけを削除します（章の本文は残り、前の章に含まれます）。よろしいですか？' : 'このブロックを削除しますか？';
    if (!isBlank(rowToHtml(row)) && !confirm(message)) return;
    row.remove();
    if (!rows().length) els.blocks.appendChild(createRow('p'));
    refreshStructure();
    markDirty();
  }

  function deleteChapter(row) {
    const chapter = chapterOf(row);
    if (!confirm(`この章（見出しと本文 ${chapter.length} ブロック）をまとめて削除しますか？`)) return;
    chapter.forEach((r) => r.remove());
    if (!rows().length) els.blocks.appendChild(createRow('p'));
    refreshStructure();
    markDirty();
  }

  /* ---------------- 画像 ---------------- */

  let pickCallback = null;
  function pickImage(cb) {
    if (!current) return;
    pickCallback = cb;
    els.fileInput.value = '';
    els.fileInput.click();
  }

  // 大きい写真はブラウザで縮小してから送る（横1600pxまで）
  function shrink(file) {
    return new Promise((resolve) => {
      if (file.type === 'image/gif') { resolve(file); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 1600;
        if (img.naturalWidth <= max && file.size < 900 * 1024) { resolve(file); return; }
        const scale = Math.min(1, max / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }) : file), 'image/webp', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function uploadFile(file) {
    const small = await shrink(file);
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(small);
    });
    setStatus('画像をアップロード中…');
    const result = await api('/api/upload', { method: 'POST', body: JSON.stringify({ path: current.path, name: small.name, type: small.type, data }) });
    setStatus(dirty ? '未保存の変更があります（Ctrl+S で保存）' : '');
    return result.src;
  }

  function setRowImage(row, src) {
    const alt = $('.ae-img__alt', row)?.value || '';
    const caption = $('.ae-img__cap', row)?.value || '';
    const body = $('.ae-block__body', row);
    row.dataset.src = src;
    body.innerHTML = '';
    body.appendChild(imageEditor({ src, alt, caption: escapeHtml(caption) }));
    refreshStructure();
    markDirty();
    $('.ae-img__alt', row).focus();
  }

  function renderEyecatch() {
    els.eyecatchPreview.innerHTML = eyecatch ? `<img src="${escapeHtml(eyecatch)}" alt="">` : '<span>未設定（共通の画像が使われます）</span>';
    els.eyecatchClear.hidden = !eyecatch;
  }

  /* ---------------- 基本情報 ---------------- */

  function renderListing(listing) {
    const box = els.listingFields;
    box.innerHTML = '';
    box.hidden = !listing;
    if (!listing) return;
    if (listing.kind === 'banner') {
      box.innerHTML = '<span>一覧に出る紹介文</span><textarea id="f-listing-sub" rows="2"></textarea>';
      $('#f-listing-sub').value = listing.sub || '';
    } else if (listing.kind === 'news') {
      box.innerHTML = `<span>お知らせ一覧での分類</span><select id="f-listing-tag">${(listing.tags || []).map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>`;
      $('#f-listing-tag').value = listing.tag || '';
    }
  }

  function collectListing() {
    if (!current || !current.listing) return null;
    if (current.listing.kind === 'banner') return { kind: 'banner', sub: $('#f-listing-sub').value };
    return { kind: 'news', tag: $('#f-listing-tag').value };
  }

  function updateSeo() {
    const t = els.seoTitle.value.trim();
    const d = els.description.value.trim();
    els.titleCount.textContent = `${t.length}文字（検索結果に出るのは前半30文字ほど）`;
    els.descCount.textContent = `${d.length}文字（目安 80〜120文字）`;
    els.descCount.classList.toggle('is-over', d.length > 140 || (d.length > 0 && d.length < 50));
    els.serpTitle.textContent = t || els.h1.value;
    els.serpDesc.textContent = d || '（説明文が空です。検索エンジンが本文から自動で抜き出します）';
    if (current) els.serpUrl.textContent = `${SITE.replace('https://', '')} › ${current.url.split('/').filter(Boolean).join(' › ')}`;
  }

  const autosizeLead = () => { els.lead.style.height = 'auto'; els.lead.style.height = `${els.lead.scrollHeight}px`; };

  /* ---------------- 記事一覧 ---------------- */

  function renderFilter() {
    const counts = {};
    articles.forEach((a) => { counts[a.category] = (counts[a.category] || 0) + 1; });
    els.listFilter.innerHTML = [['all', 'すべて', articles.length], ...Object.entries(categories).map(([k, name]) => [k, name, counts[k] || 0])]
      .map(([k, name, n]) => `<button type="button" data-filter="${k}" aria-pressed="${k === listFilter}">${escapeHtml(name)}<small>${n}</small></button>`).join('');
  }

  function orderedArticles() {
    // 成功事例は「業種ページ → その解決事例」の順に並べる
    const out = [];
    const byParent = {};
    articles.forEach((a) => { if (a.parent) (byParent[`${a.category}/${a.parent}`] = byParent[`${a.category}/${a.parent}`] || []).push(a); });
    articles.filter((a) => !a.parent).forEach((a) => {
      out.push(a);
      (byParent[a.path] || []).sort((p, q) => p.order - q.order).forEach((c) => out.push(c));
    });
    articles.filter((a) => a.parent && !articles.some((p) => p.path === `${a.category}/${a.parent}`)).forEach((a) => out.push(a));
    return out;
  }

  function renderList() {
    const q = els.listSearch.value.trim().toLowerCase();
    const list = orderedArticles().filter((a) => (listFilter === 'all' || a.category === listFilter)
      && (!q || `${a.title} ${a.navTitle || ''} ${a.slug}`.toLowerCase().includes(q)));
    els.articleList.innerHTML = list.length ? list.map((a) => `
      <li><button type="button" data-path="${escapeHtml(a.path)}" class="${a.parent ? 'is-child' : ''}${current && current.path === a.path ? ' is-current' : ''}">
        <span class="ae-list__title">${escapeHtml(a.parent && a.navTitle ? a.navTitle : a.title)}</span>
        <span class="ae-list__meta">${a.draft ? '<em class="ae-tag ae-tag--draft">下書き</em>' : ''}<span>${escapeHtml(categories[a.category] || a.category)}</span><span>更新 ${escapeHtml((a.updatedAt || '').replace(/-/g, '.'))}</span></span>
      </button></li>`).join('') : '<li class="ae-list__empty">該当する記事がありません</li>';
  }

  async function loadArticles() {
    const data = await api('/api/articles');
    articles = data.articles;
    categories = data.categories;
    renderFilter();
    renderList();
  }

  function showTab(which) {
    const list = which === 'list';
    els.tabList.setAttribute('aria-selected', String(list));
    els.tabOutline.setAttribute('aria-selected', String(!list));
    els.panelList.hidden = !list;
    els.panelOutline.hidden = list;
  }

  /* ---------------- 読み込み・保存 ---------------- */

  function collectPayload() {
    return {
      path: current.path,
      h1: els.h1.value.trim(),
      lead: els.lead.value,
      en: els.en.value,
      seoTitle: els.seoTitle.value,
      description: els.description.value,
      bodyHtml: serializeBody(),
      listing: collectListing(),
      published: els.published.value,
      tags: els.tags.value,
      draft: !els.isPublic.checked,
      image: eyecatch
    };
  }

  function fillForm(d) {
    els.h1.value = d.h1;
    els.lead.value = d.lead || '';
    els.en.value = d.en || '';
    els.seoTitle.value = d.seoTitle || '';
    els.description.value = d.description || '';
    els.published.value = d.published || '';
    els.tags.value = Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '');
    els.isPublic.checked = !d.draft;
    eyecatch = d.image || '';
    lastH1 = d.h1;
    renderEyecatch();
    autosizeLead();
    updateSeo();
  }

  const autosaveKey = () => `ae-autosave:${current.path}`;
  function autosave() {
    if (!current || !dirty) return;
    try { localStorage.setItem(autosaveKey(), JSON.stringify({ at: Date.now(), payload: collectPayload() })); } catch { /* 保存できなくても編集は続けられる */ }
  }
  function clearAutosave() { try { if (current) localStorage.removeItem(autosaveKey()); } catch { /* なし */ } }

  function checkAutosave() {
    els.recover.hidden = true;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(autosaveKey()) || 'null'); } catch { saved = null; }
    if (!saved || !saved.payload) return;
    if (JSON.stringify({ ...saved.payload, path: '' }) === JSON.stringify({ ...collectPayload(), path: '' })) { clearAutosave(); return; }
    els.recoverTime.textContent = `（${new Date(saved.at).toLocaleString('ja-JP')} の時点）`;
    els.recover.hidden = false;
    els.recoverYes.onclick = () => {
      const p = saved.payload;
      fillForm({ ...p, tags: p.tags, image: p.image });
      if (p.listing && p.listing.kind === 'banner' && $('#f-listing-sub')) $('#f-listing-sub').value = p.listing.sub;
      if (p.listing && p.listing.kind === 'news' && $('#f-listing-tag')) $('#f-listing-tag').value = p.listing.tag;
      renderBlocks(parseBlocks(p.bodyHtml));
      els.recover.hidden = true;
      markDirty();
      toast('保存されていなかった編集内容に戻しました。よければ保存してください。');
    };
    els.recoverNo.onclick = () => { clearAutosave(); els.recover.hidden = true; };
  }

  async function openArticle(articlePath) {
    const data = await api(`/api/article?path=${encodeURIComponent(articlePath)}`);
    current = data;
    fillForm(data);
    renderListing(data.listing);
    renderBlocks(parseBlocks(data.bodyHtml));
    els.pageUrl.textContent = `${SITE}${data.url}`;
    els.viewLink.href = data.url;
    els.viewLink.hidden = Boolean(data.draft);
    els.previewBtn.disabled = false;
    els.historyBtn.disabled = false;
    els.docTitle.textContent = data.h1;
    document.title = `${data.h1}｜記事エディタ`;
    history.replaceState(null, '', `?path=${encodeURIComponent(data.path)}`);
    els.layout.hidden = false;
    markClean(`「${data.h1}」を開きました`);
    renderList();
    updateSeo();
    checkAutosave();
  }

  async function save() {
    if (!current || saving) return;
    const payload = collectPayload();
    if (!payload.h1) { toast('記事タイトルを入力してください', true); els.h1.focus(); return; }
    saving = true;
    els.saveBtn.disabled = true;
    setStatus('保存中…');
    try {
      const result = await api('/api/article', { method: 'POST', body: JSON.stringify(payload) });
      current.h1 = payload.h1;
      current.draft = result.draft;
      lastH1 = payload.h1;
      els.viewLink.hidden = result.draft;
      els.docTitle.textContent = payload.h1;
      const pages = result.changed.length ? `（${result.changed.length}ページを作り直しました）` : '';
      const extra = result.linkedFiles.length ? `／サイト内リンク ${result.linkedFiles.length}ファイルのタイトルも更新` : '';
      const done = result.draft ? `下書きとして保存しました${result.removed.length ? '（公開中のページは取り下げました）' : '（まだ公開されていません）'}` : `HPに反映しました${pages}`;
      clearAutosave();
      markClean(`${done}（${new Date().toLocaleTimeString('ja-JP')}）${extra}`);
      toast(`${done}${extra}`);
      await loadArticles();
    } catch (err) {
      toast(`保存できませんでした：${err.message}`, true);
      markDirty();
    } finally {
      saving = false;
    }
  }

  async function preview() {
    if (!current) return;
    const win = window.open('about:blank', '_blank');
    try {
      const result = await api('/api/preview', { method: 'POST', body: JSON.stringify(collectPayload()) });
      if (win) win.location.href = result.url;
      else window.open(result.url, '_blank');
    } catch (err) {
      if (win) win.close();
      toast(`プレビューできませんでした：${err.message}`, true);
    }
  }

  async function openHistory() {
    if (!current) return;
    const data = await api(`/api/history?path=${encodeURIComponent(current.url)}`);
    els.historyList.innerHTML = data.history.length
      ? data.history.map((h) => `<li><span>${escapeHtml(h.label)} の保存前</span><button type="button" class="ae-btn" data-restore="${escapeHtml(h.id)}">この状態に戻す</button></li>`).join('')
      : '<li class="ae-list__empty">まだ履歴はありません（保存すると残ります）</li>';
    els.historyDialog.showModal();
  }

  async function restore(id, label) {
    if (dirty && !confirm('未保存の変更は失われます。履歴から戻しますか？')) return;
    if (!confirm(`「${label}」の状態に記事を戻して、HPに反映します。今の状態も履歴に残ります。よろしいですか？`)) return;
    try {
      await api('/api/restore', { method: 'POST', body: JSON.stringify({ path: current.url, id }) });
      els.historyDialog.close();
      clearAutosave();
      await openArticle(current.path);
      await loadArticles();
      toast('履歴から戻し、HPに反映しました');
    } catch (err) {
      toast(`戻せませんでした：${err.message}`, true);
    }
  }

  async function switchArticle(nextPath) {
    if (!nextPath || (current && nextPath === current.path)) return;
    if (dirty && !confirm('未保存の変更があります。破棄して別の記事を開きますか？（編集内容はこのブラウザに一時保存されています）')) return;
    try { await openArticle(nextPath); } catch (err) { toast(err.message, true); }
  }

  /* ---------------- 新規作成 ---------------- */

  function suggestSlug() {
    const parent = els.nParent.value;
    if (els.nCategory.value === 'cases' && parent) {
      const n = articles.filter((a) => a.category === 'cases' && a.parent === parent).length + 1;
      els.nSlug.value = `${parent}-case-${n}`;
    }
  }

  function openNewDialog() {
    if (dirty && !confirm('未保存の変更があります。破棄して新しい記事を作りますか？')) return;
    els.nCategory.innerHTML = Object.entries(categories).map(([k, name]) => `<option value="${k}">${escapeHtml(name)}</option>`).join('');
    const parents = articles.filter((a) => a.category === 'cases' && !a.parent);
    els.nParent.innerHTML = '<option value="">（業種ページとして作る）</option>' + parents.map((a) => `<option value="${escapeHtml(a.slug)}">${escapeHtml(a.navTitle || a.title)}</option>`).join('');
    els.nCategory.value = current ? current.category : 'column';
    els.nTitle.value = '';
    els.nSlug.value = '';
    els.nError.hidden = true;
    const sync = () => {
      els.nParentField.hidden = els.nCategory.value !== 'cases';
      els.nPrefix.textContent = `${SITE.replace('https://', '')}/${els.nCategory.value}/`;
      suggestSlug();
    };
    els.nCategory.onchange = sync;
    els.nParent.onchange = suggestSlug;
    sync();
    els.newDialog.showModal();
    els.nTitle.focus();
  }

  async function submitNew(e) {
    e.preventDefault();
    const body = { category: els.nCategory.value, slug: els.nSlug.value.trim().toLowerCase(), title: els.nTitle.value.trim(), parent: els.nCategory.value === 'cases' ? els.nParent.value : '' };
    if (!body.title) { els.nError.textContent = 'タイトルを入力してください'; els.nError.hidden = false; return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.slug)) { els.nError.textContent = 'URL名は半角の英小文字・数字・ハイフンで入力してください（例：google-review-guide）'; els.nError.hidden = false; return; }
    els.nSubmit.disabled = true;
    try {
      const result = await api('/api/article/new', { method: 'POST', body: JSON.stringify(body) });
      els.newDialog.close();
      dirty = false;
      await loadArticles();
      await openArticle(result.path);
      toast('下書きとして作りました。本文を書いて「公開する」をオンにして保存すると公開されます。');
    } catch (err) {
      els.nError.textContent = err.message;
      els.nError.hidden = false;
    } finally {
      els.nSubmit.disabled = false;
    }
  }

  /* ---------------- 書式・リンク ---------------- */

  function activeEditable() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return el ? el.closest('.ae-edit') : null;
  }

  function positionBubble() {
    const sel = window.getSelection();
    const edit = activeEditable();
    if (!edit || !sel.rangeCount || sel.isCollapsed || els.linkDialog.open) { els.bubble.hidden = true; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { els.bubble.hidden = true; return; }
    els.bubble.hidden = false;
    const w = els.bubble.offsetWidth;
    els.bubble.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))}px`;
    els.bubble.style.top = `${Math.max(8, rect.top - els.bubble.offsetHeight - 8)}px`;
  }

  function openLinkDialog() {
    const sel = window.getSelection();
    const edit = activeEditable();
    if (!edit || !sel.rangeCount) { toast('リンクにする文字を選択してください', true); return; }
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    linkAnchor = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement).closest('a');
    if (!linkAnchor && sel.isCollapsed) { toast('リンクにする文字を選択してください', true); return; }
    linkRange = range.cloneRange();
    linkEdit = edit;
    els.lUrl.value = linkAnchor ? linkAnchor.getAttribute('href') || '' : '';
    els.lBlank.checked = linkAnchor ? linkAnchor.getAttribute('target') === '_blank' : false;
    els.lRemove.hidden = !linkAnchor;
    els.lSearch.value = '';
    renderPicker();
    els.bubble.hidden = true;
    els.linkDialog.showModal();
    els.lSearch.focus();
  }

  function renderPicker() {
    const q = els.lSearch.value.trim().toLowerCase();
    const items = [
      ...FIXED_PAGES.map(([title, p]) => ({ title, sub: /^https?:/.test(p) ? p : p, href: relFromArticle(p), external: /^https?:/.test(p) })),
      ...articles.filter((a) => !a.draft && (!current || a.path !== current.path)).map((a) => ({ title: a.title, sub: `${categories[a.category] || ''}　${a.url}`, href: relFromArticle(a.url) }))
    ].filter((i) => !q || `${i.title} ${i.sub}`.toLowerCase().includes(q)).slice(0, q ? 40 : 12);
    els.lResults.innerHTML = items.map((i) => `<li><button type="button" data-href="${escapeHtml(i.href)}" data-external="${i.external ? 1 : ''}"><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.sub)}</small></button></li>`).join('') || '<li class="ae-list__empty">見つかりません</li>';
  }

  function restoreLinkRange() {
    if (!linkRange) return;
    if (linkEdit) linkEdit.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(linkRange);
  }

  function applyLink(e) {
    e.preventDefault();
    const url = els.lUrl.value.trim();
    if (!url) return;
    const blank = els.lBlank.checked;
    els.linkDialog.close(); // モーダルを閉じてから本文を操作する（開いたままだと本文を書き換えられない）
    let targets = [];
    if (linkAnchor) targets = [linkAnchor];
    else {
      restoreLinkRange();
      const marker = `#ae-link-${Date.now()}`;
      document.execCommand('createLink', false, marker);
      targets = $$(`a[href="${marker}"]`, els.blocks);
    }
    targets.forEach((a) => {
      a.setAttribute('href', url);
      if (blank) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
    });
    if (!targets.length) { toast('リンクを付けられませんでした。文字を選び直してください', true); return; }
    markDirty();
  }

  function removeLink() {
    if (linkAnchor) {
      const frag = document.createDocumentFragment();
      while (linkAnchor.firstChild) frag.appendChild(linkAnchor.firstChild);
      linkAnchor.replaceWith(frag);
      markDirty();
    }
    els.linkDialog.close();
  }

  function runFormat(cmd) {
    const target = activeEditable();
    if (!target) { toast('本文の文字を選択してから押してください', true); return; }
    if (cmd === 'link') { openLinkDialog(); return; }
    if (cmd === 'bold') document.execCommand('bold');
    if (cmd === 'unlink') document.execCommand('unlink');
    if (cmd === 'clear') document.execCommand('removeFormat');
    markDirty();
    positionBubble();
  }

  /* ---------------- イベント ---------------- */

  function bindEvents() {
    $$('#bubble button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault()); // 選択範囲を保つ
      b.addEventListener('click', () => runFormat(b.dataset.cmd));
    });
    document.addEventListener('selectionchange', () => requestAnimationFrame(positionBubble));
    window.addEventListener('scroll', () => { if (!els.bubble.hidden) positionBubble(); }, { passive: true });

    els.tabList.addEventListener('click', () => showTab('list'));
    els.tabOutline.addEventListener('click', () => showTab('outline'));
    els.listSearch.addEventListener('input', renderList);
    els.listFilter.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      listFilter = b.dataset.filter;
      renderFilter();
      renderList();
    });
    els.articleList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-path]');
      if (b) switchArticle(b.dataset.path);
    });

    els.saveBtn.addEventListener('click', save);
    els.previewBtn.addEventListener('click', preview);
    els.historyBtn.addEventListener('click', () => openHistory().catch((err) => toast(err.message, true)));
    els.historyList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-restore]');
      if (b) restore(b.dataset.restore, b.previousElementSibling.textContent);
    });
    els.newBtn.addEventListener('click', openNewDialog);
    els.newForm.addEventListener('submit', submitNew);
    els.nTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); els.nSlug.focus(); } });
    els.linkForm.addEventListener('submit', applyLink);
    els.lRemove.addEventListener('click', removeLink);
    els.lSearch.addEventListener('input', renderPicker);
    els.lSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) e.preventDefault(); });
    els.lResults.addEventListener('click', (e) => {
      const b = e.target.closest('[data-href]');
      if (!b) return;
      els.lUrl.value = b.dataset.href;
      els.lBlank.checked = Boolean(b.dataset.external);
      els.lUrl.focus();
    });
    $$('.ae-dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

    els.addChapterBtn.addEventListener('click', () => {
      const h2 = insertRow('h2', null, false);
      insertRow('p', h2, false);
      focusRow(h2);
    });

    [els.lead, els.en, els.seoTitle, els.description, els.published, els.tags].forEach((f) => f.addEventListener('input', markDirty));
    els.isPublic.addEventListener('change', markDirty);
    els.lead.addEventListener('input', autosizeLead);
    els.lead.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) e.preventDefault(); });
    [els.seoTitle, els.description].forEach((f) => f.addEventListener('input', updateSeo));
    els.listingFields.addEventListener('input', markDirty);
    els.listingFields.addEventListener('change', markDirty);
    els.h1.addEventListener('input', () => {
      const next = els.h1.value;
      // SEOタイトルに記事タイトルが含まれていれば連動させる
      if (lastH1 && els.seoTitle.value.includes(lastH1)) els.seoTitle.value = els.seoTitle.value.replace(lastH1, next);
      lastH1 = next;
      els.docTitle.textContent = next;
      updateSeo();
      markDirty();
    });

    els.eyecatchUpload.addEventListener('click', () => pickImage((src) => { eyecatch = src; renderEyecatch(); markDirty(); }));
    els.eyecatchClear.addEventListener('click', () => { eyecatch = ''; renderEyecatch(); markDirty(); });
    els.fileInput.addEventListener('change', async () => {
      const file = els.fileInput.files[0];
      const cb = pickCallback;
      pickCallback = null;
      if (!file || !cb) return;
      try { cb(await uploadFile(file)); } catch (err) { toast(`画像を追加できませんでした：${err.message}`, true); setStatus(''); }
    });

    els.blocks.addEventListener('input', (e) => {
      markDirty();
      const row = e.target.closest('.ae-block');
      if (row && /^h[2-4]$/.test(row.dataset.type)) renderOutline();
    });

    els.blocks.addEventListener('change', (e) => {
      if (!e.target.classList.contains('ae-type')) return;
      const row = convertRow(e.target.closest('.ae-block'), e.target.value);
      refreshStructure();
      markDirty();
      focusRow(row);
    });

    els.blocks.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      e.stopPropagation();
      const row = btn.closest('.ae-block');
      const tbody = row && $('table tbody', row);
      switch (btn.dataset.act) {
        case 'up': moveRow(row, -1); break;
        case 'down': moveRow(row, 1); break;
        case 'more': openRowMenu(btn.parentElement, row); break;
        case 'insert': openInsertMenu(btn.parentElement, row); break;
        case 'img-pick': pickImage((src) => setRowImage(row, src)); break;
        case 'row-add': {
          const last = $$('tr', tbody).pop();
          const cells = last ? $$(':scope > th, :scope > td:not(.ae-table__ctl)', last).map((c) => ({ tag: c.tagName.toLowerCase(), html: '' })) : [{ tag: 'th', html: '' }, { tag: 'td', html: '' }];
          const tr = tableRow(cells);
          tbody.appendChild(tr);
          tr.firstElementChild.focus();
          markDirty();
          break;
        }
        case 'row-del': {
          const tr = btn.closest('tr');
          if ($$('tr', row).length <= 1) { toast('表には1行以上必要です。表ごと消すときは「…」から削除してください', true); return; }
          tr.remove();
          markDirty();
          break;
        }
        case 'col-add':
          $$('tr', row).forEach((tr) => {
            const cell = document.createElement(tr.parentElement.tagName === 'THEAD' ? 'th' : 'td');
            cell.className = 'ae-edit ae-cell';
            cell.contentEditable = 'true';
            tr.insertBefore(cell, $('.ae-table__ctl', tr));
          });
          markDirty();
          break;
        case 'col-del':
          if ($$(':scope > th, :scope > td:not(.ae-table__ctl)', $('tr', row)).length <= 1) { toast('列は1つ以上必要です', true); return; }
          $$('tr', row).forEach((tr) => { const cells = $$(':scope > th, :scope > td:not(.ae-table__ctl)', tr); cells[cells.length - 1].remove(); });
          markDirty();
          break;
        default: break;
      }
    });

    document.addEventListener('click', (e) => { if (!e.target.closest('.ae-menu')) closeMenus(); });

    // 段落内の Enter は改行（<br>）にする。箇条書きは Enter で次の項目。見出しで Enter を押すと下に段落を足す
    els.blocks.addEventListener('keydown', (e) => {
      const edit = e.target.closest && e.target.closest('.ae-edit');
      if (!edit || e.key !== 'Enter' || e.isComposing) return;
      const row = edit.closest('.ae-block');
      if (TYPES[row.dataset.type].kind === 'list') return;
      e.preventDefault();
      if (/^h[2-4]$/.test(row.dataset.type) || e.ctrlKey || e.metaKey) { insertRow('p', row); return; }
      document.execCommand('insertLineBreak');
    });

    // 貼り付けは書式なしテキストとして扱う
    els.blocks.addEventListener('paste', (e) => {
      const edit = e.target.closest && e.target.closest('.ae-edit');
      if (!edit) return;
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });

    // 画像ファイルを本文にドロップすると、その位置に画像ブロックを追加
    els.blocks.addEventListener('dragover', (e) => { if (!dragRow && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    els.blocks.addEventListener('drop', async (e) => {
      if (dragRow) return;
      const file = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type));
      if (!file) return;
      e.preventDefault();
      const after = e.target.closest('.ae-block');
      const row = createRow('image');
      if (after) after.after(row); else els.blocks.appendChild(row);
      refreshStructure();
      try { setRowImage(row, await uploadFile(file)); } catch (err) { row.remove(); refreshStructure(); toast(`画像を追加できませんでした：${err.message}`, true); }
    });

    // ブロックの並べ替え（⋮⋮ をドラッグ）
    els.blocks.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.ae-handle');
      if (handle) handle.closest('.ae-block').draggable = true;
    });
    els.blocks.addEventListener('dragstart', (e) => {
      const row = e.target.closest && e.target.closest('.ae-block');
      if (!row || !row.draggable) return;
      dragRow = row;
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });
    els.blocks.addEventListener('dragover', (e) => {
      if (!dragRow) return;
      const row = e.target.closest('.ae-block');
      if (!row || row === dragRow) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      $$('.drop-before, .drop-after', els.blocks).forEach((r) => r.classList.remove('drop-before', 'drop-after'));
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    els.blocks.addEventListener('drop', (e) => {
      if (!dragRow) return;
      e.preventDefault();
      const row = e.target.closest('.ae-block');
      if (row && row !== dragRow) {
        if (row.classList.contains('drop-after')) row.after(dragRow);
        else row.before(dragRow);
        refreshStructure();
        markDirty();
      }
    });
    els.blocks.addEventListener('dragend', () => {
      if (dragRow) { dragRow.classList.remove('is-dragging'); dragRow.draggable = false; }
      dragRow = null;
      $$('.drop-before, .drop-after', els.blocks).forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (mod && e.key.toLowerCase() === 'k' && activeEditable()) { e.preventDefault(); openLinkDialog(); }
    });
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      autosave();
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /* ---------------- 起動 ---------------- */

  async function init() {
    buildAddBar();
    bindEvents();
    try {
      const health = await api('/api/health');
      if (!health.ok) throw new Error('編集不可');
    } catch {
      els.offline.hidden = false;
      $$('.ae-top__actions').forEach((el) => { el.hidden = true; });
      return;
    }
    try {
      await loadArticles();
      els.layout.hidden = false;
      const requested = new URLSearchParams(location.search).get('path');
      const first = requested ? requested.replace(/^\/+|\/+$/g, '') : (articles[0] && articles[0].path);
      if (first) await openArticle(first);
    } catch (err) {
      toast(err.message, true);
    }
  }

  init();
})();
