/* 参考文稿库的设备识别方式；保留旧链接的参数及锚点。 */
(function () {
  'use strict';
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  const query = new URLSearchParams(location.search);
  const forced = [query.get('mode'), query.get('v')].find(v => v === 'mobile' || v === 'desktop');
  const ua = navigator.userAgent || '';
  const coarse = typeof matchMedia === 'function' &&
    (matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches);
  const mobile = /Android|iPhone|iPod|iPad|Mobile|HarmonyOS|Tablet|Windows Phone/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
    !!(navigator.userAgentData && navigator.userAgentData.mobile) || innerWidth < 820 ||
    (coarse && Math.min(screen.width || 9999, screen.height || 9999) < 1100);
  const target = (forced || (mobile ? 'mobile' : 'desktop')) + '.html';
  if (location.pathname.endsWith('/' + target)) return;
  const url = new URL(target, location.href);
  url.search = location.search;
  url.hash = location.hash;
  location.replace(url.href);
})();
