'use strict';
/* 3D 명령 등록 (메뉴/단축키 공용) */
(function (PP) {
  const D = PP.defCmd;
  const T = () => PP.three;
  const stem = () => (T().scene ? T().scene.name.replace(/\.[^.]+$/, '') : 'model');

  // 주의: 3D 전용 키(G/R/S/X/F...)는 여기서 단축키로 등록하지 않는다 (2D 단축키와 충돌). workspace3d.keydown 이 처리한다.
  D('file.new3d', '새 3D 모델', 'Ctrl+Shift+Alt+N', () => PP.tabs.new3d());
  D('file.import3d', '3D 모델 가져오기 (GLB/OBJ/STL)...', '', () => PP.files.importModel());
  D('three.exportGLB', 'GLB 로 내보내기', '', async () => { await PP.exportBytes(stem() + '.glb', await T().exportGLB(), 'model/gltf-binary'); });
  D('three.exportOBJ', 'OBJ 로 내보내기', '', async () => { await PP.exportBytes(stem() + '.obj', T().exportOBJ(), 'text/plain'); });
  D('three.exportSTL', 'STL 로 내보내기', '', async () => { await PP.exportBytes(stem() + '.stl', T().exportSTL(), 'model/stl'); });
  D('three.exportPNG', '렌더 이미지(PNG) 저장', '', () => T().exportPNG());
  D('three.to2D', '현재 시점을 2D 탭으로 보내기', '', () => T().to2D());
  D('three.dup', '복제 (Shift+D)', '', () => T().duplicate());
  D('three.del', '삭제 (X)', '', () => T().deleteSel());
  D('three.focus', '선택에 초점 (F)', '', () => T().focus());
  for (const [k, [name]] of Object.entries(PP.PRIMS3D)) D('three.add.' + k, name, '', () => T().add('mesh', k));
  D('three.add.sun', '태양광', '', () => T().add('light', 'sun'));
  D('three.add.point', '점광원', '', () => T().add('light', 'point'));
  D('three.shade.solid', '솔리드', '', () => T().setShading('solid'), { checked: () => T().shading === 'solid' });
  D('three.shade.wire', '와이어프레임', '', () => T().setShading('wire'), { checked: () => T().shading === 'wire' });
  D('three.shade.render', '렌더 (그림자)', '', () => T().setShading('render'), { checked: () => T().shading === 'render' });
  const ED = () => PP.three.edit;
  D('three.edit.toggle', '편집 모드 전환 (Tab)', '', () => ED().toggle());
  for (const [id, label, fn] of [['mode.vert', '점 선택 (1)', () => ED().setMode('vert')], ['mode.edge', '선 선택 (2)', () => ED().setMode('edge')], ['mode.face', '면 선택 (3)', () => ED().setMode('face')],
    ['extrude', '돌출 (E)', () => ED().extrude()], ['inset', '인셋 (I)', () => ED().inset()], ['bevel', '베벨 (B)', () => ED().bevel()], ['loopcut', '루프 컷 (L)', () => ED().loopCut()],
    ['merge', '병합 (M)', () => ED().merge()], ['del', '삭제 (X)', () => ED().del()], ['subdivide', '세분화 (W)', () => ED().subdivide()], ['flip', '면 뒤집기', () => ED().flip()]]) {
    D('three.edit.' + id, label, '', fn, { enabled: () => ED().on, checked: id.startsWith('mode.') ? () => ED().on && ED().mode === id.slice(5) : undefined });
  }
  for (const [k, n] of [['front', '앞'], ['right', '옆'], ['top', '위'], ['persp', '원근']]) D('three.view.' + k, n + ' 시점', '', () => T().view(k));
})(window.PP);
