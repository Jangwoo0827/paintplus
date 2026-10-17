'use strict';
/*
 * 튜토리얼: 2D 그림 / 3D 모델 각각 한 편. 화면 요소를 강조하고, 직접 해 보면 자동으로 다음 단계로 넘어간다.
 */
(function (PP) {
  const q = (s) => () => document.querySelector(s);
  let cur = null; // {kind, steps, i, ctx, card, ring, timer}

  // ---------- 2D ----------
  const STEPS_2D = [
    { title: '그림판+ 2D 둘러보기', text: '새 도화지를 하나 열어 두었어요. 약 3분이면 끝나요. 중간에 “건너뛰기”로 언제든 나갈 수 있어요.' },
    { title: '도구 상자', target: q('#toolbox'), text: '왼쪽이 도구 상자예요. 연필·브러시·지우개·페인트통·도형·선택·텍스트가 모여 있고, 마우스를 올리면 이름과 단축키가 보여요.' },
    { title: '브러시 고르기', target: q('#toolbox [data-tool="brush"]'), text: '브러시(B) 도구를 눌러 보세요.', check: () => PP.state.tool === 'brush', hint: '👆 브러시를 클릭하세요' },
    { title: '브러시 옵션', target: q('#optionsbar'), text: '위쪽 옵션 바에서 브러시 종류(수채화·분필·네온 등), 크기, 불투명도, 대칭을 바꿔요. 키보드 [ ] 로 크기를 빠르게 조절할 수 있어요.' },
    { title: '색 고르기', target: q('#panel-color'), text: '오른쪽 색상 패널에서 전경색을 바꿔 보세요. (X 키는 전경/배경색 교체, D 키는 기본색)', onEnter: (c) => { c.fg = PP.state.fg; }, check: (c) => PP.state.fg !== c.fg, hint: '👆 다른 색을 고르세요' },
    { title: '그려 보기', target: q('#stage'), text: '캔버스에서 마우스(또는 펜)로 드래그해 선을 그어 보세요. 펜이면 누르는 세기에 따라 굵기가 달라져요.', check: () => PP.history.canUndo(), hint: '👆 캔버스에 선을 그어 보세요' },
    { title: '레이어', target: q('#panel-layers'), text: '그림은 레이어(투명한 종이)에 나눠 그리면 고치기 쉬워요. 레이어 패널의 ＋ 버튼(Ctrl+Shift+N)으로 새 레이어를 만들어 보세요. 블렌드 모드·불투명도·클리핑 마스크도 여기서 설정해요.', onEnter: (c) => { c.n = PP.doc.layers.length; }, check: (c) => PP.doc.layers.length > c.n, hint: '👆 새 레이어를 만드세요' },
    { title: '선택과 변형', target: q('#toolbox [data-tool="selrect"]'), text: '사각형 선택(V)·자유형·마술봉(M)으로 영역을 고르면 이동·복사·삭제·자유 변형(Ctrl+T)을 할 수 있어요. 선택 후 Enter 로 확정해요.' },
    { title: '실행 취소는 언제나', target: q('#menubar .bar-btn'), text: '실수해도 괜찮아요. Ctrl+Z 로 되돌리고 Ctrl+Y 로 다시 해요. 오른쪽 히스토리 패널에서 원하는 시점으로 한 번에 돌아갈 수도 있어요.', onEnter: (c) => { c.can = PP.history.canUndo(); }, check: () => !PP.history.canUndo(), hint: '(되돌려 보려면 Ctrl+Z 를 눌러 보세요)', optional: true },
    { title: '필터와 이미지 메뉴', target: q('#menubar'), text: '메뉴의 “필터”와 “이미지”에서 흐림·모자이크·색 보정·크기 조절 같은 기능을 쓸 수 있어요.' },
    { title: '저장하기', target: q('#menubar'), text: '파일 > 저장(Ctrl+S)은 레이어가 살아있는 .paintplus 프로젝트로, 다른 이름으로 저장은 PNG/JPG/WebP 로도 내보낼 수 있어요.' },
    { title: '끝!', text: '이제 자유롭게 그려 보세요. F1 은 단축키 목록, 설정에서 테마와 업데이트를 확인할 수 있고, 3D 튜토리얼은 도움말 메뉴나 시작 화면(⌂)에서 시작해요.' },
  ];

  // ---------- 3D ----------
  const T3 = () => PP.three;
  const STEPS_3D = [
    { title: '3D 작업실 둘러보기', text: '큐브와 조명이 놓인 새 3D 장면을 열었어요. 모델을 배치하고, 점·선·면을 직접 깎아서 만들 수 있어요. 약 4분이면 끝나요.' },
    { title: '시점 돌리기', target: q('#stage3d'), text: '왼쪽 버튼 드래그: 회전 · 오른쪽/가운데 드래그: 이동 · 휠: 확대/축소. 한번 돌려 보세요. (상단 앞/옆/위/원근 버튼으로 정면 시점도 볼 수 있어요)', onEnter: (c) => { const p = T3().gl.camera.position; c.p = p.toArray(); }, check: (c) => { const P = T3().gl.camera.position; return P.distanceTo(P.clone().fromArray(c.p)) > 0.3; }, hint: '👆 화면을 드래그해 돌려 보세요' },
    { title: '물체 선택', target: q('#stage3d'), text: '큐브를 클릭해 선택하세요. 빈 곳을 클릭하면 선택이 풀려요. 오른쪽 아웃라이너에서도 고를 수 있어요.', check: () => !!T3().sel && T3().scene.byId(T3().sel) && T3().scene.byId(T3().sel).type === 'mesh', hint: '👆 큐브를 클릭하세요' },
    { title: '이동 · 회전 · 크기', target: q('#tb3d'), text: '선택하면 기즈모(화살표)가 나타나요. G 이동, R 회전, S 크기 도구예요. 화살표를 끌어 큐브를 옮겨 보세요. 상단 “스냅”을 켜면 격자에 딱딱 맞아요.', onEnter: (c) => { c.i = T3().scene.index; }, check: (c) => T3().scene.index > c.i, hint: '👆 기즈모를 끌어 보세요' },
    { title: '물체 추가', target: q('#side3d .add3d'), text: '오른쪽 “추가”에서 구·원기둥·토러스 등 기본 도형과 조명을 넣어요. 하나 추가해 보세요.', onEnter: (c) => { c.n = T3().scene.items.length; }, check: (c) => T3().scene.items.length > c.n, hint: '👆 도형을 추가하세요' },
    { title: '재질 바꾸기', target: q('#side3d .props3d'), text: '속성 패널에서 이름, 위치/회전/크기 숫자, 색, 거칠기, 금속성을 바꿔요. 상단 “표시 방식”을 “렌더(그림자)”로 바꾸면 더 실제처럼 보여요.' },
    { title: '편집 모드 들어가기', target: q('#tb3d .tool-btn[title^="편집 모드"]'), text: '물체를 고르고 Tab (또는 ✎ 버튼)을 누르면 점·선·면을 직접 편집하는 편집 모드가 돼요. 큐브를 선택한 뒤 들어가 보세요.', check: () => !!T3().edit.on, hint: '👆 큐브 선택 후 Tab' },
    { title: '면 선택 후 돌출', target: () => { const e = document.querySelector('.edit3d'); return e ? e.parentElement : null; }, text: '3 키로 면 모드로 바꾸고, 큐브의 한 면을 클릭한 뒤 E 키(또는 “돌출” 버튼)를 눌러 보세요. 면이 튀어나와요. (1 점 · 2 선 · 3 면 · Shift+클릭으로 여러 개 · Shift+드래그로 사각형 선택 · Alt+클릭으로 한 줄(루프) 선택)', onEnter: (c) => { const it = T3().scene.byId(T3().sel); c.f = it && it.em ? it.em.f.length : 0; }, check: (c) => { const it = T3().scene.byId(T3().sel); return !!(it && it.em && it.em.f.length > c.f); }, hint: '👆 면 클릭 → E' },
    { title: '모양 다듬기', target: q('#stage3d'), text: '돌출한 면은 선택된 채로 있어요. G 로 기즈모를 켜서 끌거나, I(인셋)·B(베벨)·L(루프 컷)·M(병합)·W(세분화)·X(삭제)로 모양을 만들어 가요. 잘못하면 Ctrl+Z!' },
    { title: '모디파이어', target: q('#side3d .mods3d'), text: '속성 패널 아래 “모디파이어”는 원본을 건드리지 않는 효과예요. “미러”로 절반만 만들어도 대칭이 되고, “서브디비전”은 표면을 둥글게, “배열”은 복사해 늘어놓고, “솔리드화”는 얇은 면에 두께를 줘요. 하나 추가해 보세요.', check: () => { const it = T3().scene.byId(T3().sel); return !!(it && it.mods && it.mods.length); }, hint: '👆 “+ 서브디비전” 등을 누르세요' },
    { title: '편집 끝내기와 저장', target: q('#menubar'), text: 'Tab 으로 편집 모드를 나와요. 파일 메뉴에서 .pp3d 로 저장하고, GLB/OBJ/STL 로 내보내 다른 3D 프로그램·프린터에 쓰거나, “렌더 이미지/2D로 보내기”로 그림판에서 이어서 색칠할 수 있어요.' },
    { title: '끝!', text: '캐릭터나 소품(컵, 의자, 로봇…)을 도형 + 돌출 + 모디파이어로 만들어 보세요. 팁: 미러 모디파이어를 먼저 걸고 한쪽만 다듬으면 빨라요.' },
  ];

  // ---------- 엔진 ----------
  function ensureDoc(kind) {
    if (kind === '2d') {
      PP.hub && PP.hub.close();
      PP.tabs.new2d(1000, 700, '#ffffff', '튜토리얼');
    } else {
      PP.hub && PP.hub.close();
      PP.tabs.new3d();
    }
  }

  function render() {
    const s = cur.steps[cur.i];
    cur.card.querySelector('.tut-step').textContent = `${cur.i + 1} / ${cur.steps.length}`;
    cur.card.querySelector('.tut-title').textContent = s.title;
    cur.card.querySelector('.tut-text').textContent = s.text;
    const hint = cur.card.querySelector('.tut-hint');
    hint.textContent = s.hint || '';
    hint.hidden = !s.hint;
    cur.card.querySelector('.tut-prev').disabled = cur.i === 0;
    const last = cur.i === cur.steps.length - 1;
    const next = cur.card.querySelector('.tut-next');
    next.textContent = last ? '완료' : s.check && !s.optional ? '건너뛰고 다음' : '다음';
    cur.card.querySelector('.tut-skip').hidden = last;
    cur.ctx = {};
    if (s.onEnter) { try { s.onEnter(cur.ctx); } catch (e) { console.error(e); } }
    cur.done = false;
    cur.card.classList.remove('ok');
    place();
  }

  function place() {
    if (!cur) return;
    const s = cur.steps[cur.i];
    let el = null;
    try { el = s.target ? s.target() : null; } catch (e) { el = null; }
    const r = el && el.getBoundingClientRect();
    const ring = cur.ring, card = cur.card, vw = innerWidth, vh = innerHeight;
    if (r && r.width > 2 && r.height > 2 && el.offsetParent !== null) {
      ring.hidden = false;
      Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    } else ring.hidden = true;
    if (document.body.classList.contains('mobile')) {
      Object.assign(card.style, { left: '8px', right: '8px', bottom: '8px', top: 'auto', width: 'auto' });
      return;
    }
    const cx = r ? r.left + r.width / 2 : vw / 2;
    const w = 340;
    let left;
    if (!r) left = (vw - w) / 2;
    else if (cx > vw * 0.55) left = Math.max(96, r.left - w - 20 > 96 && r.width < vw * 0.5 ? r.left - w - 20 : 96);
    else left = Math.min(vw - w - 20, r.width < vw * 0.5 ? r.right + 20 : vw - w - 20);
    Object.assign(card.style, { left: Math.max(8, left) + 'px', right: 'auto', width: w + 'px', top: 'auto', bottom: Math.min(60, vh * 0.08) + 'px' });
    if (r && r.width >= vw * 0.5) card.style.left = vw - w - 20 + 'px'; // 큰 영역(캔버스) 강조 시 오른쪽 구석
  }

  function advance(d) {
    if (!cur) return;
    const n = cur.i + d;
    if (n < 0) return;
    if (n >= cur.steps.length) { stop(true); return; }
    cur.i = n;
    render();
  }

  function tick() {
    if (!cur) return;
    place();
    const s = cur.steps[cur.i];
    if (s.check && !cur.done) {
      let ok = false;
      try { ok = s.check(cur.ctx); } catch (e) { ok = false; }
      if (ok && !s.optional) {
        cur.done = true;
        cur.card.classList.add('ok');
        cur.card.querySelector('.tut-hint').textContent = '✓ 잘했어요!';
        cur.card.querySelector('.tut-hint').hidden = false;
        const at = cur.i;
        setTimeout(() => { if (cur && cur.i === at) advance(1); }, 900);
      }
    }
  }

  function stop(finished) {
    if (!cur) return;
    clearInterval(cur.timer);
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', cur.key, true);
    cur.card.remove();
    cur.ring.remove();
    const kind = cur.kind;
    cur = null;
    try { localStorage.setItem('pp.tut.' + kind, '1'); } catch (e) { /* 저장소를 쓸 수 없어도 무시 */ }
    if (finished) PP.toast('튜토리얼을 마쳤어요 🎉');
  }

  PP.tutorial = {
    active: () => !!cur,
    start(kind) {
      if (cur) stop(false);
      ensureDoc(kind);
      const steps = kind === '3d' ? STEPS_3D : STEPS_2D;
      const card = PP.el('div', { class: 'tut-card' },
        PP.el('div', { class: 'tut-head' }, PP.el('span', { class: 'tut-step' }), PP.el('button', { class: 'tut-x', text: '✕', title: '종료 (Esc)', onclick: () => stop(false) })),
        PP.el('div', { class: 'tut-title' }), PP.el('div', { class: 'tut-text' }), PP.el('div', { class: 'tut-hint' }),
        PP.el('div', { class: 'tut-btns' },
          PP.el('button', { class: 'tut-prev', text: '이전', onclick: () => advance(-1) }),
          PP.el('button', { class: 'tut-skip', text: '튜토리얼 종료', onclick: () => stop(false) }),
          PP.el('button', { class: 'tut-next primary', text: '다음', onclick: () => advance(1) })));
      const ring = PP.el('div', { class: 'tut-ring' });
      ring.hidden = true;
      document.body.append(ring, card);
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); stop(false); } };
      document.addEventListener('keydown', key, true);
      window.addEventListener('resize', place);
      cur = { kind, steps, i: 0, ctx: {}, card, ring, key, timer: setInterval(tick, 350), done: false };
      setTimeout(() => { if (cur) render(); }, 350); // 새 탭이 자리 잡은 뒤 첫 단계 표시
      render();
    },
  };

  PP.defCmd('help.tutorial2d', '2D 그림 튜토리얼', '', () => PP.tutorial.start('2d'));
  PP.defCmd('help.tutorial3d', '3D 모델 튜토리얼', '', () => PP.tutorial.start('3d'));
})(window.PP);
