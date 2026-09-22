// 記事ビルド：content/articles/<カテゴリ>/<スラッグ>.md から、記事ページ・カテゴリ一覧・sitemap.xml・robots.txt を生成する
//   使い方：node build/articles.js        （全記事を生成）
//   記事エディタ（node server.js の /admin/editor/）で保存したときにも自動で実行される
//
// ヘッダー・フッターなどの共通部分は、既存の記事ページ／一覧ページのHTMLをそのまま使い、
// <head> のSEO用タグと <main> の中身だけを作り直す。
const fs = require('fs');
const path = require('path');
const { parseFrontMatter, stringifyFrontMatter, mdToHtml } = require('./markdown.js');

const SITE_URL = 'https://kuchikomi-taisaku.com';
const SITE_NAME = '一般社団法人口コミ対策センター';
const HP_DIR = path.join(__dirname, '..');
const CONTENT_DIR = path.join(HP_DIR, '..', 'content', 'articles');
const DEFAULT_IMAGE = '/assets/img/ogp-default.jpg';
const LOGO_IMAGE = '/assets/img/top/logo.webp';
const ARTICLE_CSS = 'assets/css/article.css?v=20260923b';

const CATEGORIES = {
  column: { en: 'COLUMN', titleSuffix: 'コラム', list: 'banner', more: '記事を読む' },
  knowledge: { en: 'KNOWLEDGE', titleSuffix: '口コミ対策の基礎知識', list: 'banner', more: '読む' },
  notice: { en: 'NOTICE', titleSuffix: 'お知らせ', list: 'news' },
  // 業種ページ（親）と解決事例ページ（子：parent に業種ページのURL名）。/cases/ の一覧ページはビルドで上書きしない
  cases: { en: 'CASES', titleSuffix: '成功事例', list: 'banner', more: '事例を読む', manageIndex: false }
};
const NOTICE_TAGS = { お知らせ: '', 注意喚起: 'tag--alert', コラム: 'tag--column' };

/* ------------------------------------------------------------------ */
/* 共通                                                                  */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間
const dotDate = (d) => String(d || '').replace(/-/g, '.');
const isoDate = (d) => `${d}T00:00:00+09:00`;
const abs = (u) => (/^https?:\/\//.test(u) ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`);
// 改行コードは LF にそろえて扱う（書き込み時に元ファイルの改行コードへ戻す）
const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null);

function writeIfChanged(file, content) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const eol = before && before.includes('\r\n') ? '\r\n' : '\n';
  const out = content.replace(/\r?\n/g, eol);
  if (before === out) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out, 'utf8');
  return true;
}

/* ------------------------------------------------------------------ */
/* 記事データの読み込み                                                  */
/* ------------------------------------------------------------------ */

function articleFile(category, slug) {
  return path.join(CONTENT_DIR, category, `${slug}.md`);
}

function readArticle(category, slug) {
  const file = articleFile(category, slug);
  const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
  const cat = CATEGORIES[category];
  const title = String(data.title || slug);
  const description = String(data.description || '');
  return {
    category,
    slug,
    file,
    url: `/${category}/${slug}/`,
    title,
    description,
    lead: String(data.lead ?? description),
    summary: String(data.summary ?? description),
    seoTitle: String(data.seoTitle || `${title}｜${cat.titleSuffix}｜${SITE_NAME}`),
    label: String(data.label || cat.en),
    published: String(data.published || today()),
    updated: String(data.updated || data.published || today()),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : (data.tags ? [String(data.tags)] : []),
    noticeType: String(data.noticeType || 'お知らせ'),
    order: Number.isFinite(data.order) ? data.order : 9999,
    image: String(data.image || ''),
    author: String(data.author || ''),
    draft: data.draft === true,
    parent: String(data.parent || ''),
    listHeading: String(data.listHeading || ''),
    navTitle: String(data.navTitle || title), // パンくず・戻るリンク用の短い名前（長い見出しのページ向け）
    body
  };
}

function loadArticles() {
  const list = [];
  for (const category of Object.keys(CATEGORIES)) {
    const dir = path.join(CONTENT_DIR, category);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.md')) list.push(readArticle(category, name.slice(0, -3)));
    }
  }
  return list;
}

// 一覧の並び順：新しい順（同じ日付なら order の小さい順）
const byNewest = (a, b) => (b.published.localeCompare(a.published)) || (a.order - b.order) || a.slug.localeCompare(b.slug);

function saveArticle(article) {
  const data = {
    title: article.title,
    description: article.description,
    lead: article.lead !== article.description ? article.lead : undefined,
    summary: article.summary !== article.description ? article.summary : undefined,
    seoTitle: article.seoTitle !== `${article.title}｜${CATEGORIES[article.category].titleSuffix}｜${SITE_NAME}` ? article.seoTitle : undefined,
    label: article.label !== CATEGORIES[article.category].en ? article.label : undefined,
    published: article.published,
    updated: article.updated,
    tags: article.tags && article.tags.length ? article.tags : undefined,
    noticeType: article.category === 'notice' ? article.noticeType : undefined,
    order: article.order !== 9999 ? article.order : undefined,
    image: article.image || undefined,
    author: article.author || undefined,
    draft: article.draft ? true : undefined,
    parent: article.parent || undefined,
    listHeading: article.listHeading || undefined,
    navTitle: article.navTitle && article.navTitle !== article.title ? article.navTitle : undefined
  };
  const file = articleFile(article.category, article.slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringifyFrontMatter(data, article.body), 'utf8');
  return file;
}

/* ------------------------------------------------------------------ */
/* <head> のSEOタグ                                                     */
/* ------------------------------------------------------------------ */

function seoHead({ title, description, url, image, type = 'website', published, modified, jsonld, depth }) {
  const img = abs(image || DEFAULT_IMAGE);
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    `<link rel="canonical" href="${abs(url)}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    '<meta property="og:locale" content="ja_JP">',
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${abs(url)}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta name="twitter:card" content="summary_large_image">'
  ];
  if (published) lines.push(`<meta property="article:published_time" content="${isoDate(published)}">`);
  if (modified) lines.push(`<meta property="article:modified_time" content="${isoDate(modified)}">`);
  lines.push(`<link rel="stylesheet" href="${'../'.repeat(depth)}${ARTICLE_CSS}">`);
  lines.push(`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`);
  return lines.join('\n');
}

// 既存の <head> からSEO用タグを取り除き、新しいものを viewport の直後に入れる
function replaceHead(html, block) {
  const headEnd = html.indexOf('</head>');
  let head = html.slice(0, headEnd);
  head = head
    .replace(/<title>[\s\S]*?<\/title>\s*/g, '')
    .replace(/<meta\s+(name|property)="(description|robots|og:[^"]*|twitter:[^"]*|article:[^"]*)"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="stylesheet"\s+href="[^"]*article\.css[^"]*">\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  head = head.replace(/(<meta name="viewport"[^>]*>\n?)/, `$1${block}\n`);
  return head + html.slice(headEnd);
}

function replaceMain(html, main) {
  const start = html.indexOf('<main>');
  const end = html.indexOf('</main>');
  if (start < 0 || end < 0) throw new Error('<main> が見つかりません');
  return `${html.slice(0, start)}<main>\n${main}\n</main>${html.slice(end + '</main>'.length)}`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) }))
  };
}

const organization = () => ({
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: { '@type': 'ImageObject', url: abs(LOGO_IMAGE) }
});

/* ------------------------------------------------------------------ */
/* 部品                                                                  */
/* ------------------------------------------------------------------ */

// 申込の窓口は「無料診断・LINE・お問い合わせフォーム」の3つ（電話・メールでの受付はしない）
function ctaTrio(pre) {
  return `    <div class="cta-trio">
      <a class="cta-trio__item is-diagnosis" href="${pre}form/">
        <span class="label">URLを入れるだけ・費用0円</span>
        <span class="main">無料で診断</span>
        <span class="sub">1営業日以内に結果をご連絡</span>
      </a>
      <a class="cta-trio__item is-line" href="https://lin.ee/gVRUtOl" target="_blank" rel="noopener">
        <span class="label">スマホから気軽に</span>
        <span class="main">LINEで相談</span>
        <span class="sub">友だち追加してメッセージを送るだけ</span>
      </a>
      <a class="cta-trio__item is-contact" href="${pre}contact/">
        <span class="label">ご質問・ご相談はこちら</span>
        <span class="main">お問い合わせ</span>
        <span class="sub">フォームで受付・秘密厳守</span>
      </a>
    </div>`;
}

function placeholderCover(title) {
  const t = esc(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${t}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#044072"/><stop offset="100%" stop-color="#0048be"/></linearGradient><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1.5" fill="rgba(255,255,255,0.08)"/></pattern></defs><rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#p)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, sans-serif" font-size="28" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="2">${t}</text><text x="50%" y="62%" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, sans-serif" font-size="11" font-weight="400" fill="rgba(255,255,255,0.6)" letter-spacing="6">PLACEHOLDER IMAGE</text></svg>`;
}

function bannerItem(a, href) {
  const cover = a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : placeholderCover(a.title);
  return `<a href="${href}" class="banner"><div class="banner__cover">${cover}</div><div class="banner__body"><div class="banner__title">${esc(a.title)}</div><div class="banner__sub">${esc(a.summary)}</div><div class="banner__cta">${CATEGORIES[a.category].more || '読む'}</div></div></a>`;
}

function newsItem(a, href) {
  return `<div class="news-item"><time datetime="${a.published}">${dotDate(a.published)}</time><span class="tag ${NOTICE_TAGS[a.noticeType] ?? ''}">${esc(a.noticeType)}</span><a href="${href}">${esc(a.title)}</a></div>`;
}

// 関連記事：共通のタグが多い順 → 同じカテゴリ → 新しい順
function relatedOf(a, all, n = 3) {
  return all
    .filter((x) => !x.draft && x !== a)
    .filter((x) => x.slug !== a.parent) // 自分の親ページはパンくずで辿れるので除く
    .map((x) => ({ x, score: (a.parent && x.parent === a.parent ? 4 : 0) + x.tags.filter((t) => a.tags.includes(t)).length * 2 + (x.category === a.category ? 1 : 0) }))
    .sort((p, q) => (q.score - p.score) || byNewest(p.x, q.x))
    .slice(0, n)
    .map((r) => r.x);
}

/* ------------------------------------------------------------------ */
/* ページ生成                                                            */
/* ------------------------------------------------------------------ */

function categoryInfo(category) {
  const html = readIf(path.join(HP_DIR, category, 'index.html')) || '';
  const pick = (re) => { const m = re.exec(html); return m ? plain(m[1]) : ''; };
  return {
    name: pick(/<section class="page-header[^"]*">[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/) || category,
    title: pick(/<title>([\s\S]*?)<\/title>/),
    description: (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || ''
  };
}

// 新しい記事用に、同じカテゴリの既存記事ページ（なければ他カテゴリの記事）をひな形にする
function baseHtmlFor(a, all) {
  const own = readIf(path.join(HP_DIR, a.category, a.slug, 'index.html'));
  if (own && own.includes('<main>')) return own;
  const candidates = [...all.filter((x) => x.category === a.category), ...all].filter((x) => x !== a);
  for (const x of candidates) {
    const html = readIf(path.join(HP_DIR, x.category, x.slug, 'index.html'));
    if (html && html.includes('<main>')) return html; // 記事ページはどれも同じ深さ（/<カテゴリ>/<スラッグ>/）なので相対パスはそのまま使える
  }
  throw new Error('ひな形にできる記事ページがありません');
}

function renderArticle(a, all, cats) {
  const pre = '../../';
  const cat = cats[a.category];
  const parent = a.parent ? all.find((x) => x.category === a.category && x.slug === a.parent && !x.draft) : null;
  const children = all.filter((x) => x.category === a.category && x.parent === a.slug && !x.draft).sort((p, q) => (p.order - q.order) || p.slug.localeCompare(q.slug));
  const related = relatedOf(a, all).filter((x) => !children.includes(x));
  const crumbs = [['ホーム', '/'], [cat.name, `/${a.category}/`], ...(parent ? [[parent.navTitle, parent.url]] : []), [a.navTitle, a.url]];
  const main = `
    <section class="page-header page-header--light">
      <div class="container">
        <span class="en">${esc(a.label)}</span>
        <h1>${esc(a.title)}</h1>
        <p>${esc(a.lead)}</p>
      </div>
    </section>
    <div class="container">
      <p class="breadcrumb"><a href="${pre}">ホーム</a><span>›</span><a href="../">${esc(cat.name)}</a><span>›</span>${parent ? `<a href="../${parent.slug}/">${esc(parent.navTitle)}</a><span>›</span>` : ''}${esc(a.navTitle)}</p>
    </div>

    <section class="section"><div class="container">
      <article class="article">
        <p class="article-meta"><span>公開日 <time datetime="${a.published}">${dotDate(a.published)}</time></span>${a.updated && a.updated !== a.published ? `<span>更新日 <time datetime="${a.updated}">${dotDate(a.updated)}</time></span>` : ''}</p>
        <div class="prose">
${mdToHtml(a.body).split('\n').map((l) => (l ? `          ${l}` : '')).join('\n')}
        </div>${children.length ? `
        <section class="child-list" aria-labelledby="child-list-title">
          <h2 id="child-list-title">${esc(a.listHeading || `${a.title}の一覧`)}</h2>
          <ol>${children.map((c, i) => `
            <li><a href="../${c.slug}/"><span class="child-list__no">${esc(c.label && c.label !== CATEGORIES[c.category].en ? c.label : `事例${i + 1}`)}</span><span class="child-list__title">${esc(c.title)}</span><span class="child-list__sub">${esc(c.summary)}</span><span class="child-list__more">${CATEGORIES[c.category].more || '読む'} →</span></a></li>`).join('')}
          </ol>
        </section>` : ''}${a.tags.length ? `
        <ul class="article-tags" aria-label="タグ">${a.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </article>
${ctaTrio(pre)}${related.length ? `
      <nav class="related-articles" aria-labelledby="related-title">
        <h2 id="related-title">関連記事</h2>
        <ul>${related.map((r) => `
          <li><a href="${pre}${r.category}/${r.slug}/"><span class="related-articles__cat">${esc(cats[r.category].name)}</span><span class="related-articles__title">${esc(r.title)}</span><span class="related-articles__sub">${esc(r.summary)}</span></a></li>`).join('')}
        </ul>
        <p class="related-articles__more">${parent ? `<a href="../${parent.slug}/">${esc(parent.navTitle)}へ戻る</a>　` : ''}<a href="../">${esc(cat.name)}の一覧へ</a></p>
      </nav>` : ''}
    </div></section>
`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${abs(a.url)}#article`,
        headline: a.title,
        description: a.description,
        image: [abs(a.image || DEFAULT_IMAGE)],
        datePublished: isoDate(a.published),
        dateModified: isoDate(a.updated),
        inLanguage: 'ja',
        articleSection: cat.name,
        keywords: a.tags.length ? a.tags.join(', ') : undefined,
        mainEntityOfPage: { '@type': 'WebPage', '@id': abs(a.url) },
        author: a.author ? { '@type': 'Person', name: a.author } : organization(),
        publisher: organization()
      },
      breadcrumbLd(crumbs)
    ]
  };
  let html = baseHtmlFor(a, all);
  html = replaceHead(html, seoHead({ title: a.seoTitle, description: a.description, url: a.url, image: a.image, type: 'article', published: a.published, modified: a.updated, jsonld, depth: 2 }));
  return replaceMain(html, main);
}

function renderCategory(category, all, cats) {
  if (CATEGORIES[category].manageIndex === false) return null;
  const file = path.join(HP_DIR, category, 'index.html');
  let html = readIf(file);
  if (!html) return null;
  const info = cats[category];
  const items = all.filter((a) => a.category === category && !a.draft).sort(byNewest);
  const list = CATEGORIES[category].list === 'news'
    ? `<div class="news-list">${items.map((a) => newsItem(a, `${a.slug}/`)).join('')}</div>`
    : `<div class="banner-grid">${items.map((a) => bannerItem(a, `${a.slug}/`)).join('')}</div>`;
  const section = `    <section class="section"><div class="container container--wide">${list}
${ctaTrio('../')}
    </div></section>
`;
  // 一覧部分（パンくずの後ろ）だけを差し替える
  const found = html.indexOf('<section class="section">', html.indexOf('class="breadcrumb"'));
  const end = html.indexOf('</main>');
  if (found < 0 || end < 0) throw new Error(`${category}/index.html の一覧部分が見つかりません`);
  const start = html.lastIndexOf('\n', found) + 1; // 行頭から差し替える（字下げが増えていかないように）
  html = `${html.slice(0, start)}${section}\n${html.slice(end)}`;
  // ブラウザ保存の投稿機能（旧モック）の読み込みは外す
  html = html.replace(/<script src="[^"]*assets\/js\/column\.js[^"]*"[^>]*><\/script>\n?/g, '');
  const updated = items.reduce((m, a) => (a.updated > m ? a.updated : m), '');
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${abs(`/${category}/`)}#page`,
        name: info.name,
        description: info.description,
        url: abs(`/${category}/`),
        inLanguage: 'ja',
        mainEntity: { '@type': 'ItemList', itemListElement: items.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(a.url), name: a.title })) }
      },
      breadcrumbLd([['ホーム', '/'], [info.name, `/${category}/`]])
    ]
  };
  html = replaceHead(html, seoHead({ title: info.title, description: info.description, url: `/${category}/`, jsonld, modified: updated || undefined, depth: 1 }));
  return { file, html, updated };
}

/* ------------------------------------------------------------------ */
/* sitemap.xml / robots.txt                                             */
/* ------------------------------------------------------------------ */

function listSitePages(dir = HP_DIR, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_') || ['admin', 'backend', 'build', 'node_modules', 'assets'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listSitePages(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function renderSitemap(all, categoryUpdated) {
  const lastmods = new Map();
  for (const a of all) if (!a.draft) lastmods.set(a.url, a.updated);
  for (const [cat, d] of Object.entries(categoryUpdated)) if (d) lastmods.set(`/${cat}/`, d);
  const urls = [];
  for (const file of listSitePages()) {
    const rel = path.relative(HP_DIR, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    if (/http-equiv="refresh"/i.test(html)) continue; // 旧URLからの転送ページ
    if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
    if (/^(404\.html|thanks[^/]*\/|sitemap\/)/.test(rel)) continue;
    const url = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
    urls.push(url);
  }
  urls.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
  const body = urls.map((u) => `  <url><loc>${abs(u)}</loc>${lastmods.has(u) ? `<lastmod>${lastmods.get(u)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /backend/
Disallow: /build/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/* ------------------------------------------------------------------ */
/* まとめて生成                                                          */
/* ------------------------------------------------------------------ */

function buildAll() {
  const all = loadArticles();
  const cats = {};
  for (const c of Object.keys(CATEGORIES)) cats[c] = categoryInfo(c);
  const changed = [];
  const removed = [];
  const rel = (f) => path.relative(HP_DIR, f).split(path.sep).join('/');

  for (const a of all) {
    const out = path.join(HP_DIR, a.category, a.slug, 'index.html');
    if (a.draft) {
      // 下書きは公開しない（以前に公開したページがあれば取り下げる）
      if (fs.existsSync(out)) { fs.rmSync(out); try { fs.rmdirSync(path.dirname(out)); } catch { /* 画像などが残っていれば消さない */ } removed.push(rel(out)); }
      continue;
    }
    if (writeIfChanged(out, renderArticle(a, all, cats))) changed.push(rel(out));
  }
  const categoryUpdated = {};
  for (const c of Object.keys(CATEGORIES)) {
    const r = renderCategory(c, all, cats);
    if (!r) continue;
    categoryUpdated[c] = r.updated;
    if (writeIfChanged(r.file, r.html)) changed.push(rel(r.file));
  }
  const sitemap = path.join(HP_DIR, 'sitemap.xml');
  if (writeIfChanged(sitemap, renderSitemap(all, categoryUpdated))) changed.push('sitemap.xml');
  const robots = path.join(HP_DIR, 'robots.txt');
  if (writeIfChanged(robots, renderRobots())) changed.push('robots.txt');
  return { articles: all.length, changed, removed };
}

// 保存前のプレビュー：記事データ（未保存）から、ファイルを書かずにページのHTMLだけ作る
function renderPreview(article) {
  const draft = { ...article, draft: false };
  const others = loadArticles().filter((x) => !(x.category === article.category && x.slug === article.slug));
  const all = [...others, draft];
  const cats = {};
  for (const c of Object.keys(CATEGORIES)) cats[c] = categoryInfo(c);
  return renderArticle(draft, all, cats);
}

module.exports = { CATEGORIES, CONTENT_DIR, HP_DIR, SITE_URL, loadArticles, readArticle, saveArticle, articleFile, categoryInfo, buildAll, renderPreview, today };

if (require.main === module) {
  const r = buildAll();
  console.log(`記事 ${r.articles} 件を読み込み、${r.changed.length} ファイルを更新しました。`);
  r.changed.forEach((f) => console.log(`  更新: ${f}`));
  r.removed.forEach((f) => console.log(`  取り下げ（下書き）: ${f}`));
}
