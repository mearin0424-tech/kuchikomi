(() => {
  const TYPES = {
    h2: { label: '章見出し（H2）', tag: 'h2', kind: 'text', placeholder: '章のタイトル' },
    h3: { label: '小見出し（H3）', tag: 'h3', kind: 'text', placeholder: '小見出し' },
    h4: { label: '見出し（H4）', tag: 'h4', kind: 'text', placeholder: '見出し' },
    p: { label: '段落', tag: 'p', kind: 'text', placeholder: '本文を入力' },
    lead: { label: 'リード文（大きめ）', tag: 'p', kind: 'text', attrs: ' style="font-size:17px;color:var(--c-text);line-height:1.95;"', placeholder: '記事冒頭の導入文' },
    note: { label: '補足（小さい文字）', tag: 'p', kind: 'text', attrs: ' class="muted"', className: 'muted', placeholder: '補足・分類など' },
    blockquote: { label: '引用', tag: 'blockquote', kind: 'text', placeholder: '引用文' },
    ul: { label: '箇条書き', tag: 'ul', kind: 'list' },
    ol: { label: '番号付きリスト', tag: 'ol', kind: 'list' },
    html: { label: 'HTML（表など）', kind: 'html' }
  };
  const ADD_TYPES = ['h2', 'h3', 'p', 'ul', 'ol', 'blockquote', 'note', 'lead', 'h4', 'html'];
  const INLINE_TAGS = new Set(['A', 'STRONG', 'EM', 'BR', 'CODE', 'SMALL', 'SPAN', 'MARK', 'SUP', 'SUB']);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const els = {
    articleSelect: $('#articleSelect'), historySelect: $('#historySelect'), restoreBtn: $('#restoreBtn'),
    viewLink: $('#viewLink'), saveBtn: $('#saveBtn'), status: $('#status'), layout: $('#layout'), offline: $('#offline'),
    outline: $('#outline'), blocks: $('#blocks'), addBar: $('#addBar'), addChapterBtn: $('#addChapterBtn'), toast: $('#toast'),
    h1: $('#f-h1'), lead: $('#f-lead'), en: $('#f-en'), seoTitle: $('#f-seoTitle'), description: $('#f-description'),
    descCount: $('#descCount'), listingFields: $('#listingFields')
  };

  let articles = [];
  let current = null;
  let dirty = false;
  let saving = false;
  let dragRow = null;
  let lastH1 = '';

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

  function markDirty() {
    if (!current) return;
    dirty = true;
    els.saveBtn.disabled = false;
    els.status.classList.add('is-dirty');
    setStatus('未保存の変更があります（Ctrl+S で保存）');
  }

  function markClean(text) {
    dirty = false;
    els.saveBtn.disabled = !current;
    els.status.classList.remove('is-dirty');
    setStatus(text || '');
  }

  /* ---------------- HTML → ブロック ---------------- */

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
      if (node.nodeType === Node.COMMENT_NODE) {
        blocks.push({ type: 'html', html: `<!--${node.data}-->` });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      const attrCount = node.attributes.length;
      let type = null;
      if (['h2', 'h3', 'h4', 'p', 'blockquote', 'ul', 'ol'].includes(tag) && attrCount === 0) type = tag;
      else if (tag === 'p' && attrCount === 1 && node.getAttribute('class') === 'muted') type = 'note';
      else if (tag === 'p' && attrCount === 1 && /font-size:\s*17px/.test(node.getAttribute('style') || '')) type = 'lead';
      if ((type === 'ul' || type === 'ol') && [...node.children].some((c) => c.tagName !== 'LI' || c.attributes.length)) type = null;
      blocks.push(type ? { type, html: node.innerHTML.trim() } : { type: 'html', html: node.outerHTML });
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

  function innerOf(el) {
    const clone = el.cloneNode(true);
    return sanitizeInline(clone);
  }

  const isBlank = (html) => !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;|\s/g, '');

  function listItems(listEl) {
    const items = $$(':scope > li', listEl).map((li) => innerOf(li)).filter((h) => !isBlank(h));
    // li の外に直接入力された文字も拾う
    const stray = [...listEl.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).map((n) => escapeHtml(n.textContent.trim()));
    return items.concat(stray);
  }

  function rowToHtml(row) {
    const type = row.dataset.type;
    const def = TYPES[type];
    if (def.kind === 'html') {
      const value = $('.ae-html', row).value.trim();
      return value ? value.split('\n').map((line) => (line.trim() ? `          ${line.replace(/^\s{0,10}/, '')}` : '')).join('\n') : '';
    }
    const editEl = $('.ae-edit', row);
    if (def.kind === 'list') {
      const items = listItems(editEl);
      if (!items.length) return '';
      return `          <${def.tag}${def.attrs || ''}>\n${items.map((h) => `            <li>${h}</li>`).join('\n')}\n          </${def.tag}>`;
    }
    const inner = innerOf(editEl);
    if (isBlank(inner)) return '';
    return `          <${def.tag}${def.attrs || ''}>${inner}</${def.tag}>`;
  }

  function serializeBody() {
    const parts = [];
    rows().forEach((row) => {
      const html = rowToHtml(row);
      if (!html) return;
      const isHeading = /^h[2-4]$/.test(row.dataset.type);
      if (parts.length && isHeading) parts.push('');
      parts.push(html);
    });
    return parts.join('\n');
  }

  /* ---------------- ブロックの描画 ---------------- */

  const rows = () => $$(':scope > .ae-block', els.blocks);

  function typeSelectHtml(selected) {
    return Object.entries(TYPES).map(([key, def]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${def.label}</option>`).join('');
  }

  function createEditor(type, html) {
    const def = TYPES[type];
    if (def.kind === 'html') {
      const ta = document.createElement('textarea');
      ta.className = 'ae-html';
      ta.spellcheck = false;
      ta.value = html || '';
      ta.placeholder = '<table>…</table> などのHTMLをそのまま記述できます';
      return ta;
    }
    const el = document.createElement(def.tag);
    el.className = `ae-edit${def.className ? ` ${def.className}` : ''}`;
    el.contentEditable = 'true';
    if (def.kind === 'list') {
      el.innerHTML = html && /<li[\s>]/i.test(html) ? html : '<li><br></li>';
    } else {
      el.innerHTML = html || '';
      el.dataset.placeholder = def.placeholder || '';
    }
    return el;
  }

  function createRow(type, html) {
    const row = document.createElement('div');
    row.className = 'ae-block';
    row.dataset.type = type;
    row.innerHTML = `
      <button type="button" class="ae-handle" title="ドラッグして移動" aria-label="ドラッグして移動">⋮⋮</button>
      <div class="ae-block__main">
        <div class="ae-block__head">
          <select class="ae-type" aria-label="ブロックの種類">${typeSelectHtml(type)}</select>
          <span class="ae-chapter"></span>
          <span class="spacer"></span>
          <button type="button" data-act="up" title="1つ上へ">▲</button>
          <button type="button" data-act="down" title="1つ下へ">▼</button>
          <button type="button" data-act="chapter-up" title="この章（次の章見出しまで）をまとめて上へ">章ごと▲</button>
          <button type="button" data-act="chapter-down" title="この章（次の章見出しまで）をまとめて下へ">章ごと▼</button>
          <button type="button" data-act="dup" title="複製">複製</button>
          <button type="button" data-act="del" class="is-danger" title="このブロックを削除">削除</button>
          <button type="button" data-act="chapter-del" class="is-danger" title="この章を本文ごと削除">章ごと削除</button>
        </div>
        <div class="ae-block__body"></div>
      </div>
      <div class="ae-insert" style="grid-column:1/-1"><button type="button" data-act="insert">＋ ここに追加</button></div>`;
    $('.ae-block__body', row).appendChild(createEditor(type, html));
    return row;
  }

  // 種類変更時に内容をできるだけ引き継ぐ
  function convertRow(row, newType) {
    const oldType = row.dataset.type;
    const oldDef = TYPES[oldType];
    const newDef = TYPES[newType];
    let html = '';
    if (oldDef.kind === 'html') {
      html = $('.ae-html', row).value;
      if (newDef.kind !== 'html') {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const list = tmp.querySelector('ul,ol');
        html = newDef.kind === 'list' && list ? list.innerHTML : sanitizeInline(tmp);
      }
    } else {
      const editEl = $('.ae-edit', row);
      if (newDef.kind === 'html') {
        html = rowToHtml(row).replace(/^ {10}/gm, '');
      } else if (oldDef.kind === 'list' && newDef.kind === 'text') {
        html = listItems(editEl).join('<br>');
      } else if (oldDef.kind === 'text' && newDef.kind === 'list') {
        html = innerOf(editEl).split(/<br\s*\/?>/i).filter((h) => !isBlank(h)).map((h) => `<li>${h.trim()}</li>`).join('');
      } else if (oldDef.kind === 'list') {
        html = listItems(editEl).map((h) => `<li>${h}</li>`).join('');
      } else {
        html = innerOf(editEl);
      }
    }
    const body = $('.ae-block__body', row);
    body.innerHTML = '';
    body.appendChild(createEditor(newType, html));
    row.dataset.type = newType;
  }

  function renderBlocks(blocks) {
    els.blocks.innerHTML = '';
    blocks.forEach((b) => els.blocks.appendChild(createRow(b.type, b.html)));
    if (!blocks.length) els.blocks.appendChild(createRow('p', ''));
    refreshStructure();
  }

  function insertRow(type, afterRow, focus = true) {
    const row = createRow(type, '');
    if (afterRow) afterRow.after(row);
    else els.blocks.appendChild(row);
    refreshStructure();
    markDirty();
    if (focus) focusRow(row);
    return row;
  }

  function focusRow(row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = $('.ae-edit, .ae-html', row);
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

  // 章 = H2 から次の H2 の直前まで
  function chapterOf(row) {
    const all = rows();
    const start = all.indexOf(row);
    let end = start + 1;
    while (end < all.length && all[end].dataset.type !== 'h2') end += 1;
    return all.slice(start, end);
  }

  function chapterStarts() {
    return rows().filter((r) => r.dataset.type === 'h2');
  }

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
    const starts = chapterStarts();
    let chapterNo = 0;
    all.forEach((row, i) => {
      const isH2 = row.dataset.type === 'h2';
      if (isH2) chapterNo += 1;
      $('.ae-chapter', row).textContent = isH2 ? `第${chapterNo}章` : '';
      $('[data-act="up"]', row).disabled = i === 0;
      $('[data-act="down"]', row).disabled = i === all.length - 1;
      $('[data-act="chapter-up"]', row).hidden = !isH2;
      $('[data-act="chapter-down"]', row).hidden = !isH2;
      $('[data-act="chapter-del"]', row).hidden = !isH2;
      if (isH2) {
        const idx = starts.indexOf(row);
        $('[data-act="chapter-up"]', row).disabled = idx === 0;
        $('[data-act="chapter-down"]', row).disabled = idx === starts.length - 1;
      }
    });
    renderOutline();
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
      items.push({ level: type, text, row, no: type === 'h2' ? chapterNo : null, starts });
    });

    els.outline.innerHTML = '';
    if (!items.length) {
      els.outline.innerHTML = '<li class="lv-intro"><a>見出しがありません</a></li>';
      return;
    }
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
        const idx = item.starts.indexOf(item.row);
        const up = document.createElement('button');
        up.type = 'button'; up.textContent = '▲'; up.title = '章ごと上へ'; up.disabled = idx === 0;
        up.addEventListener('click', () => moveChapter(item.row, -1));
        const down = document.createElement('button');
        down.type = 'button'; down.textContent = '▼'; down.title = '章ごと下へ'; down.disabled = idx === item.starts.length - 1;
        down.addEventListener('click', () => moveChapter(item.row, 1));
        li.append(up, down);
      }
      els.outline.appendChild(li);
    });
  }

  /* ---------------- 追加メニュー ---------------- */

  function closeMenus() { $$('.ae-menu').forEach((m) => m.remove()); }

  function openInsertMenu(anchor, afterRow) {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'ae-menu';
    ADD_TYPES.forEach((type) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = TYPES[type].label;
      b.addEventListener('click', () => { closeMenus(); insertRow(type, afterRow); });
      menu.appendChild(b);
    });
    anchor.appendChild(menu);
    menu.style.left = '0';
    menu.style.top = '100%';
  }

  function buildAddBar() {
    els.addBar.innerHTML = '<span>末尾に追加：</span>';
    ADD_TYPES.forEach((type) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `＋ ${TYPES[type].label}`;
      b.addEventListener('click', () => insertRow(type, null));
      els.addBar.appendChild(b);
    });
  }

  /* ---------------- 基本情報 ---------------- */

  function renderListing(listing) {
    const box = els.listingFields;
    box.innerHTML = '';
    box.hidden = !listing;
    if (!listing) return;
    if (listing.kind === 'banner') {
      box.innerHTML = '<span>一覧ページの紹介文</span><textarea id="f-listing-sub" rows="2"></textarea>';
      $('#f-listing-sub').value = listing.sub || '';
    } else if (listing.kind === 'news') {
      box.innerHTML = `<span>一覧ページの日付・分類</span>
        <div class="ae-field--pair">
          <input type="text" id="f-listing-date" placeholder="2026.06.20" autocomplete="off">
          <select id="f-listing-tag">${(listing.tags || []).map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>
        </div>`;
      $('#f-listing-date').value = listing.date || '';
      $('#f-listing-tag').value = listing.tag || '';
    }
  }

  function collectListing() {
    if (!current || !current.listing) return null;
    if (current.listing.kind === 'banner') return { kind: 'banner', sub: $('#f-listing-sub').value };
    return { kind: 'news', date: $('#f-listing-date').value.trim(), tag: $('#f-listing-tag').value };
  }

  function updateDescCount() {
    const n = els.description.value.trim().length;
    els.descCount.textContent = `${n}文字（目安 80〜120文字）`;
    els.descCount.classList.toggle('is-over', n > 140);
  }

  /* ---------------- 読み込み・保存 ---------------- */

  async function loadArticles() {
    const data = await api('/api/articles');
    articles = data.articles;
    const groups = {};
    articles.forEach((a) => { (groups[a.categoryLabel] = groups[a.categoryLabel] || []).push(a); });
    els.articleSelect.innerHTML = '<option value="">記事を選択してください</option>' + Object.entries(groups).map(([label, list]) =>
      `<optgroup label="${escapeHtml(label)}">${list.map((a) => `<option value="${escapeHtml(a.path)}">${escapeHtml(a.title)}</option>`).join('')}</optgroup>`
    ).join('');
    if (current) els.articleSelect.value = current.path;
  }

  async function loadHistory() {
    if (!current) return;
    const data = await api(`/api/history?path=${encodeURIComponent(current.url)}`);
    els.historySelect.innerHTML = `<option value="">変更履歴（${data.history.length}件）</option>` +
      data.history.map((h) => `<option value="${h.id}">${h.label} の保存前</option>`).join('');
  }

  async function openArticle(articlePath) {
    const data = await api(`/api/article?path=${encodeURIComponent(articlePath)}`);
    current = data;
    els.h1.value = data.h1;
    els.lead.value = data.lead;
    els.en.value = data.en;
    els.seoTitle.value = data.seoTitle;
    els.description.value = data.description;
    lastH1 = data.h1;
    renderListing(data.listing);
    updateDescCount();
    renderBlocks(parseBlocks(data.bodyHtml));
    els.viewLink.href = data.url;
    els.articleSelect.value = data.path;
    document.title = `${data.h1}｜記事エディタ`;
    history.replaceState(null, '', `?path=${encodeURIComponent(data.path)}`);
    els.layout.hidden = false;
    markClean(`「${data.h1}」を編集中`);
    await loadHistory();
  }

  async function save() {
    if (!current || saving) return;
    const h1 = els.h1.value.trim();
    if (!h1) { toast('記事タイトルを入力してください', true); els.h1.focus(); return; }
    saving = true;
    els.saveBtn.disabled = true;
    setStatus('保存中…');
    try {
      const result = await api('/api/article', {
        method: 'POST',
        body: JSON.stringify({
          path: current.path,
          h1,
          lead: els.lead.value,
          en: els.en.value,
          seoTitle: els.seoTitle.value,
          description: els.description.value,
          bodyHtml: serializeBody(),
          listing: collectListing()
        })
      });
      current.h1 = h1;
      lastH1 = h1;
      const extra = result.linkedFiles.length ? `／サイト内リンク ${result.linkedFiles.length}ファイルのタイトルも更新` : '';
      markClean(`保存しました（${new Date().toLocaleTimeString('ja-JP')}）${extra}`);
      toast(`HPに反映しました${extra}`);
      await Promise.all([loadArticles(), loadHistory()]);
    } catch (err) {
      toast(`保存できませんでした：${err.message}`, true);
      markDirty();
    } finally {
      saving = false;
    }
  }

  async function restore() {
    const id = els.historySelect.value;
    if (!current || !id) { toast('復元する履歴を選択してください', true); return; }
    const label = els.historySelect.selectedOptions[0].textContent;
    if (!confirm(`「${label}」の状態に記事を戻します。現在の状態も履歴に残ります。よろしいですか？`)) return;
    try {
      await api('/api/restore', { method: 'POST', body: JSON.stringify({ path: current.url, id }) });
      await openArticle(current.path);
      await loadArticles();
      toast('履歴から復元し、HPに反映しました');
    } catch (err) {
      toast(`復元できませんでした：${err.message}`, true);
    }
  }

  /* ---------------- 書式ボタン ---------------- */

  function activeEditable() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return el ? el.closest('.ae-edit') : null;
  }

  function runFormat(cmd) {
    const target = activeEditable();
    if (!target) { toast('本文の文字を選択してから押してください', true); return; }
    if (cmd === 'bold') document.execCommand('bold');
    if (cmd === 'unlink') document.execCommand('unlink');
    if (cmd === 'clear') document.execCommand('removeFormat');
    if (cmd === 'link') {
      if (window.getSelection().isCollapsed) { toast('リンクにする文字を選択してください', true); return; }
      const url = prompt('リンク先のURLまたはパスを入力してください（例: ../../contact/）', 'https://');
      if (!url) return;
      document.execCommand('createLink', false, url.trim());
    }
    markDirty();
  }

  /* ---------------- イベント ---------------- */

  function bindEvents() {
    $$('.ae-top__format button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault()); // 選択範囲を保つ
      b.addEventListener('click', () => runFormat(b.dataset.cmd));
    });

    els.articleSelect.addEventListener('change', async () => {
      const next = els.articleSelect.value;
      if (!next || (current && next === current.path)) return;
      if (dirty && !confirm('未保存の変更があります。破棄して別の記事を開きますか？')) {
        els.articleSelect.value = current ? current.path : '';
        return;
      }
      try { await openArticle(next); } catch (err) { toast(err.message, true); }
    });

    els.saveBtn.addEventListener('click', save);
    els.restoreBtn.addEventListener('click', restore);
    els.addChapterBtn.addEventListener('click', () => {
      const h2 = insertRow('h2', null, false);
      insertRow('p', h2, false);
      focusRow(h2);
    });

    [els.lead, els.en, els.seoTitle, els.description].forEach((f) => f.addEventListener('input', markDirty));
    els.description.addEventListener('input', updateDescCount);
    els.listingFields.addEventListener('input', markDirty);
    els.listingFields.addEventListener('change', markDirty);
    els.h1.addEventListener('input', () => {
      const next = els.h1.value;
      // SEOタイトルに記事タイトルが含まれていれば連動させる
      if (lastH1 && els.seoTitle.value.includes(lastH1)) els.seoTitle.value = els.seoTitle.value.replace(lastH1, next);
      lastH1 = next;
      markDirty();
    });

    els.blocks.addEventListener('input', (e) => {
      markDirty();
      if (e.target.closest('.ae-block') && /^h[2-4]$/.test(e.target.closest('.ae-block').dataset.type)) renderOutline();
    });

    els.blocks.addEventListener('change', (e) => {
      if (!e.target.classList.contains('ae-type')) return;
      const row = e.target.closest('.ae-block');
      convertRow(row, e.target.value);
      refreshStructure();
      markDirty();
    });

    els.blocks.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = btn.closest('.ae-block');
      switch (btn.dataset.act) {
        case 'up': moveRow(row, -1); break;
        case 'down': moveRow(row, 1); break;
        case 'chapter-up': moveChapter(row, -1); break;
        case 'chapter-down': moveChapter(row, 1); break;
        case 'dup': {
          const copy = createRow(row.dataset.type, '');
          const body = $('.ae-block__body', copy);
          body.innerHTML = '';
          body.appendChild($('.ae-block__body', row).firstElementChild.cloneNode(true));
          if (row.dataset.type === 'html') $('.ae-html', copy).value = $('.ae-html', row).value;
          row.after(copy);
          refreshStructure();
          markDirty();
          break;
        }
        case 'del': {
          const isChapter = row.dataset.type === 'h2' && chapterOf(row).length > 1;
          const message = isChapter
            ? 'この章見出しだけを削除します（章の本文は残り、前の章に含まれます）。よろしいですか？'
            : 'このブロックを削除しますか？';
          if (!isBlank(rowToHtml(row)) && !confirm(message)) return;
          row.remove();
          if (!rows().length) els.blocks.appendChild(createRow('p', ''));
          refreshStructure();
          markDirty();
          break;
        }
        case 'chapter-del': {
          const chapter = chapterOf(row);
          if (!confirm(`この章（見出しと本文 ${chapter.length} ブロック）をまとめて削除しますか？`)) return;
          chapter.forEach((r) => r.remove());
          if (!rows().length) els.blocks.appendChild(createRow('p', ''));
          refreshStructure();
          markDirty();
          break;
        }
        case 'insert': openInsertMenu(btn.parentElement, row); break;
        default: break;
      }
    });

    document.addEventListener('click', (e) => { if (!e.target.closest('.ae-menu, [data-act="insert"]')) closeMenus(); });

    // 段落内の Enter は改行（<br>）にする。箇条書きは Enter で次の項目
    els.blocks.addEventListener('keydown', (e) => {
      const edit = e.target.closest && e.target.closest('.ae-edit');
      if (!edit || e.key !== 'Enter' || e.isComposing) return;
      const row = edit.closest('.ae-block');
      if (TYPES[row.dataset.type].kind === 'list') return;
      e.preventDefault();
      if (/^h[2-4]$/.test(row.dataset.type)) { insertRow('p', row); return; }
      if (e.ctrlKey || e.metaKey) { insertRow('p', row); return; }
      document.execCommand('insertLineBreak');
    });

    // 貼り付けは書式なしテキストとして扱う
    els.blocks.addEventListener('paste', (e) => {
      const edit = e.target.closest && e.target.closest('.ae-edit');
      if (!edit) return;
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // ドラッグ&ドロップで並べ替え
    els.blocks.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.ae-handle');
      if (handle) handle.closest('.ae-block').draggable = true;
    });
    els.blocks.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.ae-block');
      if (!row || !row.draggable) { e.preventDefault(); return; }
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
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
      $$('.ae-top__format, .ae-top__actions, .ae-top__select').forEach((el) => { el.hidden = true; });
      return;
    }
    try {
      await loadArticles();
      const requested = new URLSearchParams(location.search).get('path');
      const first = requested ? requested.replace(/^\/+|\/+$/g, '') : (articles[0] && articles[0].path);
      if (first) await openArticle(first);
    } catch (err) {
      toast(err.message, true);
    }
  }

  init();
})();
