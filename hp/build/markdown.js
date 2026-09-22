// 記事の元データ（Markdown＋先頭の設定）と、記事エディタ／ページ用HTMLの相互変換
const { marked } = require('./vendor/marked.cjs');

marked.setOptions({ gfm: true, breaks: false });

/* ------------------------------------------------------------------ */
/* 先頭の設定（front matter）                                           */
/* ------------------------------------------------------------------ */

// 対応する書き方：`key: 値` / `key: [a, b]` / true・false / 数値 / "引用符つき文字列"
function parseFrontMatter(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]] = parseValue(kv[2].trim());
  }
  return { data, body: src.slice(m[0].length) };
}

function parseValue(v) {
  if (v === '') return '';
  if (v === 'true' || v === 'false') return v === 'true';
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseValue(s.trim())).filter((s) => s !== '');
  }
  return v;
}

function formatValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => formatValue(x)).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v ?? '');
  // 記号を含む文字列は引用符で囲む（YAMLとして読んでも同じ意味になるように）
  return /^[\w\-./ぁ-んァ-ヶ一-龠々ー（）()・、。！？「」『』]+$/.test(s) && !/^(true|false|-?\d+(\.\d+)?)$/.test(s) ? s : JSON.stringify(s);
}

function stringifyFrontMatter(data, body) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'string' && v === '' ))
    .map(([k, v]) => `${k}: ${formatValue(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${String(body).trim()}\n`;
}

/* ------------------------------------------------------------------ */
/* Markdown → HTML                                                      */
/* ------------------------------------------------------------------ */

function mdToHtml(md) {
  return marked.parse(String(md || '')).trim();
}

/* ------------------------------------------------------------------ */
/* HTML（記事エディタの本文） → Markdown                                 */
/* ------------------------------------------------------------------ */

const PUNCT = /^[\s「」『』（）()【】［］\[\]、。，．！？!?:：；;"'“”‘’・…—\-]|[\s「」『』（）()【】［］\[\]、。，．！？!?:：；;"'“”‘’・…—\-]$/;

function findClose(html, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { depth -= 1; if (depth === 0) return { start: m.index, end: m.index + m[0].length }; }
    else if (!m[0].endsWith('/>')) depth += 1;
  }
  return null;
}

// 最上位の要素ごとに分ける（要素の外にある文字は段落として扱う）
function splitBlocks(html) {
  const blocks = [];
  let i = 0;
  const src = String(html || '');
  while (i < src.length) {
    const next = src.indexOf('<', i);
    const text = (next < 0 ? src.slice(i) : src.slice(i, next)).trim();
    if (text) blocks.push({ tag: '#text', outer: text, inner: text, attrs: '' });
    if (next < 0) break;
    if (src.startsWith('<!--', next)) {
      const end = src.indexOf('-->', next);
      const stop = end < 0 ? src.length : end + 3;
      blocks.push({ tag: '#comment', outer: src.slice(next, stop) });
      i = stop;
      continue;
    }
    const open = /^<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/.exec(src.slice(next));
    if (!open) { blocks.push({ tag: '#text', outer: src.slice(next, next + 1), inner: src.slice(next, next + 1), attrs: '' }); i = next + 1; continue; }
    const tag = open[1].toLowerCase();
    const afterOpen = next + open[0].length;
    if (/^(br|hr|img|input)$/.test(tag) || open[0].endsWith('/>')) {
      blocks.push({ tag, outer: open[0], inner: '', attrs: open[2].trim() });
      i = afterOpen;
      continue;
    }
    const close = findClose(src, afterOpen, tag);
    const end = close ? close.end : src.length;
    blocks.push({ tag, attrs: open[2].trim(), outer: src.slice(next, end), inner: src.slice(afterOpen, close ? close.start : src.length) });
    i = end;
  }
  return blocks;
}

const escapeMdText = (s) => s.replace(/\\/g, '\\\\').replace(/([*_`])/g, '\\$1');

// インライン要素（強調・リンク・改行）を Markdown に。変換すると崩れそうなものは HTML のまま残す
function inlineToMd(html) {
  let out = '';
  for (const b of splitBlocks(html)) {
    if (b.tag === '#text') { out += escapeMdText(b.outer); continue; }
    if (b.tag === '#comment') continue;
    if (b.tag === 'br') { out += '<br>'; continue; }
    const inner = inlineToMd(b.inner);
    const plain = b.inner.replace(/<[^>]+>/g, '');
    if ((b.tag === 'strong' || b.tag === 'b') && !b.attrs && plain && !PUNCT.test(plain) && !/[*]/.test(b.inner)) { out += `**${inner}**`; continue; }
    if ((b.tag === 'em' || b.tag === 'i') && !b.attrs && plain && !PUNCT.test(plain) && !/[*]/.test(b.inner)) { out += `*${inner}*`; continue; }
    if (b.tag === 'a') {
      const href = /\bhref="([^"]*)"/.exec(b.attrs);
      const onlyHref = href && b.attrs.replace(/\bhref="[^"]*"/, '').trim() === '';
      if (onlyHref && !/[\s()]/.test(href[1]) && !/[[\]]/.test(plain)) { out += `[${inner}](${href[1]})`; continue; }
    }
    out += b.outer;
  }
  // 段落内の改行は保ちつつ、行頭がリストや見出しと誤解されないようにする
  return out
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n(?=(\d+\.|[-+>#]|\*\s))/g, '\n\\')
    .replace(/^(\d+)\./, '$1\\.')
    .trim();
}

function blockToMd(b) {
  if (b.tag === '#text') return inlineToMd(b.outer);
  if (b.tag === '#comment') return b.outer;
  const plainAttrs = b.attrs === '';
  if (plainAttrs && /^h[1-6]$/.test(b.tag)) return `${'#'.repeat(Number(b.tag[1]))} ${inlineToMd(b.inner).replace(/\n/g, ' ')}`;
  if (plainAttrs && b.tag === 'p') return inlineToMd(b.inner);
  if (plainAttrs && b.tag === 'blockquote') {
    const inner = /^\s*<p[\s>]/.test(b.inner) ? splitBlocks(b.inner).map(blockToMd).join('\n\n') : inlineToMd(b.inner);
    return inner.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
  }
  if (plainAttrs && (b.tag === 'ul' || b.tag === 'ol')) {
    const items = splitBlocks(b.inner).filter((x) => x.tag !== '#text' || x.outer.trim());
    const simple = items.every((x) => x.tag === 'li' && x.attrs === '' && !/<(ul|ol|p|div|table|blockquote)\b/i.test(x.inner));
    if (simple) {
      return items.map((x, i) => {
        const text = inlineToMd(x.inner).replace(/\n/g, '<br>');
        return `${b.tag === 'ol' ? `${i + 1}.` : '-'} ${text}`;
      }).join('\n');
    }
  }
  // それ以外（装飾つき段落・表など）はHTMLのまま入れる
  return b.outer.split('\n').map((l) => l.replace(/^\s{0,12}/, '')).join('\n').trim();
}

function htmlToMd(html) {
  return splitBlocks(html).map(blockToMd).filter((s) => s.trim()).join('\n\n');
}

module.exports = { parseFrontMatter, stringifyFrontMatter, mdToHtml, htmlToMd, splitBlocks };
