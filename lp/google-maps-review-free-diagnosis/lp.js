// 法人向けLP：FAQの開閉と、当社実績のカルーセル
(() => {
  /* ---- FAQ（クリックで開閉） ---- */
  document.querySelectorAll('.lp-faq__item').forEach((item) => {
    const button = item.querySelector('.lp-faq__q');
    const answer = item.querySelector('.lp-faq__a');
    button.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      answer.inert = !open;
    });
  });

  /* ---- 当社実績カルーセル ----
     769px以上：1枚ずつ横にスライド（端まで行くと先頭に戻る）
     768px以下：横スクロールの一覧（ボタンで1枚ずつ送る） */
  const carousel = document.querySelector('[data-carousel]');
  if (!carousel) return;
  const viewport = carousel.querySelector('.lp-carousel__viewport');
  const track = carousel.querySelector('.lp-carousel__track');
  const slides = [...track.children];
  const count = slides.length;
  const mobile = window.matchMedia('(max-width: 768px)');
  let index = 0;
  let timer = null;

  // ループ用に前後へ複製を並べる（読み上げ対象からは外す）
  const makeClone = (el) => {
    const c = el.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    c.classList.add('is-clone');
    c.querySelectorAll('a, button').forEach((x) => x.setAttribute('tabindex', '-1'));
    return c;
  };
  slides.slice().reverse().forEach((s) => track.prepend(makeClone(s)));
  slides.forEach((s) => track.append(makeClone(s)));

  const slideWidth = () => slides[0].getBoundingClientRect().width;
  const place = (animate) => {
    track.style.transition = animate ? '' : 'none';
    track.style.transform = `translateX(${-(index + count) * slideWidth()}px)`;
    if (!animate) { void track.offsetWidth; track.style.transition = ''; }
  };

  // 端を越えたら、見た目を変えずに本来の位置へ戻す
  let settleTimer = null;
  const settle = () => {
    clearTimeout(settleTimer);
    if (index >= count || index < 0) {
      index = ((index % count) + count) % count;
      place(false);
    }
  };

  const go = (dir) => {
    if (mobile.matches) {
      viewport.scrollBy({ left: dir * slideWidth(), behavior: 'smooth' });
      return;
    }
    index += dir;
    place(true);
    // アニメーションが無効な環境でも位置が戻るよう、終了イベントが来なくても整える
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 700);
  };

  track.addEventListener('transitionend', (e) => { if (e.target === track) settle(); });

  const setup = () => {
    track.querySelectorAll('.is-clone').forEach((c) => { c.hidden = mobile.matches; });
    if (mobile.matches) {
      track.style.transform = '';
    } else {
      place(false);
    }
  };

  carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => go(-1));
  carousel.querySelector('[data-carousel-next]').addEventListener('click', () => go(1));
  mobile.addEventListener('change', setup);
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(setup, 150); });
  setup();
})();
