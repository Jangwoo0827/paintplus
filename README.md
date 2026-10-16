# 그림판+ (PaintPlus)

기본 그림판보다 기능이 훨씬 많은 Windows용 데스크톱 그림 프로그램입니다.
**Electron + 순수 JavaScript + HTML Canvas** (프레임워크 없음, 런타임 의존성 0개).

## 다운로드 (PC · 휴대폰)

[**Releases**](https://github.com/Jangwoo0827/paintplus/releases/latest) 페이지에서 받으세요.

| 파일 | 대상 |
| --- | --- |
| `PaintPlus-Setup-x.y.z.exe` | Windows 설치 파일 (바탕화면/시작 메뉴 바로가기, 자동 업데이트) |
| `PaintPlus-Portable-x.y.z.exe` | Windows 휴대용 (설치 불필요) |
| `PaintPlus-x.y.z.apk` | 안드로이드 (설치 시 "출처를 알 수 없는 앱 허용" 필요) |

PC 설치판은 새 릴리스가 나오면 시작 8초 뒤 알려 주고 내려받아 재시작 시 설치합니다(도움말 > 업데이트 확인).
안드로이드 앱은 새 버전이 있으면 APK 내려받기로 안내합니다. 안드로이드는 터치 UI(두 손가락 확대/이동, 하단 도구 줄, ☰ 패널)와 펜 필압을 지원합니다.

## 실행 방법

```bash
npm install          # 처음 한 번
npm start            # 개발 실행
```

**콘솔 창 없이 실행**: 폴더의 `그림판+ 실행.vbs`를 더블클릭하면 숨김 모드로 `npm start`가 실행되어 앱 창만 뜹니다.
(`node_modules`가 없으면 첫 실행 때 자동으로 `npm install`을 수행합니다.)

## 웹 버전 (localhost)

```bash
npm run serve        # http://localhost:5173 — 브라우저에서 바로 사용 (파일은 열기/다운로드 방식)
```

## 안드로이드 빌드

JDK 21 과 Android SDK(플랫폼 36)가 필요합니다. 서명 키는 `android/keystore.properties`(저장소에 올리지 않음)에서 읽습니다.

```bash
npm run android:sync     # 웹 파일을 android/ 로 복사
npm run android:release  # android/app/build/outputs/apk/release/ 에 서명된 APK
```

## 릴리스 올리기

`package.json` 의 version 을 올리고 `vX.Y.Z` 태그를 푸시하면 `.github/workflows/release.yml` 이 Windows + Android 를 빌드해 릴리스에 올립니다.
코드 서명 인증서(`CSC_LINK`, `CSC_KEY_PASSWORD`)와 안드로이드 키(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`)를 저장소 시크릿으로 넣으면 서명되어 빌드됩니다.
(Windows 인증서가 없으면 서명 없이 빌드되어 SmartScreen 경고가 뜰 수 있습니다.)

## 빌드 (.exe 만들기)

```bash
npm run build        # dist/ 에 설치 파일 + 휴대용 exe 생성
npm run build:dir    # 설치 파일 없이 dist/win-unpacked 만 생성 (빠른 확인용)
npm run icon         # 앱 아이콘(build/icon.png, icon.ico) 다시 생성
```

| 결과물 | 설명 |
| --- | --- |
| `dist/PaintPlus-Setup-1.0.0.exe` | NSIS 설치 파일. 설치 경로 선택, **바탕화면/시작 메뉴 바로가기** 생성, `.paintplus` 파일 연결 |
| `dist/PaintPlus-Portable-1.0.0.exe` | 설치 없이 바로 실행하는 휴대용 exe |

빌드된 exe는 GUI 서브시스템이라 **터미널(콘솔) 창이 절대 함께 뜨지 않습니다.**
빌드 중 `EPERM ... win-unpacked.tmp` 오류가 나면 백신/탐색기가 잠시 폴더를 잡고 있는 것이므로 `dist` 폴더를 지우고 다시 실행하세요.

## 주요 기능

**그리기 도구** — 보정 도구(손가락·흐림·선명·닷지·번·복제 도장) ·  연필 · 브러시(부드러운/마커/스프레이/붓/크레용) · 지우개 · 페인트통(허용 오차, 경계 확장, 모든 레이어 참조) · 그라디언트(선형/방사형/반사형/각도형) · 스포이드 · 직선/사각형/둥근 사각형/원·타원/삼각형/다각형/화살표/곡선(외곽선·채우기·둘 다) · 텍스트(글꼴·크기·굵게·기울임·색)

**브러시 설정** — 크기, 불투명도, 경도, 간격, 손떨림 보정(스무딩), 펜 태블릿 **필압**(Pointer Events), **대칭 그리기**(좌우/상하/좌우+상하/방사형 2~16분할)

**선택** — 사각형/자유형/마술봉, 모드(새 선택·추가·빼기·교차, Shift/Alt), 선택 반전, 자유 변형(Ctrl+T), 이동·복사·잘라내기·붙여넣기·삭제, 핸들로 크기 조절, 회전 핸들로 회전, 방향키 미세 이동, 선택 영역 안에서만 그리기/필터 적용

**레이어** — 추가/삭제/복제/병합/드래그로 순서 변경, 보이기·잠금, 불투명도, 블렌드 모드 16종, 이름 변경(더블클릭)

**색상** — HSV 휠 + HEX/RGB 입력, 최근 사용 색, 기본 팔레트, 저장 가능한 내 팔레트, 전경/배경색 교체

**편집/이미지** — 실행 취소/다시 실행(최대 1000단계, 메모리 한도 안에서 최소 100단계 보장) + 히스토리 패널, 확대/축소(휠·Ctrl+휠), Space+드래그 이동, 맞춤/100% 보기, 캔버스 크기, 이미지 크기, 회전/뒤집기, 선택 영역으로 자르기, 필터 16종(흐림·모션 블러·선명하게·밝기/대비·채도·색조/채도/명도·레벨·포스터화·픽셀화·노이즈·윤곽선·엠보스·비네팅·흑백·반전·세피아, 실시간 미리보기), 눈금자, 격자, 격자 맞춤

**파일** — 새로 만들기, 열기(PNG/JPG/WebP/BMP/GIF), 저장·다른 이름으로 저장(PNG/JPG/WebP), **레이어까지 보존되는 `.paintplus` 프로젝트**, 클립보드 붙여넣기(스크린샷 즉시 가져오기)/복사, 파일 드래그&드롭 열기, 저장 안 하고 닫을 때 확인, **자동 임시 저장(30초) 및 복구**

**앱 동작** — 마지막 창 크기·위치 기억, 중복 실행 방지(이미 실행 중이면 기존 창을 앞으로 가져오고, 넘겨받은 파일을 그 창에서 열기), 다크/라이트 테마

## 단축키

| 도구 | 키 | 도구 | 키 |
| --- | --- | --- | --- |
| 연필 | `P` | 직선 / 사각형 / 둥근 사각형 | `L` / `R` / `Shift+R` |
| 브러시 | `B` | 원·타원 / 삼각형 / 다각형 | `O` / `Y` / `N` |
| 지우개 | `E` | 화살표 / 곡선 | `W` / `C` |
| 페인트통 / 그라디언트 | `G` / `Shift+G` | 텍스트 | `T` |
| 스포이드 | `I` (또는 `Alt`+클릭) | 사각형 / 자유형 선택 | `V` / `Shift+V` |
| 손바닥 | `H` 또는 `Space`+드래그 | 돋보기 | `Z` |

| 동작 | 키 | 동작 | 키 |
| --- | --- | --- | --- |
| 새로 만들기 / 열기 | `Ctrl+N` / `Ctrl+O` | 저장 / 다른 이름으로 | `Ctrl+S` / `Ctrl+Shift+S` |
| 실행 취소 / 다시 실행 | `Ctrl+Z` / `Ctrl+Y` | 복사 / 잘라내기 / 붙여넣기 | `Ctrl+C` / `X` / `V` |
| 모두 선택 / 해제 | `Ctrl+A` / `Ctrl+D` | 선택 영역 삭제 / 확정 | `Delete` / `Enter` |
| 맞춤 / 100% | `Ctrl+0` / `Ctrl+1` | 확대 / 축소 | 휠, `Ctrl+=` / `Ctrl+-` |
| 눈금자 / 격자 / 격자 맞춤 | `Ctrl+R` / `Ctrl+'` / `Ctrl+Shift+'` | 테마 전환 | `Ctrl+Shift+T` |
| 새 레이어 / 복제 | `Ctrl+Shift+N` / `Ctrl+J` | 아래로 병합 / 이미지 병합 | `Ctrl+E` / `Ctrl+Shift+E` |
| 전경↔배경색 / 기본 색 | `X` / `D` | 브러시 크기 | `[` `]` |
| 단축키 도움말 | `F1` | 전체 화면 | `F11` |

우클릭으로 그리면 배경색으로 그려집니다.

## 폴더 구조

```
paintingboardplus/
├─ package.json            npm start / npm run build 설정 (electron-builder 포함)
├─ 그림판+ 실행.vbs         콘솔 없이 개발 모드 실행
├─ build/                  앱 아이콘 (icon.png, icon.ico)
├─ scripts/make-icon.js    아이콘 생성기
├─ test/                   Electron 창에서 실제 입력을 주입하는 스모크 테스트
└─ src/
   ├─ main/                main.js (창·단일 인스턴스·창 상태·IPC), preload.js
   └─ renderer/
      ├─ index.html, css/style.css
      └─ js/
         ├─ util, state, commands(단축키), document, history, selection
         ├─ preview(그리는 동안 쓰는 스트로크 레이어), viewport(합성·줌·눈금자·입력)
         ├─ brush-engine(스무딩·간격·대칭·브러시 종류), layers, filters, imageops
         ├─ files, clipboard, project(.paintplus·자동 저장)
         ├─ tools/   brush, basic, fill, shapes, text
         └─ ui/      dialogs, color-ui, toolbox(+옵션바), panels(레이어·히스토리), statusbar, menu, help
```

### 성능 설계

- 그리는 동안에는 **문서 크기의 스트로크 캔버스 한 장**에만 그리고, 화면에는 뷰포트 크기의 임시 캔버스에서 (레이어 + 스트로크)를 합성해 보여 줍니다. 프레임 비용이 문서 크기와 무관합니다.
- 획이 끝나면 **변경된 사각형만** 레이어에 병합하고, 실행 취소 기록도 그 사각형만 저장합니다(undo/redo는 서로 맞바꾸기).
- 보이는 영역만 소스 사각형으로 잘라 그리므로 확대해도 느려지지 않습니다.

## 테스트

화면에 창이 뜨지 않습니다(Electron은 오프스크린, 웹은 헤드리스 브라우저).

```bash
npm run smoke -- stage1          # Electron(오프스크린): stage1~6, stage5b(창 닫기), perf, mobile
npm run test:web -- stage2 features layout pen   # localhost + 헤드리스 Edge/Chrome (필압·터치 포함)
```

각 시나리오는 마우스/키보드/펜/터치 입력을 주입하고 픽셀·상태를 검증하며, 화면 캡처는 `PP_SHOTS` 폴더(기본: OS 임시 폴더)에 저장합니다. 눈으로 보려면 `PP_SHOW=1`.
