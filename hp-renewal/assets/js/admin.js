/* 運営者ページのモック認証
 * - /admin/ : ログイン画面 + ダッシュボード（運営ツール一覧）
 * - 運営専用ページ（例: /column/post/）は [data-admin-guard] を置くとログイン必須になる
 *
 * ⚠ これはモック（デモ）です。認証はブラウザ内（sessionStorage）でのみ判定され、
 *   実際のアクセス制御・セキュリティ保護はありません。本番ではサーバー側認証に置き換えてください。
 */
(() => {
  const AUTH_KEY = 'kcc-admin:auth';
  // --- モック認証情報（本番では削除しサーバー認証へ）---
  const MOCK_USER = 'admin';
  const MOCK_PASS = 'kuchikomi';

  const $ = (sel, root = document) => root.querySelector(sel);
  const isAuthed = () => sessionStorage.getItem(AUTH_KEY) === '1';
  const setAuthed = (on) => on ? sessionStorage.setItem(AUTH_KEY, '1') : sessionStorage.removeItem(AUTH_KEY);

  /* ---------- /admin/ ハブ（ログイン + ダッシュボード） ---------- */
  function initHub() {
    const page = $('[data-admin-page]');
    if (!page) return false;

    const loginView = $('[data-admin-login]', page);
    const dashView = $('[data-admin-dashboard]', page);
    const form = $('[data-admin-form]', page);
    const errEl = $('[data-admin-error]', page);

    const render = () => {
      const authed = isAuthed();
      if (loginView) loginView.hidden = authed;
      if (dashView) dashView.hidden = !authed;
    };

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const user = (form.querySelector('[name=user]').value || '').trim();
        const pass = form.querySelector('[name=pass]').value || '';
        if (user === MOCK_USER && pass === MOCK_PASS) {
          setAuthed(true);
          if (errEl) errEl.hidden = true;
          const ret = new URLSearchParams(location.search).get('return');
          if (ret && ret.startsWith('/')) { location.href = ret; return; }
          render();
        } else if (errEl) {
          errEl.hidden = false;
          form.querySelector('[name=pass]').value = '';
          form.querySelector('[name=pass]').focus();
        }
      });
    }

    page.querySelectorAll('[data-admin-logout]').forEach((btn) =>
      btn.addEventListener('click', () => { setAuthed(false); render(); }));

    render();
    return true;
  }

  /* ---------- 運営専用ページのガード ---------- */
  function initGuard() {
    const guard = $('[data-admin-guard]');
    if (!guard) return false;
    const home = guard.getAttribute('data-admin-home') || '/admin/';

    if (!isAuthed()) {
      location.replace(`${home}?return=${encodeURIComponent(location.pathname + location.search)}`);
      return true;
    }
    // 認証済み: コンテンツを表示し、運営ステータスバーを出す
    document.querySelectorAll('[data-admin-content]').forEach((el) => { el.hidden = false; });
    injectStatusBar(home);
    return true;
  }

  function injectStatusBar(home) {
    if ($('.admin-status')) return;
    const bar = document.createElement('div');
    bar.className = 'admin-status';
    bar.dataset.editorSkip = 'true';
    bar.innerHTML = `
      <span class="admin-status__dot" aria-hidden="true"></span>
      <span class="admin-status__label">運営者モード</span>
      <a class="admin-status__link" href="${home}">管理トップ</a>
      <button type="button" class="admin-status__logout" data-admin-logout>ログアウト</button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-admin-logout]').addEventListener('click', () => {
      setAuthed(false);
      location.replace(home);
    });
  }

  function run() {
    if (initHub()) return;
    initGuard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
