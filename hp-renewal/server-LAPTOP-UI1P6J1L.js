const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT) || 8080;
const backupDir = path.join(rootDir, '_backups');
const allowRemoteEdit = process.env.ALLOW_REMOTE_EDIT === '1';
const maxBackupsPerFile = 100;

// 記事エディタの対象カテゴリ（/<category>/<slug>/index.html が記事本体）
const articleCategories = {
  column: 'コラム・ノウハウ',
  knowledge: '基礎知識',
  notice: 'お知らせ・注意喚起'
};
const newsTags = [
  { label: 'お知らせ', className: 'tag ' },
  { label: '注意喚起', className: 'tag tag--alert' },
  { label: 'コラム', className: 'tag tag--column' }
];

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

function resolvePath(requestPath) {
  const cleanPath = requestPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(cleanPath);
  const target = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(rootDir, target));

  if (!resolved.startsWith(rootDir)) {
    return null;
  }

  if (path.relative(rootDir, resolved).split(path.sep)[0] === '_backups') {
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
  p = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '/index.html';

  const abs = path.normalize(path.join(rootDir, p));
  const rel = path.relative(rootDir, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new ApiError(400, '不正なパスです');
  if (path.extname(abs).toLowerCase() !== '.html') throw new ApiError(400, 'HTMLページ以外は編集できません');
  const top = rel.split(path.sep)[0];
  if (top.startsWith('_') || top === 'admin' || top === 'node_modules') throw new ApiError(403, 'このページは編集対象外です');
  if (!fs.existsSync(abs)) throw new ApiError(404, 'ページが見つかりません');
  return abs;
}

function articleInfo(articlePath) {
  const m = /^\/?([a-z0-9-]+)\/([a-z0-9-]+)\/?(?:index\.html)?$/i.exec(String(articlePath || ''));
  if (!m || !articleCategories[m[1]]) throw new ApiError(400, '記事のパスが正しくありません');
  const [, category, slug] = m;
  const file = path.join(rootDir, category, slug, 'index.html');
  if (!fs.existsSync(file)) throw new ApiError(404, '記事が見つかりません');
  return { category, slug, file, dir: path.dirname(file), indexFile: path.join(rootDir, category, 'index.html') };
}

function listHtmlFiles(dir = rootDir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'node_modules' || entry.name === 'admin') continue;
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
  return path.join(backupDir, toPosix(path.relative(rootDir, file)).replace(/\//g, '__'));
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
/* 記事HTMLの読み書き                                                  */
/* ------------------------------------------------------------------ */

// 開始タグ直後の位置から、対応する閉じタグの位置を探す（入れ子対応）
function findMatchingClose(html, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth -= 1;
      if (depth === 0) return m.index;
    } else if (!m[0].endsWith('/>')) {
      depth += 1;
    }
  }
  return -1;
}

function proseRange(html) {
  const m = /<div class="prose">/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = findMatchingClose(html, start, 'div');
  return end < 0 ? null : { start, end };
}

function pageHeaderRange(html) {
  const m = /<section class="page-header">/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = html.indexOf('</section>', start);
  return end < 0 ? null : { start, end };
}

function parseArticleHtml(html) {
  const pick = (re, src = html) => { const m = re.exec(src); return m ? m[1] : ''; };
  const headerRange = pageHeaderRange(html);
  const header = headerRange ? html.slice(headerRange.start, headerRange.end) : '';
  const prose = proseRange(html);
  if (!prose) throw new ApiError(422, '記事本文（.prose）が見つかりません');
  return {
    seoTitle: decodeText(pick(/<title>([\s\S]*?)<\/title>/)),
    description: decodeText(pick(/<meta name="description" content="([^"]*)"/)),
    en: decodeText(pick(/<span class="en">([\s\S]*?)<\/span>/, header)),
    h1: decodeText(pick(/<h1[^>]*>([\s\S]*?)<\/h1>/, header)),
    lead: decodeText(pick(/<p[^>]*>([\s\S]*?)<\/p>/, header)),
    bodyHtml: html.slice(prose.start, prose.end).replace(/^\s*\n/, '').replace(/\s+$/, '')
  };
}

function readListing(info) {
  if (!fs.existsSync(info.indexFile)) return null;
  const html = fs.readFileSync(info.indexFile, 'utf8');
  const href = escapeRegExp(`${info.slug}/`);
  const banner = new RegExp(`<a href="${href}" class="banner">([\\s\\S]*?)</a>`).exec(html);
  if (banner) {
    const sub = /<div class="banner__sub">([\s\S]*?)<\/div>/.exec(banner[1]);
    return { kind: 'banner', sub: sub ? decodeText(sub[1]) : '' };
  }
  const news = new RegExp(`<div class="news-item"><time>([^<]*)</time><span class="([^"]*)">([^<]*)</span><a href="${href}">`).exec(html);
  if (news) {
    return { kind: 'news', date: decodeText(news[1]), tag: decodeText(news[3]), tags: newsTags.map((t) => t.label) };
  }
  return null;
}

function writeListing(info, listing) {
  if (!listing || !fs.existsSync(info.indexFile)) return false;
  const html = fs.readFileSync(info.indexFile, 'utf8');
  const href = escapeRegExp(`${info.slug}/`);
  let next = html;

  if (listing.kind === 'banner' && typeof listing.sub === 'string') {
    next = html.replace(new RegExp(`(<a href="${href}" class="banner">[\\s\\S]*?<div class="banner__sub">)[\\s\\S]*?(</div>)`),
      (_, a, b) => `${a}${escapeText(listing.sub.trim())}${b}`);
  } else if (listing.kind === 'news') {
    const tag = newsTags.find((t) => t.label === listing.tag);
    next = html.replace(new RegExp(`<div class="news-item"><time>([^<]*)</time><span class="([^"]*)">([^<]*)</span>(<a href="${href}">)`),
      (_, date, cls, label, a) => `<div class="news-item"><time>${escapeText(listing.date ?? date)}</time><span class="${tag ? tag.className : cls}">${tag ? escapeText(tag.label) : label}</span>${a}`);
  }

  if (next === html) return false;
  backupFile(info.indexFile, '記事エディタによる一覧更新');
  fs.writeFileSync(info.indexFile, next, 'utf8');
  return true;
}

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

function applyArticle(html, data) {
  let next = html;
  const replaceOnce = (re, fn) => { next = next.replace(re, fn); };

  if (typeof data.seoTitle === 'string') {
    replaceOnce(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeText(data.seoTitle.trim())}</title>`);
    replaceOnce(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => `${a}${escapeAttr(data.seoTitle.trim())}${b}`);
  }
  if (typeof data.description === 'string') {
    const d = data.description.trim();
    replaceOnce(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => `${a}${escapeAttr(d)}${b}`);
    replaceOnce(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => `${a}${escapeAttr(d)}${b}`);
  }

  const headerRange = pageHeaderRange(next);
  if (headerRange) {
    let header = next.slice(headerRange.start, headerRange.end);
    if (typeof data.en === 'string') header = header.replace(/(<span class="en">)[\s\S]*?(<\/span>)/, (_, a, b) => `${a}${escapeText(data.en.trim())}${b}`);
    if (typeof data.h1 === 'string') header = header.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, (_, a, b) => `${a}${escapeText(data.h1.trim())}${b}`);
    if (typeof data.lead === 'string') header = header.replace(/(<p[^>]*>)[\s\S]*?(<\/p>)/, (_, a, b) => `${a}${escapeText(data.lead.trim())}${b}`);
    next = next.slice(0, headerRange.start) + header + next.slice(headerRange.end);
  }

  if (typeof data.h1 === 'string') {
    replaceOnce(/(<p class="breadcrumb">[\s\S]*?<span>›<\/span>)([^<]*)(<\/p>)/, (_, a, _old, b) => `${a}${escapeText(data.h1.trim())}${b}`);
  }

  if (typeof data.bodyHtml === 'string') {
    const range = proseRange(next);
    if (!range) throw new ApiError(422, '記事本文（.prose）が見つかりません');
    next = `${next.slice(0, range.start)}\n${data.bodyHtml.replace(/\s+$/, '')}\n        ${next.slice(range.end)}`;
  }
  return next;
}

function listArticles() {
  const result = [];
  for (const [category, label] of Object.entries(articleCategories)) {
    const dir = path.join(rootDir, category);
    if (!fs.existsSync(dir)) continue;
    const indexHtml = fs.existsSync(path.join(dir, 'index.html')) ? fs.readFileSync(path.join(dir, 'index.html'), 'utf8') : '';
    const order = [...indexHtml.matchAll(/<a href="([a-z0-9-]+)\/"/gi)].map((m) => m[1]);
    const slugs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.html')))
      .map((e) => e.name)
      .sort((a, b) => {
        const ia = order.indexOf(a); const ib = order.indexOf(b);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
      });
    for (const slug of slugs) {
      const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
      if (!proseRange(html)) continue;
      const h1 = /<section class="page-header">[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      const stat = fs.statSync(path.join(dir, slug, 'index.html'));
      result.push({ path: `${category}/${slug}`, category, categoryLabel: label, slug, title: h1 ? decodeText(h1[1]) : slug, updatedAt: stat.mtime.toISOString() });
    }
  }
  return result;
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
    case 'GET /api/articles':
      return sendJson(res, 200, { categories: articleCategories, articles: listArticles() });

    case 'GET /api/article': {
      const info = articleInfo(url.searchParams.get('path'));
      const article = parseArticleHtml(fs.readFileSync(info.file, 'utf8'));
      return sendJson(res, 200, {
        path: `${info.category}/${info.slug}`,
        url: `/${info.category}/${info.slug}/`,
        category: info.category,
        categoryLabel: articleCategories[info.category],
        ...article,
        listing: readListing(info)
      });
    }

    case 'POST /api/article': {
      const data = await readJsonBody(req);
      const info = articleInfo(data.path);
      const html = fs.readFileSync(info.file, 'utf8');
      const before = parseArticleHtml(html);
      const next = applyArticle(html, data);
      const backupId = next !== html ? backupFile(info.file, `記事エディタで保存（${before.h1}）`) : null;
      if (next !== html) fs.writeFileSync(info.file, next, 'utf8');
      const listingUpdated = writeListing(info, data.listing);
      const linkedFiles = syncLinkTitles(info.dir, before.h1, typeof data.h1 === 'string' ? data.h1.trim() : before.h1);
      return sendJson(res, 200, { ok: true, changed: next !== html, backupId, listingUpdated, linkedFiles });
    }

    case 'GET /api/page': {
      const file = pageFile(url.searchParams.get('path'));
      return sendJson(res, 200, { path: toPosix(path.relative(rootDir, file)), html: fs.readFileSync(file, 'utf8') });
    }

    case 'POST /api/page': {
      const data = await readJsonBody(req);
      const file = pageFile(data.path);
      if (typeof data.bodyHtml !== 'string' || !data.bodyHtml.trim()) throw new ApiError(400, '本文が空です');
      const html = fs.readFileSync(file, 'utf8');
      const open = /<body[^>]*>/i.exec(html);
      const close = html.lastIndexOf('</body>');
      if (!open || close < 0) throw new ApiError(422, 'body要素が見つかりません');
      const next = html.slice(0, open.index + open[0].length) + data.bodyHtml + html.slice(close);
      if (next === html) return sendJson(res, 200, { ok: true, changed: false });
      const backupId = backupFile(file, 'ページ文字編集で保存');
      fs.writeFileSync(file, next, 'utf8');
      return sendJson(res, 200, { ok: true, changed: true, backupId });
    }

    case 'GET /api/history': {
      const file = pageFile(url.searchParams.get('path'));
      return sendJson(res, 200, { history: listBackups(file) });
    }

    case 'POST /api/restore': {
      const data = await readJsonBody(req);
      const file = pageFile(data.path);
      const restored = readBackup(file, data.id);
      const current = fs.readFileSync(file, 'utf8');
      backupFile(file, `履歴 ${labelFromId(data.id)} を復元する前の状態`);
      fs.writeFileSync(file, restored, 'utf8');

      // 記事ならタイトル変更に合わせてサイト内リンクも戻す
      let linkedFiles = [];
      try {
        const rel = toPosix(path.relative(rootDir, path.dirname(file)));
        articleInfo(rel);
        linkedFiles = syncLinkTitles(path.dirname(file), parseArticleHtml(current).h1, parseArticleHtml(restored).h1);
      } catch { /* 記事以外のページ */ }
      return sendJson(res, 200, { ok: true, linkedFiles });
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
  console.log(`記事エディタ: http://localhost:${port}/admin/`);
});
