'use strict';
/* 첫 페인트 전에 실행: 터치 기기면 모바일 레이아웃 클래스를 미리 붙여 반쯤 만들어진 데스크톱 UI가 보이지 않게 한다 */
(function () {
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (native || matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('mobile');
})();
