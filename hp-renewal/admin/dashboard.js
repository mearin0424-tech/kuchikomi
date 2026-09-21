(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const els = {
    status: $('#status'), setup: $('#setup'), setupForm: $('#setupForm'), endpoint: $('#endpoint'), token: $('#token'),
    message: $('#message'), dashboard: $('#dashboard'), tiles: $('#tiles'), chart: $('#dailyChart'), funnel: $('#funnel'),
    pagesTable: $('#pagesTable'), refTable: $('#refTable'), ctaTable: $('#ctaTable'), recentTable: $('#recentTable'),
    fromDate: $('#fromDate'), toDate: $('#toDate'), tooltip: $('#tooltip'), toast: $('#toast')
  };
  const SERIES = '#044072';
  const METRICS = { views: '閲覧数', sessions: '訪問数', cta: '申込ボタン', submits: '送信完了' };
  const CATEGORY = { column: 'コラム', knowledge: '基礎知識', notice: 'お知らせ' };

  let data = null;
  let metric = 'views';
  let pageFilter = 'article';
  let pageSort = 'views';
  let openPage = null;
  const titles = new Map();

  /* ---------------- 共通 ---------------- */

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isArticle = (p) => /^\/(column|knowledge|notice)\/[^/]+\/$/.test(p);
  const pageTitle = (p) => titles.get(p) || (p === '/' ? 'トップページ' : p);

  async function api(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      const err = new Error(body.error || `通信エラー（${res.status}）`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  let toastTimer;
  function toast(text, isError = false) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    els.toast.classList.toggle('is-error', isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5000);
  }

  function showMessage(html, isError = false) {
    els.message.innerHTML = html;
    els.message.hidden = false;
    els.message.classList.toggle('is-error', isError);
    els.dashboard.hidden = true;
  }

  // 参照元ホスト名を「検索・SNS・外部サイト」などに分類
  function classifyRef(type, ref) {
    if (type === 'direct') return { label: '直接', cls: '', name: 'ブックマーク・URL入力など' };
    if (type === 'campaign') return { label: '広告', cls: 'campaign', name: ref };
    if (type === 'internal') return { label: 'サイト内', cls: 'site', name: pageTitle(ref) };
    if (/(^|\.)google\.|bing\.com$|search\.yahoo|yahoo\.co\.jp$|duckduckgo|ecosia|baidu|naver/.test(ref)) return { label: '検索', cls: 'search', name: ref };
    if (/^(t\.co|x\.com|twitter\.com|.*facebook\.com|l\.facebook\.com|.*instagram\.com|line\.me|.*youtube\.com|.*tiktok\.com|.*threads\.net)$/.test(ref)) return { label: 'SNS', cls: 'sns', name: ref };
    return { label: '外部サイト', cls: '', name: ref };
  }

  /* ---------------- 期間 ---------------- */

  function setDays(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    els.fromDate.value = ymd(from);
    els.toDate.value = ymd(to);
    $$('.db-range [data-days]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days)));
  }

  function daysBetween(from, to) {
    const out = [];
    const d = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (d <= end && out.length < 800) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  /* ---------------- 読み込み ---------------- */

  async function load() {
    els.status.textContent = '集計を取得中…';
    try {
      data = await api(`/api/analytics/stats?from=${els.fromDate.value}&to=${els.toDate.value}`);
    } catch (err) {
      els.status.textContent = '';
      if (err.status === 409) { openSetup(); showMessage('<strong>集計サーバーの接続設定がまだありません。</strong><br>上のフォームに、XServer に設置した <code>backend/stats.php</code> のURLとトークンを入力してください。'); return; }
      showMessage(`<strong>集計データを取得できませんでした。</strong><br>${esc(err.message)}<br>「接続設定」のURL・トークンと、XServer 側の <code>backend/config.php</code> を確認してください。`, true);
      return;
    }
    titles.clear();
    data.pages.forEach((p) => { if (p.title) titles.set(p.path, p.title); });
    els.message.hidden = true;
    els.dashboard.hidden = false;
    openPage = null;
    renderAll();
    els.status.textContent = `${data.from.replace(/-/g, '/')} 〜 ${data.to.replace(/-/g, '/')} の集計（${new Date().toLocaleTimeString('ja-JP')} 取得）`;
  }

  function renderAll() {
    renderTiles();
    renderChart();
    renderFunnel();
    renderPages();
    renderReferrers();
    renderCta();
    renderRecent();
  }

  /* ---------------- 数値タイル ---------------- */

  function renderTiles() {
    const t = data.totals;
    const tiles = [
      { label: '閲覧数', value: t.views, sub: `1訪問あたり ${t.sessions ? (t.views / t.sessions).toFixed(1) : '0'} ページ`, hero: true },
      { label: '訪問数', value: t.sessions, sub: 'タブを開いてから閉じるまでを1訪問' },
      { label: '申込ボタンを押した訪問', value: t.ctaSessions, sub: `訪問の ${pct(t.ctaSessions, t.sessions)}（クリック ${fmt(t.ctaClicks)}回）` },
      { label: 'フォームを開いた訪問', value: t.formSessions, sub: `訪問の ${pct(t.formSessions, t.sessions)}` },
      { label: '送信完了', value: t.submits, sub: `申込率 ${pct(t.submitSessions, t.sessions)}` }
    ];
    els.tiles.innerHTML = tiles.map((x) => `
      <div class="db-tile${x.hero ? ' db-tile--hero' : ''}">
        <div class="db-tile__label">${x.label}</div>
        <div class="db-tile__value">${fmt(x.value)}</div>
        <div class="db-tile__sub">${x.sub}</div>
      </div>`).join('');
  }

  /* ---------------- 日別グラフ（1系列の折れ線＋ホバー） ---------------- */

  // 目盛りが 0/10/20/30/40 のようにきれいな数になる上限（4分割）
  function niceMax(v) {
    const raw = Math.max(1, v / 4);
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && pow >= 10 ? 2.5 : n <= 5 ? 5 : 10) * pow;
    return step * 4;
  }

  function renderChart() {
    const byDay = new Map(data.daily.map((d) => [d.day, d]));
    const rows = daysBetween(data.from, data.to).map((day) => ({ day, views: 0, sessions: 0, cta: 0, submits: 0, ...byDay.get(day) }));
    const values = rows.map((r) => Number(r[metric]) || 0);
    if (!values.some(Boolean)) {
      els.chart.innerHTML = `<p class="db-empty">この期間の「${METRICS[metric]}」の記録はまだありません。</p>`;
      return;
    }
    const W = Math.max(els.chart.clientWidth, 320);
    const H = 240;
    const m = { top: 12, right: 12, bottom: 26, left: 44 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const max = niceMax(Math.max(...values));
    const x = (i) => m.left + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
    const y = (v) => m.top + ih - (v / max) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(rows.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const labelEvery = Math.max(1, Math.ceil(rows.length / Math.floor(iw / 64)));
    const xLabels = rows.map((r, i) => (i % labelEvery === 0 || (i === rows.length - 1 && i % labelEvery > labelEvery / 2) ?`<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${r.day.slice(5).replace('-', '/')}</text>` : '')).join('');
    const last = values.length - 1;

    els.chart.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="日別の${METRICS[metric]}">
        <g class="grid">${ticks.map((t) => `<line x1="${m.left}" x2="${W - m.right}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
        <g class="axis">${ticks.map((t) => `<text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}${xLabels}</g>
        <path d="${area}" fill="${SERIES}" fill-opacity=".1"/>
        <path d="${line}" fill="none" stroke="${SERIES}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(last)}" cy="${y(values[last])}" r="4" fill="${SERIES}" stroke="#fff" stroke-width="2"/>
        <g class="hover" visibility="hidden">
          <line class="hover-line" y1="${m.top}" y2="${m.top + ih}" stroke="#94a3b8" stroke-width="1"/>
          <circle class="hover-dot" r="5" fill="${SERIES}" stroke="#fff" stroke-width="2"/>
        </g>
        <rect x="${m.left}" y="${m.top}" width="${iw}" height="${ih}" fill="transparent" class="hit"/>
      </svg>`;

    const svg = $('svg', els.chart);
    const hover = $('.hover', svg);
    const hit = $('.hit', svg);
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.left) / iw) * (rows.length - 1))));
      const r = rows[i];
      hover.setAttribute('visibility', 'visible');
      $('.hover-line', hover).setAttribute('x1', x(i));
      $('.hover-line', hover).setAttribute('x2', x(i));
      $('.hover-dot', hover).setAttribute('cx', x(i));
      $('.hover-dot', hover).setAttribute('cy', y(values[i]));
      els.tooltip.innerHTML = `<strong>${r.day.replace(/-/g, '/')}</strong>${Object.entries(METRICS).map(([k, label]) => `<div class="${k === metric ? 'is-current' : ''}"><span>${label}</span><span>${fmt(r[k])}</span></div>`).join('')}`;
      els.tooltip.hidden = false;
      const left = Math.min(e.clientX + 14, window.innerWidth - els.tooltip.offsetWidth - 8);
      els.tooltip.style.left = `${left}px`;
      els.tooltip.style.top = `${e.clientY - els.tooltip.offsetHeight - 12}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { hover.setAttribute('visibility', 'hidden'); els.tooltip.hidden = true; });
  }

  /* ---------------- 申し込みまでの流れ ---------------- */

  function renderFunnel() {
    const t = data.totals;
    const steps = [
      { label: '訪問', value: t.sessions },
      { label: '申込ボタンを押した', value: t.ctaSessions },
      { label: 'フォームを開いた', value: t.formSessions },
      { label: '送信完了', value: t.submitSessions }
    ];
    const max = Math.max(1, steps[0].value, ...steps.map((s) => s.value));
    els.funnel.innerHTML = steps.map((s, i) => `
      <div class="db-funnel__row">
        <span class="db-funnel__label">${s.label}</span>
        <span class="db-funnel__track">
          <span class="db-funnel__bar" style="width:${Math.max(0.4, (s.value / max) * 78)}%"></span>
          <span class="db-funnel__value">${fmt(s.value)}${i ? `<small>${pct(s.value, t.sessions)}</small>` : ''}</span>
        </span>
      </div>`).join('');
  }

  /* ---------------- 記事・ページ別 ---------------- */

  function renderPages() {
    const list = data.pages.filter((p) => pageFilter === 'all' || isArticle(p.path));
    list.sort((a, b) => Number(b[pageSort]) - Number(a[pageSort]) || Number(b.views) - Number(a.views));
    const max = Math.max(1, ...list.map((p) => Number(p.views)));
    const head = [['views', '閲覧数'], ['sessions', '訪問数'], ['cta', '申込ボタン'], ['submits', '送信完了']];
    els.pagesTable.innerHTML = `
      <thead><tr><th>ページ</th>${head.map(([k, label]) => `<th class="num"><button type="button" data-sort="${k}"${k === pageSort ? ' aria-sort="descending"' : ''}>${label}</button></th>`).join('')}</tr></thead>
      <tbody>${list.length ? list.map((p) => {
        const cat = /^\/(column|knowledge|notice)\//.exec(p.path);
        return `
        <tr class="is-clickable${openPage === p.path ? ' is-open' : ''}" data-page="${esc(p.path)}">
          <td><span class="db-page__title">${cat ? `<span class="db-badge">${CATEGORY[cat[1]]}</span> ` : ''}${esc(pageTitle(p.path))}</span><span class="db-page__path">${esc(p.path)}</span></td>
          <td class="num"><span class="db-inline"><span class="db-inline__bar" style="width:${Math.max(2, (p.views / max) * 90)}px"></span>${fmt(p.views)}</span></td>
          <td class="num">${fmt(p.sessions)}</td>
          <td class="num">${fmt(p.cta)}<span class="db-rate">${pct(p.cta, p.sessions)}</span></td>
          <td class="num">${fmt(p.submits)}<span class="db-rate">${pct(p.submits, p.sessions)}</span></td>
        </tr>${openPage === p.path ? '<tr class="db-detail"><td colspan="5"><p class="db-empty">読み込み中…</p></td></tr>' : ''}`;
      }).join('') : '<tr><td colspan="5" class="db-empty">この期間の記録はまだありません。</td></tr>'}</tbody>`;
    if (openPage) loadDetail(openPage);
  }

  async function loadDetail(pagePath) {
    const cell = $('.db-detail td', els.pagesTable);
    if (!cell) return;
    try {
      const d = await api(`/api/analytics/stats?from=${data.from}&to=${data.to}&page=${encodeURIComponent(pagePath)}`);
      const list = (items, render) => (items.length ? `<ol>${items.map(render).join('')}</ol>` : '<p class="db-empty">記録なし</p>');
      cell.innerHTML = `
        <div class="db-detail__grid">
          <div><h3>このページに来る前にいた場所</h3>${list(d.referrers, (r) => {
            const c = classifyRef(r.ref_type, r.ref);
            return `<li><span><span class="db-badge db-badge--${c.cls}">${c.label}</span> ${esc(c.name)}</span><span>${fmt(r.sessions)}</span></li>`;
          })}</div>
          <div><h3>次に見たページ</h3>${list(d.next, (r) => `<li><span>${esc(r.title || r.path)}</span><span>${fmt(r.sessions)}</span></li>`)}</div>
          <div><h3>このページで押された申込ボタン</h3>${list(d.cta, (r) => `<li><span>${esc(r.detail || '不明')}</span><span>${fmt(r.clicks)}回</span></li>`)}</div>
        </div>`;
    } catch (err) {
      cell.innerHTML = `<p class="db-empty">${esc(err.message)}</p>`;
    }
  }

  /* ---------------- 流入元・申込ボタン・最近の申し込み ---------------- */

  function renderReferrers() {
    const rows = data.referrers;
    els.refTable.innerHTML = `
      <thead><tr><th>種別</th><th>参照元</th><th class="num">訪問数</th><th class="num">申込ボタン</th><th class="num">送信完了</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => {
        const c = classifyRef(r.ref_type, r.ref);
        return `<tr><td><span class="db-badge db-badge--${c.cls}">${c.label}</span></td><td>${esc(c.name)}</td>
          <td class="num">${fmt(r.sessions)}</td>
          <td class="num">${fmt(r.cta)}<span class="db-rate">${pct(r.cta, r.sessions)}</span></td>
          <td class="num">${fmt(r.submits)}<span class="db-rate">${pct(r.submits, r.sessions)}</span></td></tr>`;
      }).join('') : '<tr><td colspan="5" class="db-empty">記録なし</td></tr>'}</tbody>`;
  }

  function renderCta() {
    const rows = data.cta;
    els.ctaTable.innerHTML = `
      <thead><tr><th>押されたページ</th><th>ボタン</th><th class="num">クリック</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr><td><span class="db-page__title">${esc(r.title || pageTitle(r.path))}</span><span class="db-page__path">${esc(r.path)}</span></td>
        <td>${esc(r.detail)}</td><td class="num">${fmt(r.clicks)}<span class="db-rate">${fmt(r.sessions)}訪問</span></td></tr>`).join('') : '<tr><td colspan="3" class="db-empty">記録なし</td></tr>'}</tbody>`;
  }

  function renderRecent() {
    const rows = data.recent;
    els.recentTable.innerHTML = `
      <thead><tr><th>受付日時</th><th>フォーム</th><th>サイトへの流入元</th><th>最初に見たページ</th><th>直前に読んだ記事</th><th>メール通知</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => {
        const c = classifyRef(r.entry_ref_type, r.entry_ref);
        const at = new Date(r.ts * 1000).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<tr><td>${at}<span class="db-rate">No.${r.id}</span></td><td>${esc(r.formLabel)}</td>
          <td><span class="db-badge db-badge--${c.cls}">${c.label}</span> ${esc(c.name)}</td>
          <td>${esc(r.entry_path ? pageTitle(r.entry_path) : '—')}</td>
          <td>${esc(r.last_article ? pageTitle(r.last_article) : '—')}</td>
          <td>${Number(r.mailed) ? '送信済み' : '<span class="db-badge db-badge--sns">未送信</span>'}</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="db-empty">この期間の申し込みはまだありません。</td></tr>'}</tbody>`;
  }

  /* ---------------- 接続設定 ---------------- */

  async function openSetup() {
    els.setup.hidden = false;
    try {
      const conf = await api('/api/analytics/config');
      els.endpoint.value = conf.endpoint;
      els.token.placeholder = conf.hasToken ? '保存済みのトークンを使う場合は空欄のまま' : 'config.php の stats_token と同じ値';
      els.token.required = !conf.hasToken;
    } catch { /* 初回は空欄のまま */ }
  }

  /* ---------------- イベント ---------------- */

  function bind() {
    $$('.db-range [data-days]').forEach((b) => b.addEventListener('click', () => { setDays(Number(b.dataset.days)); load(); }));
    [els.fromDate, els.toDate].forEach((input) => input.addEventListener('change', () => {
      $$('.db-range [data-days]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (els.fromDate.value && els.toDate.value) load();
    }));
    $('#reloadBtn').addEventListener('click', load);
    $('#settingsBtn').addEventListener('click', () => (els.setup.hidden ? openSetup() : (els.setup.hidden = true)));
    $('#setupCancel').addEventListener('click', () => { els.setup.hidden = true; });
    els.setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/analytics/config', { method: 'POST', body: JSON.stringify({ endpoint: els.endpoint.value, token: els.token.value }) });
        els.token.value = '';
        els.setup.hidden = true;
        toast('接続設定を保存しました');
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    $('#metricSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('[data-metric]');
      if (!b || !data) return;
      metric = b.dataset.metric;
      $$('#metricSwitch button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderChart();
    });
    $('#pageFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b || !data) return;
      pageFilter = b.dataset.filter;
      $$('#pageFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderPages();
    });
    els.pagesTable.addEventListener('click', (e) => {
      const sort = e.target.closest('[data-sort]');
      if (sort) { pageSort = sort.dataset.sort; renderPages(); return; }
      const row = e.target.closest('tr[data-page]');
      if (!row) return;
      openPage = openPage === row.dataset.page ? null : row.dataset.page;
      renderPages();
    });
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => data && renderChart(), 150); });
  }

  async function init() {
    bind();
    setDays(30);
    try {
      const health = await api('/api/health');
      if (!health.ok) throw new Error();
    } catch {
      showMessage('<strong>編集用サーバーに接続できません。</strong><br>PowerShell で <code>node server.js</code> を起動してから、<code>http://localhost:8080/admin/dashboard.html</code> を開いてください。', true);
      return;
    }
    load();
  }

  init();
})();
