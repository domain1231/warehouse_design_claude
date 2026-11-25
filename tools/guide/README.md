# 사용자 설명서 촬영·빌드 파이프라인 (tools/guide)

`Warehouse Studio 사용자 설명서`(v2.1, alpha.13 기준)를 **실제 빌드 결과를 자동 조작해 다시 찍고, 다시 측정하고, 다시 묶는** 스크립트 모음입니다. 새 alpha가 나오면 아래 한 줄로 설명서의 그림·측정값·실습 파일·PDF를 갱신합니다.

```
pnpm build
python3 tools/guide/run.py --work /tmp/guide-work --app dist/warehouse_layout_designer_v2_5_0-alpha_13.html
```

결과물은 `<work>/out/`에, **배포용 이름으로 묶은 것은 `<work>/out/release/`**에 생깁니다(판 번호는 `GUIDE_VER=2.1 APP_TAG=a13` 환경변수). 단계별 로그는 `<work>/out/log_<단계>.txt`입니다.

| 산출물 | 파일 |
|---|---|
| 전체본 HTML (관리자 편 포함) | `Warehouse_Studio_v2_5_0a2_UserGuide_v2_0.html` (내부 이름 · 배포 시 판 번호로 바꿔 이름 짓기) |
| 사용자용 HTML (관리자 편 제거) | `…_사용자용.html` |
| PDF | `Warehouse_Studio_설명서_v2_0_{관리자용_소책자, 강사용_교육패킷, 전체본_컬러, 전체본_잉크절약}.pdf`, `Warehouse_Studio_빠른카드_v2_0.pdf` |

## 단계 (`--steps capture,build,verify,publish`)

| 단계 | 하는 일 |
|---|---|
| capture | Playwright로 앱을 열어 화면 캡처, 실습 시작 파일(JSON) 생성, 모드별 자동 배치·비교 창·Summary 대조·실기 정답을 실제로 실행해 측정값 기록 (`<work>/work/*.json`) |
| build | `src/*.html`(본문) + `src/*_inject.py`(그림·실습 파일 주입)로 단일 HTML 생성. 이미지는 WebP base64, 실습 파일은 gzip 내장 |
| verify | 설명서에 적힌 화면 문구를 앱 원문과 대조(`verify13`), 검색·목차·라이트박스 동작(`ftest`), 내장 실습 파일을 앱에 실제로 불러오기(`cp_test`) |
| publish | 빠른 카드, PDF 소책자, 사용자용 판 |
| release | 사용자용 PDF 생성 + 배포용 이름으로 `out/release/`에 복사, 실사용 테스트 과제 3 시작 JSON 포함 |

`capture`의 순서는 바꾸지 않습니다. 뒤 단계가 앞 단계가 남긴 상태 파일을 읽습니다.

### 문구 검증 4단계 (`verify13`)
설명서의 「」 문구를 ① 화면 DOM ② 앱 소스(유니코드 이스케이프 해제) ③ 촬영 로그 순서로 찾고, 어디에도 없으면 `unverified`로 보고합니다. unverified에는 Excel 머리글·시트 이름·사용자가 입력한 예시 값처럼 앱 문구가 아닌 것도 섞여 있으니 목록을 직접 확인하세요.

### 재촬영 후 꼭 할 일
그림 설명(figcaption)의 **숫자**는 촬영 값이 바뀌면 같이 고쳐야 합니다(예: 거리 0.727m → 0.75m). 재촬영마다 숫자가 든 캡션을 그림과 대조하세요.

## 준비물

- Python 3.11+ · `pip install playwright pillow openpyxl`
- Chrome (`--chrome` 또는 `WAREHOUSE_BROWSER_PATH`, 기본 `/usr/bin/google-chrome`)
- `pdftoppm`(poppler-utils), 한글 글꼴 `NanumGothic`(빠른 카드 · `/usr/share/fonts/truetype/nanum/`)

## 경로 토큰

`src/` 안의 절대 경로는 `@@W@@`(작업 폴더), `@@CHROME@@`(Chrome), `@@REPO@@`(이 저장소 · `fixtures/legacy` 견본 JSON 사용)로 적혀 있고, `run.py`가 실행 직전에 실제 값으로 바꿔 `<work>/scripts/`에 복사합니다. `src/`를 직접 실행하지 마세요.

## 자료

- `fixtures/guide/교육용_평면도.png`: 배경 도면 실습용 가상 평면도
- `fixtures/guide/*.xlsx`: **교육용 가상 자료**(실제 재고 아님). 기본 3열 11랙, 개선 후(A열 높이↑·B-3↓·C-2 비움·C-3 신규), Summary 대조용(시트 「교육호BE」+「Summary」, `7F-A-3-1-2` 용적률 칸에 의도적 직접 입력값 95%).
- 업무 Excel·운영 JSON·실제 도면은 쓰지 않습니다.

## 고칠 때

- 문장: `src/body.html`(코스 0·2), `src/course1·3·4·5·6.html`, `src/mgr.html`(관리자 편), `src/edu.html`(부록 A-5·A-6), `src/exam.html`·`src/instructor.html`(실기·정답)
- 그림 이름과 위치: 각 `src/*_inject.py`의 목록, 화면 지도 좌표는 `src/c1_inject.py`의 `REG`(1600×1330 화면 기준)
- 앱 화면이 바뀌어 촬영 스크립트가 실패하면 로그의 `"ERR …"` 줄에 실패한 선택자가 남습니다. 일부 탐색 단계(`c6b`의 past 등)는 설명서에 쓰지 않는 그림이라 ERR가 있어도 결과에 영향이 없습니다.

## 한계

- 실행 확인 환경: Linux · Chrome(Playwright). Windows Edge·Firefox NOT RUN.
- 문구 검증은 텍스트 일치만 봅니다. 그림 안의 숫자와 캡션 숫자의 일치는 자동 검사하지 않습니다(위 '재촬영 후 꼭 할 일').
