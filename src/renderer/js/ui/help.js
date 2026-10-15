'use strict';
/* 도움말: 단축키 목록, 정보 */
(function (PP) {
  const SECTIONS = [
    ['도구', [
      ['연필', 'P'], ['브러시', 'B'], ['지우개', 'E'], ['페인트통', 'G'], ['그라디언트', 'Shift+G'], ['스포이드', 'I (Alt+클릭)'],
      ['직선', 'L'], ['사각형', 'R'], ['둥근 사각형', 'Shift+R'], ['원/타원', 'O'], ['삼각형', 'Y'], ['다각형', 'N'], ['화살표', 'W'], ['곡선', 'C'],
      ['텍스트', 'T'], ['사각형 선택', 'V'], ['자유형 선택', 'Shift+V'], ['손바닥', 'H / Space+드래그'], ['돋보기', 'Z'],
      ['브러시 크기', '[  ]'], ['전경/배경색 교체', 'X'], ['기본 색', 'D'],
    ]],
    ['파일 / 편집', [
      ['새로 만들기', 'Ctrl+N'], ['열기', 'Ctrl+O'], ['저장', 'Ctrl+S'], ['다른 이름으로 저장', 'Ctrl+Shift+S'],
      ['실행 취소', 'Ctrl+Z'], ['다시 실행', 'Ctrl+Y'], ['복사', 'Ctrl+C'], ['잘라내기', 'Ctrl+X'], ['붙여넣기', 'Ctrl+V'],
      ['모두 선택', 'Ctrl+A'], ['선택 해제', 'Ctrl+D'], ['선택 영역 삭제', 'Delete'], ['선택 확정', 'Enter'], ['전체 복사', 'Ctrl+Shift+C'],
    ]],
    ['보기 / 레이어', [
      ['확대 / 축소', '마우스 휠, Ctrl+휠'], ['화면에 맞춤', 'Ctrl+0'], ['100% 보기', 'Ctrl+1'], ['눈금자', 'Ctrl+R'], ['격자', "Ctrl+'"], ['격자에 맞춤', "Ctrl+Shift+'"],
      ['테마 전환', 'Ctrl+Shift+T'], ['새 레이어', 'Ctrl+Shift+N'], ['레이어 복제', 'Ctrl+J'], ['아래로 병합', 'Ctrl+E'], ['이미지 병합', 'Ctrl+Shift+E'],
      ['레이어 위/아래', 'Ctrl+]  Ctrl+['], ['밝기/대비', 'Ctrl+Shift+B'], ['색 반전', 'Ctrl+I'],
    ]],
  ];

  PP.defCmd('help.shortcuts', '단축키 보기', 'F1', () => {
    const t = PP.el('div', { class: 'help-table' });
    for (const [h, rows] of SECTIONS) {
      t.append(PP.el('div', { class: 'help-h', text: h }));
      for (const [n, k] of rows) t.append(PP.el('div', null, PP.el('span', { text: n }), PP.el('kbd', { text: k })));
    }
    PP.ui.modal({ title: '단축키', body: [t], width: 620, buttons: [{ label: '닫기', value: true, primary: true }], dismissable: true });
  });

  PP.defCmd('help.about', '그림판+ 정보', '', () => {
    PP.ui.modal({
      title: '그림판+ 정보',
      body: [
        PP.el('div', { style: { fontSize: '16px', fontWeight: '600' }, text: '그림판+ 1.0.0' }),
        PP.el('div', { text: '기본 그림판보다 훨씬 많은 기능을 가진 데스크톱 그림 프로그램입니다.' }),
        PP.el('div', { style: { color: 'var(--text-dim)' }, text: '레이어 · 블렌드 모드 · 다양한 브러시 · 대칭 그리기 · 필압 · 선택/변형 · 필터 · 프로젝트(.paintplus) 저장' }),
      ],
      buttons: [{ label: '확인', value: true, primary: true }],
      dismissable: true,
    });
  });
})(window.PP);
