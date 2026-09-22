/* コラム投稿機能
 * - /column/post/    : 記事の作成・編集（ビジュアルエディタ / HTML直接編集・インポート）＋分類・タグ
 * - /column/article/ : ?id= で投稿記事を表示（分類・タグを表示）
 * - /column/         : 投稿記事の一覧 ＋ 分類タブ・タグ・キーワード検索で絞り込み
 * 保存先はブラウザの localStorage。別環境へは JSON エクスポート/インポートで受け渡す。
 */
(() => {
  const KEY = 'kcc-column:posts';
  // 記事の4分類（この順で表示）
  const CATEGORIES = ['お役立ち記事', '用語解説', '事例紹介', 'コラム・その他'];
  const DEFAULT_CAT = CATEGORIES[0];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const load = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.map(normalize) : [];
    } catch { return []; }
  };
  const store = (posts) => localStorage.setItem(KEY, JSON.stringify(posts));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => (iso || '').replace(/-/g, '.');
  const sortByDate = (posts) => [...posts].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  // 旧データ互換: カテゴリを4分類へ寄せ、tagsを配列に整える
  function normalize(p) {
    if (!p || typeof p !== 'object') return p;
    let cat = p.category;
    if (!CATEGORIES.includes(cat)) {
      const map = { '成功事例': '事例紹介', 'IT法務': 'お役立ち記事', '予防と対策': 'お役立ち記事', 'リスクマネジメント': 'お役立ち記事', 'お知らせ': 'コラム・その他', 'コラム': 'コラム・その他' };
      cat = map[cat] || DEFAULT_CAT;
    }
    let tags = p.tags;
    if (!Array.isArray(tags)) tags = typeof tags === 'string' ? tags.split(',') : [];
    tags = tags.map((t) => String(t).trim()).filter(Boolean);
    return { ...p, category: cat, tags };
  }

  // インポートHTMLの無害化: script除去・イベント属性除去・javascript:リンク除去
  function sanitize(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script').forEach((el) => el.remove());
    tpl.content.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                 attr.value.trim().toLowerCase().startsWith('javascript:')) el.removeAttribute(attr.name);
      });
    });
    return tpl.innerHTML;
  }
  const plain = (html) => { const t = document.createElement('template'); t.innerHTML = String(html || ''); return (t.content.textContent || '').replace(/\s+/g, ' ').trim(); };

  /* ---------- /column/ 一覧: 投稿記事の表示 + 絞り込み ---------- */
  function initList() {
    const wrap = $('[data-user-posts]');
    if (!wrap) return;
    const allPosts = sortByDate(load());
    if (!allPosts.length) return;
    wrap.hidden = false;

    const listEl = $('#userPostList', wrap);
    const emptyEl = $('[data-filter-empty]', wrap);
    const catsEl = $('[data-filter-cats]', wrap);
    const tagsEl = $('[data-filter-tags]', wrap);
    const searchEl = $('[data-filter-search]', wrap);

    const params = new URLSearchParams(location.search);
    let activeCat = CATEGORIES.includes(params.get('cat')) ? params.get('cat') : 'all';
    const activeTags = new Set((params.get('tag') ? [params.get('tag')] : []).filter(Boolean));
    if (searchEl && params.get('q')) searchEl.value = params.get('q');

    // 分類タブ（件数付き）
    function renderCats() {
      const count = (c) => allPosts.filter((p) => c === 'all' || p.category === c).length;
      const tab = (c, label) => `<button type="button" class="post-filter__cat${activeCat === c ? ' is-active' : ''}" data-cat="${esc(c)}">${esc(label)}<span>${count(c)}</span></button>`;
      catsEl.innerHTML = tab('all', 'すべて') + CATEGORIES.map((c) => tab(c, c)).join('');
    }
    // タグ一覧（出現するタグを集計）
    function renderTags() {
      const set = new Map();
      allPosts.forEach((p) => p.tags.forEach((t) => set.set(t, (set.get(t) || 0) + 1)));
      const tags = [...set.keys()].sort((a, b) => a.localeCompare(b, 'ja'));
      if (!tags.length) { tagsEl.hidden = true; return; }
      tagsEl.hidden = false;
      tagsEl.innerHTML = '<span class="post-filter__tags-label">タグ:</span>' +
        tags.map((t) => `<button type="button" class="post-filter__tag${activeTags.has(t) ? ' is-active' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
    }

    function render() {
      const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
      const filtered = allPosts.filter((p) => {
        if (activeCat !== 'all' && p.category !== activeCat) return false;
        for (const t of activeTags) if (!p.tags.includes(t)) return false;
        if (q) {
          const hay = [p.title, p.summary, p.category, p.tags.join(' '), plain(p.html)].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      listEl.innerHTML = filtered.map((p) => `
        <div class="news-item">
          <time>${esc(fmtDate(p.date))}</time>
          <span class="tag tag--column">${esc(p.category)}</span>
          <a href="article/?id=${encodeURIComponent(p.id)}">${esc(p.title)}</a>
          ${p.tags.length ? `<span class="news-item__tags">${p.tags.map((t) => `<span class="mini-tag">#${esc(t)}</span>`).join('')}</span>` : ''}
        </div>`).join('');
      if (emptyEl) emptyEl.hidden = filtered.length > 0;
      // タブ・タグのアクティブ状態を更新
      $$('.post-filter__cat', catsEl).forEach((b) => b.classList.toggle('is-active', b.dataset.cat === activeCat));
      $$('.post-filter__tag', tagsEl).forEach((b) => b.classList.toggle('is-active', activeTags.has(b.dataset.tag)));
    }

    catsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      activeCat = b.dataset.cat; render();
    });
    tagsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]'); if (!b) return;
      const t = b.dataset.tag;
      if (activeTags.has(t)) activeTags.delete(t); else activeTags.add(t);
      render();
    });
    if (searchEl) searchEl.addEventListener('input', render);

    renderCats();
    renderTags();
    render();
  }

  /* ---------- /column/article/ 記事表示 ---------- */
  function initArticle() {
    const bodyEl = $('[data-article-body]');
    if (!bodyEl) return;
    const id = new URLSearchParams(location.search).get('id');
    const post = load().find((p) => p.id === id);
    const titleEl = $('[data-article-title]');
    const metaEl = $('[data-article-meta]');
    const crumbEl = $('[data-article-crumb]');
    const tagsEl = $('[data-article-tags]');
    if (!post) {
      if (titleEl) titleEl.textContent = '記事が見つかりません';
      bodyEl.innerHTML = '<p>お探しの記事は削除されたか、このブラウザには保存されていません。</p><p><a href="../">← コラム一覧へ戻る</a></p>';
      return;
    }
    document.title = `${post.title}｜コラム｜一般社団法人 口コミ対策センター`;
    if (titleEl) titleEl.textContent = post.title;
    if (metaEl) metaEl.textContent = [fmtDate(post.date), post.category].filter(Boolean).join('｜');
    if (crumbEl) crumbEl.textContent = post.title;
    if (tagsEl) {
      const chips = [`<a class="article-cat" href="../?cat=${encodeURIComponent(post.category)}">${esc(post.category)}</a>`]
        .concat(post.tags.map((t) => `<a class="article-tag" href="../?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`));
      tagsEl.innerHTML = chips.join('');
      tagsEl.hidden = false;
    }
    bodyEl.innerHTML = sanitize(post.html);
  }

  /* ---------- /column/post/ 投稿・編集 ---------- */
  function initComposer() {
    const root = $('[data-column-composer]');
    if (!root) return;

    const title = $('#postTitle'), category = $('#postCategory'), date = $('#postDate');
    const summary = $('#postSummary'), visual = $('#postBody'), htmlArea = $('#postHtml');
    const status = $('#composerStatus'), preview = $('#previewArea'), listEl = $('#postList');
    const btnSave = $('#btnSave'), btnPreview = $('#btnPreview');
    const tagInput = $('#postTagInput'), tagChips = $('#postTagChips');
    let editingId = null;
    let activeTab = 'visual';
    let tags = [];

    const today = () => new Date().toISOString().slice(0, 10);
    const setStatus = (t) => { status.textContent = t; };

    /* --- タグ入力（チップ式） --- */
    function renderTags() {
      tagChips.innerHTML = tags.map((t, i) => `<span class="composer-tag">#${esc(t)}<button type="button" data-rm="${i}" aria-label="タグを削除">×</button></span>`).join('');
    }
    function addTag(raw) {
      String(raw).split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => {
        if (!tags.includes(t) && tags.length < 20) tags.push(t);
      });
      renderTags();
    }
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput.value); tagInput.value = ''; }
      else if (e.key === 'Backspace' && !tagInput.value && tags.length) { tags.pop(); renderTags(); }
    });
    tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; } });
    tagChips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      tags.splice(Number(b.dataset.rm), 1); renderTags();
    });

    // 未保存判定用スナップショット
    let savedSnap = '';
    const snapshot = () => JSON.stringify([
      title.value, category.value, date.value, summary.value, tags.join(','),
      activeTab === 'html' ? htmlArea.value : visual.innerHTML,
    ]);
    const markClean = () => { savedSnap = snapshot(); };
    const isDirty = () => snapshot() !== savedSnap;

    // タブ切替（ビジュアル ⇄ HTML を相互同期）
    function setTab(tab) {
      if (tab === activeTab) return;
      if (tab === 'html') htmlArea.value = visual.innerHTML;
      else visual.innerHTML = sanitize(htmlArea.value);
      activeTab = tab;
      $$('.composer-tabs button', root).forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
      $$('[data-pane]', root).forEach((el) => { el.hidden = el.dataset.pane !== tab; });
    }
    $$('.composer-tabs button', root).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

    const currentHtml = () => sanitize(activeTab === 'html' ? htmlArea.value : visual.innerHTML);

    // 書式ツールバー
    $$('.composer-toolbar button', root).forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        visual.focus();
        if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') document.execCommand('formatBlock', false, cmd);
        else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
        else if (cmd === 'link') { const url = prompt('リンク先のURLを入力してください'); if (url) document.execCommand('createLink', false, url); }
        else if (cmd === 'image') { const url = prompt('画像のURLを入力してください'); if (url) document.execCommand('insertImage', false, url); }
        else if (cmd === 'hr') document.execCommand('insertHorizontalRule');
        else document.execCommand(cmd);
      });
    });

    function resetForm() {
      editingId = null;
      title.value = ''; summary.value = ''; category.value = DEFAULT_CAT;
      date.value = today();
      tags = []; renderTags(); tagInput.value = '';
      visual.innerHTML = ''; htmlArea.value = '';
      preview.hidden = true; btnPreview.textContent = 'プレビュー';
      btnSave.textContent = '保存（公開）';
      setStatus('新規記事');
      markClean();
    }

    function renderList() {
      const posts = sortByDate(load());
      listEl.innerHTML = posts.length ? posts.map((p) => `
        <div class="composer-post">
          <div class="composer-post__meta">
            <time>${esc(fmtDate(p.date))}</time>
            <span class="tag tag--column">${esc(p.category)}</span>
          </div>
          <a class="composer-post__title" href="../article/?id=${encodeURIComponent(p.id)}">${esc(p.title)}${p.tags.length ? ` <span class="composer-post__tags">${p.tags.map((t) => '#' + esc(t)).join(' ')}</span>` : ''}</a>
          <span class="composer-post__actions">
            <button type="button" data-act="edit" data-id="${esc(p.id)}">編集</button>
            <button type="button" data-act="del" data-id="${esc(p.id)}" class="is-danger">削除</button>
          </span>
        </div>`).join('') : '<p class="muted">まだ投稿がありません。上のフォームから最初の記事を作成してください。</p>';
    }

    listEl.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-act]');
      if (!btn) return;
      const posts = load();
      const post = posts.find((p) => p.id === btn.dataset.id);
      if (!post) return;
      if (btn.dataset.act === 'del') {
        if (!confirm(`「${post.title}」を削除します。よろしいですか？`)) return;
        store(posts.filter((p) => p.id !== post.id));
        renderList();
        if (editingId === post.id) resetForm();
        setStatus('削除しました');
      } else {
        editingId = post.id;
        title.value = post.title || '';
        category.value = CATEGORIES.includes(post.category) ? post.category : DEFAULT_CAT;
        date.value = post.date || today();
        summary.value = post.summary || '';
        tags = Array.isArray(post.tags) ? [...post.tags] : []; renderTags(); tagInput.value = '';
        visual.innerHTML = sanitize(post.html);
        htmlArea.value = post.html || '';
        btnSave.textContent = '更新を保存';
        setStatus(`編集中: ${post.title}`);
        markClean();
        window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
      }
    });

    btnSave.addEventListener('click', () => {
      if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; }
      const html = currentHtml();
      if (!title.value.trim()) { alert('タイトルを入力してください。'); title.focus(); return; }
      const hasText = html.replace(/<[^>]*>/g, '').trim().length > 0;
      if (!hasText && !/<(img|iframe|video|table)/i.test(html)) { alert('本文を入力してください。'); return; }
      const posts = load();
      const now = new Date().toISOString();
      const fields = {
        title: title.value.trim(),
        category: CATEGORIES.includes(category.value) ? category.value : DEFAULT_CAT,
        date: date.value || today(),
        summary: summary.value.trim(),
        tags: [...tags],
        html,
        updatedAt: now,
      };
      if (editingId && posts.some((p) => p.id === editingId)) {
        Object.assign(posts.find((p) => p.id === editingId), fields);
      } else {
        editingId = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        posts.unshift({ id: editingId, createdAt: now, ...fields });
      }
      store(posts);
      renderList();
      btnSave.textContent = '更新を保存';
      setStatus(`保存しました（${fields.category}／${fmtDate(fields.date)}）。コラム一覧に表示されます。`);
      markClean();
    });

    btnPreview.addEventListener('click', () => {
      if (preview.hidden) {
        const tagHtml = tags.length ? `<p class="composer-preview__tags">${tags.map((t) => '<span class="mini-tag">#' + esc(t) + '</span>').join('')}</p>` : '';
        preview.innerHTML = `<p class="composer-preview__cat">${esc(category.value)}</p><h1 class="composer-preview__title">${esc(title.value || '（無題）')}</h1>${tagHtml}` + currentHtml();
        preview.hidden = false;
        btnPreview.textContent = 'プレビューを閉じる';
        preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        preview.hidden = true;
        btnPreview.textContent = 'プレビュー';
      }
    });

    $('#btnNew').addEventListener('click', () => {
      if (isDirty() && !confirm('未保存の変更を破棄して新規作成しますか？（保存済みの記事は残ります）')) return;
      resetForm();
    });

    // 未保存のままページを離れる場合に警告
    window.addEventListener('beforeunload', (event) => {
      if (isDirty()) { event.preventDefault(); event.returnValue = ''; }
    });

    // HTMLファイル読み込み
    $('#htmlFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      let text = await file.text();
      const m = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (m) text = m[1];
      htmlArea.value = text.trim();
      setStatus(`${file.name} を読み込みました。内容を確認して保存してください。`);
      event.target.value = '';
    });

    // JSONエクスポート/インポート
    $('#btnExport').addEventListener('click', () => {
      const payload = { app: 'kcc-column', exportedAt: new Date().toISOString(), posts: load() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'column-posts.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#importFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const incoming = Array.isArray(data) ? data : data.posts;
        if (!Array.isArray(incoming)) throw new Error('posts配列がありません');
        const posts = load();
        let added = 0, updated = 0;
        incoming.map(normalize).forEach((p) => {
          if (!p || !p.id || !p.title) return;
          const i = posts.findIndex((x) => x.id === p.id);
          if (i >= 0) { posts[i] = p; updated += 1; } else { posts.push(p); added += 1; }
        });
        store(posts);
        renderList();
        setStatus(`インポート完了: 追加 ${added}件 / 更新 ${updated}件`);
      } catch (err) {
        alert('JSONの読み込みに失敗しました: ' + err.message);
      }
      event.target.value = '';
    });

    renderList();
    resetForm();
  }

  const run = () => { initList(); initArticle(); initComposer(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
