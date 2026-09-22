const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT) || 8080;
const backupDir = path.join(rootDir, '_backups');
// LP は HP と同じ階層の lp/ フォルダに置く（公開時は https://〜/lp/<LP名>/）
const lpDir = path.join(rootDir, '..', 'lp');
const allowRemoteEdit = process.env.ALLOW_REMOTE_EDIT === '1';
const maxBackupsPerFile = 100;
// アクセス解析の接続設定（XServer の stats.php のURLとトークン）。git・公開対象外
const analyticsConfigFile = path.join(rootDir, '_config', 'analytics.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// URLのパスを、HP（hp/）か LP（隣の lp/ フォルダ。公開時は /lp/ 配下）の実ファイルの場所に対応させる
function siteBase(urlPath) {
  if (urlPath === '/lp' || urlPath.startsWith('/lp/')) return { base: lpDir, rest: urlPath.slice(3) || '/' };
  return { base: rootDir, rest: urlPath };
}

function resolvePath(requestPath) {
  const cleanPath = requestPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(cleanPath);
  const { base, rest } = siteBase(decoded);
  const target = rest === '/' && base === rootDir ? '/index.html' : rest;
  const resolved = path.normalize(path.join(base, target));

  if (!resolved.startsWith(base)) {
    return null;
  }

  if (base === rootDir && ['_backups', '_config'].includes(path.relative(rootDir, resolved).split(path.sep)[0])) {
    return null;
  }

  return resolved;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    // 編集結果がすぐ見えるようにキャッシュさせない
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* 共通ユーティリティ                                                  */
/* ------------------------------------------------------------------ */

const escapeText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
const decodeText = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .trim();
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toPosix = (p) => p.split(path.sep).join('/');
// 元ファイルが CRLF なら書き込む文字列も CRLF にそろえる
const matchEol = (original, text) => (original.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text);

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function isLocalRequest(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        reject(new ApiError(413, 'データが大きすぎます'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new ApiError(400, 'JSONの形式が正しくありません')); }
    });
    req.on('error', reject);
  });
}

// ページのURLパス（/column/it-law/ など）から、編集対象のHTMLファイルを求める
function pageFile(pagePath) {
  let p = String(pagePath || '').split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch { /* そのまま使う */ }
  const { base, rest } = siteBase('/' + p.replace(/\\/g, '/').replace(/^\/+/, ''));
  p = rest.replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '/index.html';

  const abs = path.normalize(path.join(base, p));
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new ApiError(400, '不正なパスです');
  if (path.extname(abs).toLowerCase() !== '.html') throw new ApiError(400, 'HTMLページ以外は編集できません');
  const top = rel.split(path.sep)[0];
  if (base === rootDir && (top.startsWith('_') || ['admin', 'build', 'backend', 'node_modules'].includes(top))) throw new ApiError(403, 'このページは編集対象外です');
  if (!fs.existsSync(abs)) throw new ApiError(404, 'ページが見つかりません');
  return abs;
}

function listHtmlFiles(dir = rootDir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || ['node_modules', 'admin', 'build', 'backend'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* バックアップ（変更履歴）                                            */
/* ------------------------------------------------------------------ */

function backupFolder(file) {
  // LP（lp/ フォルダ）の控えは「lp__〜」という名前でまとめる
  const contentDir = path.join(rootDir, '..', 'content');
  const rel = file.startsWith(lpDir) ? `lp/${toPosix(path.relative(lpDir, file))}`
    : file.startsWith(contentDir) ? `content/${toPosix(path.relative(contentDir, file))}`
    : toPosix(path.relative(rootDir, file));
  return path.join(backupDir, rel.replace(/\//g, '__'));
}

function timestampId(date = new Date()) {
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

function labelFromId(id) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  return m ? `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}` : id;
}

function backupFile(file, note) {
  if (!fs.existsSync(file)) return null;
  const folder = backupFolder(file);
  fs.mkdirSync(folder, { recursive: true });
  const id = timestampId();
  fs.copyFileSync(file, path.join(folder, `${id}.html`));
  if (note) fs.writeFileSync(path.join(folder, `${id}.txt`), note, 'utf8');

  const old = fs.readdirSync(folder).filter((f) => f.endsWith('.html')).sort().reverse().slice(maxBackupsPerFile);
  old.forEach((f) => {
    fs.rmSync(path.join(folder, f), { force: true });
    fs.rmSync(path.join(folder, f.replace(/\.html$/, '.txt')), { force: true });
  });
  return id;
}

function listBackups(file) {
  const folder = backupFolder(file);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .reverse()
    .map((f) => {
      const id = f.replace(/\.html$/, '');
      const notePath = path.join(folder, `${id}.txt`);
      const note = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8') : '';
      return { id, label: labelFromId(id), note };
    });
}

function readBackup(file, id) {
  if (!/^[0-9-]+$/.test(String(id || ''))) throw new ApiError(400, '履歴IDが正しくありません');
  const src = path.join(backupFolder(file), `${id}.html`);
  if (!fs.existsSync(src)) throw new ApiError(404, '履歴が見つかりません');
  return fs.readFileSync(src, 'utf8');
}

/* ------------------------------------------------------------------ */
/* 記事（元データ：../content/articles/<カテゴリ>/<スラッグ>.md）        */
/* 保存すると build/articles.js で記事ページ・一覧・sitemap を作り直す  */
/* ------------------------------------------------------------------ */

const articlesBuild = require('./build/articles.js');
const { htmlToMd, mdToHtml } = require('./build/markdown.js');
const NEWS_TAGS = ['お知らせ', '注意喚起', 'コラム'];

function articleRef(articlePath) {
  const m = /^\/?([a-z0-9-]+)\/([a-z0-9-]+)\/?(?:index\.html)?$/i.exec(String(articlePath || ''));
  if (!m || !articlesBuild.CATEGORIES[m[1]]) throw new ApiError(400, '記事のパスが正しくありません');
  const file = articlesBuild.articleFile(m[1], m[2]);
  if (!fs.existsSync(file)) throw new ApiError(404, '記事が見つかりません');
  return { category: m[1], slug: m[2], file };
}

// 記事ページ・カテゴリ一覧（元データから自動生成されるHTML）なら、そのカテゴリとスラッグを返す
function generatedPage(file) {
  const rel = toPosix(path.relative(rootDir, file));
  const m = /^(column|knowledge|notice)\/(?:([a-z0-9-]+)\/)?index\.html$/.exec(rel);
  if (!m) return null;
  if (!m[2]) return { category: m[1] };
  return fs.existsSync(articlesBuild.articleFile(m[1], m[2])) ? { category: m[1], slug: m[2] } : null;
}

// 変更履歴の対象ファイル（記事ページなら元データの .md、一覧ページは履歴なし）
function historySource(pagePath) {
  const file = pageFile(pagePath);
  const gen = generatedPage(file);
  if (!gen) return file;
  return gen.slug ? articlesBuild.articleFile(gen.category, gen.slug) : null;
}

function categoryNames() {
  return Object.fromEntries(Object.keys(articlesBuild.CATEGORIES).map((c) => [c, articlesBuild.categoryInfo(c).name]));
}

function articleResponse(a) {
  const names = categoryNames();
  return {
    path: `${a.category}/${a.slug}`,
    url: a.url,
    category: a.category,
    categoryLabel: names[a.category],
    h1: a.title,
    lead: a.lead,
    en: a.label,
    seoTitle: a.seoTitle,
    description: a.description,
    bodyHtml: mdToHtml(a.body),
    tags: a.tags,
    published: a.published,
    updated: a.updated,
    draft: a.draft,
    image: a.image,
    parent: a.parent,
    listing: articlesBuild.CATEGORIES[a.category].list === 'news'
      ? { kind: 'news', tag: a.noticeType, tags: NEWS_TAGS }
      : { kind: 'banner', sub: a.summary }
  };
}

// 記事エディタから送られた内容を、記事データに当てはめる（保存とプレビューで共通）
function applyEdits(before, data) {
  const next = { ...before };
  const str = (v) => (typeof v === 'string' ? v.trim() : undefined);
  if (str(data.h1) !== undefined) next.title = str(data.h1) || before.title;
  if (before.navTitle === before.title) next.navTitle = next.title; // パンくず用の短い名前を別に決めていなければタイトルに合わせる
  if (str(data.lead) !== undefined) next.lead = str(data.lead);
  if (str(data.en) !== undefined) next.label = str(data.en) || before.label;
  if (str(data.seoTitle) !== undefined) next.seoTitle = str(data.seoTitle) || before.seoTitle;
  if (str(data.description) !== undefined) next.description = str(data.description);
  if (typeof data.bodyHtml === 'string') next.body = htmlToMd(data.bodyHtml);
  if (data.listing && data.listing.kind === 'banner' && typeof data.listing.sub === 'string') next.summary = data.listing.sub.trim();
  if (data.listing && data.listing.kind === 'news' && NEWS_TAGS.includes(data.listing.tag)) next.noticeType = data.listing.tag;
  if (data.tags !== undefined) next.tags = cleanTags(data.tags);
  if (isDate(data.published)) next.published = data.published;
  if (typeof data.draft === 'boolean') next.draft = data.draft;
  if (str(data.image) !== undefined) next.image = /^\/assets\/img\/[\w\-./]+$/.test(str(data.image)) ? str(data.image) : '';
  next.updated = articlesBuild.today();
  if (next.published > next.updated) next.updated = next.published;
  return next;
}

// 保存前のプレビュー（メモリに置くだけ。ファイルは書き換えない）
const previews = new Map();

// 記事の画像：hp/assets/img/articles/<カテゴリ>-<URL名>/ に置く
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
function saveUploadedImage(ref, name, mime, base64) {
  const ext = IMAGE_TYPES[mime];
  if (!ext) throw new ApiError(400, '画像は JPG・PNG・WebP・GIF のいずれかにしてください');
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new ApiError(400, '画像が空です');
  if (buf.length > 5 * 1024 * 1024) throw new ApiError(413, '画像は5MB以下にしてください（大きい写真は縮小してからお使いください）');
  const dir = path.join(rootDir, 'assets', 'img', 'articles', `${ref.category}-${ref.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const base = String(name || 'image').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  let file = `${base}${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, file)); i += 1) file = `${base}-${i}${ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return `/assets/img/articles/${ref.category}-${ref.slug}/${file}`;
}

function runBuild() {
  try {
    return articlesBuild.buildAll();
  } catch (err) {
    console.error(err);
    throw new ApiError(500, `ページの生成に失敗しました：${err.message}`);
  }
}

const cleanTags = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,、，]/)).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// サイト内の、指定ディレクトリ（記事）へのリンク文字列を新しいタイトルに置き換える
function syncLinkTitles(targetDir, oldTitle, newTitle) {
  if (!oldTitle || !newTitle || oldTitle === newTitle) return [];
  const oldText = escapeText(oldTitle);
  const newText = escapeText(newTitle);
  const oldAttr = escapeAttr(oldTitle);
  const newAttr = escapeAttr(newTitle);
  const target = path.resolve(targetDir);
  const changed = [];

  for (const file of listHtmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes(oldText) && !html.includes(oldAttr)) continue;
    const baseDir = path.dirname(file);
    const next = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attrs) => {
      const hrefMatch = /\bhref="([^"]*)"/.exec(attrs);
      if (!hrefMatch) return whole;
      const href = hrefMatch[1].split('#')[0].split('?')[0];
      if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) return whole;
      let resolved = href.startsWith('/') ? path.join(rootDir, href) : path.resolve(baseDir, href);
      if (path.basename(resolved) === 'index.html') resolved = path.dirname(resolved);
      if (path.resolve(resolved) !== target) return whole;
      return whole.split(oldText).join(newText).split(oldAttr).join(newAttr);
    });
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
      changed.push(toPosix(path.relative(rootDir, file)));
    }
  }
  return changed;
}

function readAnalyticsConfig() {
  try { return JSON.parse(fs.readFileSync(analyticsConfigFile, 'utf8')); } catch { return {}; }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const canEdit = allowRemoteEdit || isLocalRequest(req);

  if (route === 'GET /api/health') return sendJson(res, 200, { ok: canEdit });
  if (!canEdit) throw new ApiError(403, '編集APIはこのPC（localhost）からのみ利用できます');

  switch (route) {
    case 'GET /api/analytics/config': {
      const conf = readAnalyticsConfig();
      return sendJson(res, 200, { endpoint: conf.endpoint || '', hasToken: Boolean(conf.token) });
    }

    case 'POST /api/analytics/config': {
      const data = await readJsonBody(req);
      const conf = readAnalyticsConfig();
      const endpoint = String(data.endpoint || '').trim();
      if (!/^https?:\/\/\S+\/stats\.php$/.test(endpoint)) throw new ApiError(400, 'URLは https://〜/backend/stats.php の形で入力してください');
      const next = { endpoint, token: String(data.token || '').trim() || conf.token || '' };
      fs.mkdirSync(path.dirname(analyticsConfigFile), { recursive: true });
      fs.writeFileSync(analyticsConfigFile, JSON.stringify(next, null, 2), 'utf8');
      return sendJson(res, 200, { ok: true });
    }

    case 'GET /api/analytics/stats': {
      const conf = readAnalyticsConfig();
      if (!conf.endpoint || !conf.token) throw new ApiError(409, '接続設定が未登録です');
      const target = new URL(conf.endpoint);
      for (const key of ['from', 'to', 'page']) {
        if (url.searchParams.has(key)) target.searchParams.set(key, url.searchParams.get(key));
      }
      let upstream;
      try {
        upstream = await fetch(target, { headers: { 'X-Stats-Token': conf.token }, signal: AbortSignal.timeout(20000) });
      } catch (err) {
        throw new ApiError(502, `集計サーバーに接続できません（${err.cause?.code || err.message}）`);
      }
      const body = await upstream.json().catch(() => null);
      if (!body) throw new ApiError(502, `集計サーバーの応答が正しくありません（HTTP ${upstream.status}）。URLを確認してください`);
      return sendJson(res, upstream.status, body);
    }

    case 'GET /api/articles': {
      const names = categoryNames();
      const order = Object.keys(articlesBuild.CATEGORIES);
      const articles = articlesBuild.loadArticles()
        .sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || b.published.localeCompare(a.published) || (a.order - b.order))
        .map((a) => ({ path: `${a.category}/${a.slug}`, url: a.url, category: a.category, categoryLabel: names[a.category], slug: a.slug, title: a.title, navTitle: a.navTitle, parent: a.parent, order: a.order, draft: a.draft, published: a.published, updatedAt: a.updated }));
      return sendJson(res, 200, { categories: names, articles });
    }

    case 'GET /api/article': {
      const ref = articleRef(url.searchParams.get('path'));
      return sendJson(res, 200, articleResponse(articlesBuild.readArticle(ref.category, ref.slug)));
    }

    case 'POST /api/article': {
      const data = await readJsonBody(req);
      const ref = articleRef(data.path);
      const before = articlesBuild.readArticle(ref.category, ref.slug);
      const next = applyEdits(before, data);

      const backupId = backupFile(ref.file, `記事エディタで保存（${before.title}）`);
      articlesBuild.saveArticle(next);
      const build = runBuild();
      const linkedFiles = !next.draft && before.title !== next.title
        ? syncLinkTitles(path.join(rootDir, ref.category, ref.slug), before.title, next.title)
        : [];
      return sendJson(res, 200, { ok: true, backupId, changed: build.changed, removed: build.removed, linkedFiles, url: next.url, draft: next.draft });
    }

    case 'POST /api/article/new': {
      const data = await readJsonBody(req);
      const category = String(data.category || '');
      const slug = String(data.slug || '').trim().toLowerCase();
      const title = String(data.title || '').trim();
      if (!articlesBuild.CATEGORIES[category]) throw new ApiError(400, 'カテゴリを選んでください');
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) throw new ApiError(400, 'URL名は半角の英小文字・数字・ハイフンで入力してください（例：google-review-guide）');
      if (!title) throw new ApiError(400, 'タイトルを入力してください');
      if (fs.existsSync(articlesBuild.articleFile(category, slug)) || fs.existsSync(path.join(rootDir, category, slug))) throw new ApiError(409, `「${category}/${slug}」はすでに使われています`);
      const parent = String(data.parent || '').trim();
      if (parent && !fs.existsSync(articlesBuild.articleFile(category, parent))) throw new ApiError(400, '親ページが見つかりません');
      const siblings = parent ? articlesBuild.loadArticles().filter((a) => a.category === category && a.parent === parent) : [];
      const today = articlesBuild.today();
      articlesBuild.saveArticle({
        parent, order: parent ? siblings.reduce((m, a) => Math.max(m, a.order === 9999 ? 0 : a.order), 0) + 1 : 9999,
        category, slug, title, description: '', lead: '', summary: '',
        seoTitle: `${title}｜${articlesBuild.CATEGORIES[category].titleSuffix}｜一般社団法人口コミ対策センター`,
        label: articlesBuild.CATEGORIES[category].en, published: today, updated: today, tags: [],
        noticeType: 'お知らせ', image: '', author: '', draft: true,
        body: '## 見出し\n\nここに本文を書きます。'
      });
      runBuild();
      return sendJson(res, 200, { ok: true, path: `${category}/${slug}` });
    }

    case 'POST /api/preview': {
      const data = await readJsonBody(req);
      const ref = articleRef(data.path);
      const next = applyEdits(articlesBuild.readArticle(ref.category, ref.slug), data);
      const key = `${ref.category}/${ref.slug}`;
      previews.set(key, { html: articlesBuild.renderPreview(next), url: next.url });
      return sendJson(res, 200, { ok: true, url: `/api/preview?path=${encodeURIComponent(key)}` });
    }

    case 'GET /api/preview': {
      const item = previews.get(String(url.searchParams.get('path') || ''));
      if (!item) throw new ApiError(404, 'プレビューがありません。エディタの「プレビュー」を押し直してください');
      const banner = '<div data-editor-skip style="position:sticky;top:0;z-index:9999;padding:8px 16px;background:#b45309;color:#fff;font:700 13px/1.6 sans-serif;text-align:center;">プレビュー（まだ保存されていません）— このタブを閉じてエディタに戻り、「保存してHPに反映」を押すと公開されます</div>';
      const html = item.html
        .replace(/<script[^>]*(?:editor|track)\.js[^>]*><\/script>\s*/g, '') // プレビューでは編集ツール・アクセス計測を読み込まない
        .replace(/<head>/i, (m) => `${m}\n<base href="${item.url}">`)
        .replace(/<body([^>]*)>/i, (m) => `${m}${banner}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return undefined;
    }

    case 'POST /api/upload': {
      const data = await readJsonBody(req);
      const ref = articleRef(data.path);
      return sendJson(res, 200, { ok: true, src: saveUploadedImage(ref, data.name, data.type, data.data) });
    }

    case 'GET /api/page': {
      const file = pageFile(url.searchParams.get('path'));
      return sendJson(res, 200, { path: toPosix(path.relative(rootDir, file)), html: fs.readFileSync(file, 'utf8') });
    }

    case 'POST /api/page': {
      const data = await readJsonBody(req);
      const file = pageFile(data.path);
      if (generatedPage(file)) throw new ApiError(409, 'このページは記事データから自動生成されます。記事エディタ（/admin/editor/）で編集してください。');
      if (typeof data.bodyHtml !== 'string' || !data.bodyHtml.trim()) throw new ApiError(400, '本文が空です');
      const html = fs.readFileSync(file, 'utf8');
      const open = /<body[^>]*>/i.exec(html);
      const close = html.lastIndexOf('</body>');
      if (!open || close < 0) throw new ApiError(422, 'body要素が見つかりません');
      const next = html.slice(0, open.index + open[0].length) + matchEol(html, data.bodyHtml) + html.slice(close);
      if (next === html) return sendJson(res, 200, { ok: true, changed: false });
      const backupId = backupFile(file, 'ページ文字編集で保存');
      fs.writeFileSync(file, next, 'utf8');
      return sendJson(res, 200, { ok: true, changed: true, backupId });
    }

    case 'GET /api/history': {
      const src = historySource(url.searchParams.get('path'));
      return sendJson(res, 200, { history: src ? listBackups(src) : [] });
    }

    case 'POST /api/restore': {
      const data = await readJsonBody(req);
      const src = historySource(data.path);
      if (!src) throw new ApiError(400, 'このページには変更履歴がありません');
      const restored = readBackup(src, data.id);
      backupFile(src, `履歴 ${labelFromId(data.id)} を復元する前の状態`);

      // 記事（元データ）なら、復元後にページを作り直し、タイトルが変わっていればサイト内リンクも戻す
      if (src.endsWith('.md')) {
        const ref = articleRef(toPosix(path.relative(articlesBuild.CONTENT_DIR, src)).replace(/\.md$/, ''));
        const before = articlesBuild.readArticle(ref.category, ref.slug);
        fs.writeFileSync(src, restored, 'utf8');
        const after = articlesBuild.readArticle(ref.category, ref.slug);
        const build = runBuild();
        const linkedFiles = before.title !== after.title ? syncLinkTitles(path.join(rootDir, ref.category, ref.slug), before.title, after.title) : [];
        return sendJson(res, 200, { ok: true, changed: build.changed, linkedFiles });
      }
      fs.writeFileSync(src, restored, 'utf8');
      return sendJson(res, 200, { ok: true });
    }

    default:
      throw new ApiError(404, 'APIが見つかりません');
  }
}

const server = http.createServer((req, res) => {
  const requestPath = req.url || '/';

  if (requestPath.startsWith('/api/')) {
    const url = new URL(requestPath, 'http://localhost');
    handleApi(req, res, url).catch((err) => {
      const status = err instanceof ApiError ? err.status : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { ok: false, error: err.message || 'サーバーエラー' });
    });
    return;
  }

  let resolvedPath;
  try {
    resolvedPath = resolvePath(requestPath);
  } catch {
    resolvedPath = null;
  }

  if (!resolvedPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err) {
      const directoryIndex = path.join(resolvedPath, 'index.html');
      fs.stat(directoryIndex, (dirErr) => {
        if (!dirErr) {
          sendFile(res, directoryIndex);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      });
      return;
    }

    if (stats.isDirectory()) {
      // /admin のように末尾スラッシュがないと相対パスのCSS・JSが読めないため、/admin/ に転送する
      const [pathname, query = ''] = requestPath.split(/\?(.*)/s);
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${query ? `?${query}` : ''}` });
        res.end();
        return;
      }
      const indexFile = path.join(resolvedPath, 'index.html');
      fs.stat(indexFile, (indexErr) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }
        sendFile(res, indexFile);
      });
      return;
    }

    sendFile(res, resolvedPath);
  });
});

server.listen(port, () => {
  console.log(`Site is running at http://localhost:${port}`);
  console.log(`記事エディタ: http://localhost:${port}/admin/editor/`);
  console.log(`アクセス解析: http://localhost:${port}/admin/dashboard.html`);
  console.log(`LP（../lp/ フォルダ）: http://localhost:${port}/lp/<LP名>/`);
});
