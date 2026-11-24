// 앱 진입점. 저장소·프로젝트 모델·편집 세션(Phase 1), SVG 도면 보기·선택(Phase 3a), 객체 편집(Phase 3b)을 화면에 연결한다.
// 계산은 src/cad/*(카메라·선택·도면 문자열)에 있고, 이 파일은 DOM 이벤트를 그 함수들에 연결만 한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
import { createIdGenerator } from './core/ids.js';
import { createBackupRing } from './persistence/backups.js';
import { createSession, projectValidator } from './core/session.js';
import { createProjectStore } from './persistence/storage.js';
import { formatNumber as fmt } from './core/format.js';
import { viewBox, zoomBy, panFrom, pinchFrom, centerView, focusBox, withFitScale, wheelPixels, wheelFactor, createWheelTracker } from './cad/camera.js';
import { buildScene, selectionBox, esc, OBJECT_COLORS } from './cad/scene.js';
import { rackLabelParts, labelStatusText } from './cad/labels.js';
import { clickSelect, marqueeSelect, restoreSelection } from './cad/selection.js';
import { loadWheelMode, saveWheelMode, WHEEL_LABELS, WHEEL_STATUS_TEXT } from './cad/wheel-settings.js';
import { pixelsPerMeter } from './cad/camera.js';
import { applyCommand, applyMove, addObjectAt, deleteObjects, duplicateObjects, rotateObjects, nudgeObjects, fieldValue, setField, setDimension, DIMENSION_COMMAND, MM_INPUT_FIELDS, mmInputMessage, isMmInput, setPositionLock, setLimit, setAspectLock, setAisleField, setReviewMark, LIMIT_COMMAND, COMMAND_DEFAULT, selectAllRacks, applyAisleRule, addPolygonAisle, snapped, dragDelta, alignmentGuides, movedLayout, isLocked, RACK_DEFAULTS } from './warehouse/commands.js';
import { setObjectColor, setColorMode, applyThresholdColors, resetColors } from './warehouse/appearance.js';
import { renderInspector } from './ui/inspector.js';
import { selectedCsvRows, SELECTED_CSV_NAME } from './warehouse/group-panel.js';
import { parseScope } from './warehouse/inspector-info.js';
import { createRoomPanel } from './ui/room-panel.js';
import { applyRoom } from './warehouse/room.js';
import { createAisleDialog } from './ui/aisle-dialog.js';
import { createGroupDialog } from './ui/group-dialog.js';
import { createPanels } from './ui/panels.js';
import { BOTTOM_HTML, BOTTOM_TITLES } from './ui/bottom-markup.js';
import { parseInventoryCsv, importInventory, inventorySnapshotExists, saveInventorySnapshot } from './warehouse/inventory-csv.js';
import { createRackDetail } from './ui/rack-detail.js';
import { createRecordsPanel } from './ui/records-panel.js';
import { createExcelDialog } from './ui/excel-dialog.js';
import { createInfoDialogs } from './ui/info-dialogs.js';
import { createScenarioDialogs } from './ui/scenario-dialogs.js';
import { createThemeDialog, applyTheme } from './ui/theme-dialog.js';
import { createStorageDialogs, QUOTA_TEXT } from './ui/storage-dialogs.js';
import { cloneBeforeToAfter, restoreBackup, CLONE_COMMAND, RESTORE_COMMAND } from './warehouse/scenarios.js';
import { applyExcelProposal, EXCEL_APPLY_COMMAND } from './excel/apply.js';
import { confirmPhysical, PHYSICAL_COMMAND } from './warehouse/rackinfo.js';
import { saveSnapshot, restoreSnapshot, historyLayout, historyDates, historyStatusText, SAVE_SNAPSHOT_COMMAND, RESTORE_SNAPSHOT_COMMAND } from './warehouse/records.js';
import { resized, applyResize, RESIZE_COMMAND, HANDLE_DIRECTIONS, newSpatialWarnings } from './warehouse/commands.js';
import { OBJECT_TYPES, createProject } from './core/project.js';
import { scanLayout } from './warehouse/constraints.js';
import { violationListHtml } from './warehouse/violations.js';
import { candidateSummary } from './autolayout/candidates.js';
import { rackCsvRows, historyCsvRows, templateCsvRows, reportSvg } from './exports/report.js';
import { legend } from './warehouse/racklist.js';
import { csvEncode, rackItems } from './warehouse/rackinfo.js';
import { GEOMETRY_EPS_M as EPS, SNAP_STEPS_M } from './geometry/tolerance.js';
import { effectiveRules, setPlacementRule } from './warehouse/placement-rules.js';

export const APP_VERSION = __APP_VERSION__;
export const SCHEMA_VERSION = __SCHEMA_VERSION__;
const REFERENCE_IMAGE = __REFERENCE_IMAGE__; // 기준본의 명시적 가상 참고 이미지(src/assets/reference.png)를 빌드 때 data: URI로 넣는다.

/** SVG 문자열을 같은 크기의 PNG Blob으로 바꾼다(보고서·전후 비교 공용). */
async function pngBlob(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('SVG 이미지 변환 실패')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 변환 실패');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STATUS_TEXT = {
  loading: '불러오는 중',
  saved: '● 모든 변경사항 저장됨 · SAVED',
  unsaved: '○ 저장되지 않은 변경사항 · UNSAVED',
  saving: '◌ 저장 중',
  error: '! 저장 실패',
};
const ERROR_HINT = {
  QUOTA: QUOTA_TEXT,
  CONFLICT: '다른 탭 또는 창에서 먼저 저장했습니다. 덮어쓰지 않았습니다.',
  CORRUPT: '기존 저장본을 읽을 수 없어 보호 중입니다.',
  VERIFY: '저장 후 읽기 확인에 실패해 저장하지 않았습니다. 기존 저장본은 그대로입니다.',
  VALIDATION: '프로젝트 검증에 실패해 저장하지 않았습니다.',
  STORAGE: '브라우저 저장소를 사용할 수 없습니다.',
};
// 기준본 30 setTool 도구 안내 문구(그 밖의 도구는 '<이름>를 배치할 위치를 클릭하세요.')
const TOOL_HELP = {
  select: '클릭 선택 · Shift 다중 선택 · 드래그 이동',
  pan: '빈 곳이나 객체에서 드래그하여 화면 이동',
  measure: '도면에서 두 점 클릭 · Esc 취소',
  calibrate: '기준 거리의 두 점을 차례로 클릭',
};

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'testid') node.dataset.testid = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}
const button = (testid, text, attrs = {}) => el('button', { type: 'button', testid, ...attrs }, text);

function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// v2.4.1 화면 골격(기준본 렌더링 DOM의 구조·id·문구, D-032·D-033). 기능 연결은 start()가 하고, 이 함수는 요소를 만들어 참조를 돌려준다.
// 기존 E2E 호환을 위해 data-testid를 함께 둔다. 기준본에 없는 재구축 요소는 숨기거나 해당 구역 끝에 둔다(9b-2~7에서 정리).
const SHELL = `<header><div><div class="eyebrow">OPERATIONS / SPACE PLANNING</div><h1>Warehouse Studio <span class="sub">창고 배치 설계</span> <small id="appVersion" data-testid="versions"></small></h1></div><div class="header-actions"><div class="v-save-tools"><button id="vSave" class="primary" type="button" data-testid="save">프로젝트 저장</button><button id="vVersions" type="button" data-testid="versions-open">이전 버전·백업</button><button id="vStorage" type="button" data-testid="storage-open">저장소 관리</button><button id="vRetry" type="button" data-testid="retry" hidden>현재 프로젝트 다시 저장</button><button id="vRecoverRaw" type="button" data-testid="recover-raw" hidden>보호 원본 JSON</button></div><span id="saveStatus" class="save" role="status" data-testid="status"></span><button id="undo" type="button" title="Ctrl+Z" data-testid="undo">↶ 취소</button><button id="redo" type="button" title="Ctrl+Y" data-testid="redo">↷ 다시</button><button id="jsonOut" type="button" data-testid="export">JSON 백업</button><label class="filebtn" data-testid="import-json">불러오기<input id="jsonIn" type="file" accept=".json,application/json" hidden data-testid="import-file"></label><button id="aboutBtn" type="button" data-testid="about-open">프로그램 정보</button><button id="helpBtn" type="button" data-testid="help-open">사용 안내</button></div></header>
<div id="vSaveDetail" role="status"><span data-testid="status-detail"></span><span class="notice" data-testid="notice"></span><span>이 PC·브라우저 저장 / HTML 덮어쓰기·클라우드 동기화 아님</span><span id="topSummary" data-testid="top-summary" hidden></span><button id="topToggle" type="button" class="top-toggle" aria-controls="sampleBanner topStats wTop" data-testid="top-toggle">지표 접기</button></div>
<div class="banner" id="sampleBanner" data-testid="sample-banner"></div>
<div class="stats" id="topStats"><div class="stat"><small>전체 창고 면적</small><strong id="kArea" data-testid="k-area">—</strong><span>㎡</span><em class="stat-sub" id="kAreaSub" data-testid="k-area-sub"></em></div><div class="stat"><small>현재 랙 수</small><strong id="kRacks" data-testid="k-racks">—</strong><span>개</span></div><div class="stat"><small>면적 사용률</small><strong id="kFootprint" data-testid="k-footprint">—</strong><span>%</span><em class="stat-sub" id="kFootprintSub" data-testid="k-footprint-sub"></em></div><div class="stat"><small>통로 비중</small><strong id="kAisleShare" data-testid="k-aisle-share">—</strong><span>%</span><em class="stat-sub" id="kAisleArea" data-testid="k-aisle-area"></em></div><div class="stat" title="공간 구성 4분해(랙 > 보관 불가 > 통로 > 잔여 순서로 겹침 제거, 도면 면적 기준)의 보관 불가 몫: 벽·기둥·보관 금지·문 안전 구역"><small>보관 불가 구역 비중</small><strong id="kBlockedShare" data-testid="k-blocked-share">—</strong><span>%</span><em class="stat-sub" id="kBlockedArea" data-testid="k-blocked-area"></em></div><div class="stat" title="공간 구성 4분해의 잔여 몫: 랙·보관 불가·통로 어느 것도 차지하지 않은 면적 ÷ 도면 면적. 랙을 더 놓을 수 있는 여유의 상한"><small>보관 가능 잔여 비중</small><strong id="kRemainShare" data-testid="k-remain-share">—</strong><span>%</span><em class="stat-sub" id="kRemainArea" data-testid="k-remain-area"></em></div><div class="stat" title="통로 객체마다 계산한 유효 폭 중 가장 좁은 값(통로 검토 표와 같은 계산)"><small>최소 통로 폭</small><strong id="kMinAisle" data-testid="k-min-aisle">—</strong><span>m</span><em class="stat-sub" id="kMinAisleSub" data-testid="k-min-aisle-sub"></em></div><div class="stat"><small>공간 경고</small><strong id="kWarnings" data-testid="k-warnings">—</strong><span>건</span></div></div>
<div id="wTop" class="w-summary"><span data-testid="w-summary"></span><button id="wAll" type="button">모든 랙 보기</button><button id="wViolations" type="button">위반 목록</button><span id="wTopNote"></span></div>
<div id="sWork"><main class="app" id="app"><aside class="sidebar left" aria-label="설계 도구"><details id="qPrecisionPanel" open><summary>정밀 배치 설정 · v2.3.6</summary><label class="check"><input id="qSnap" type="checkbox" data-testid="snap">배치 스냅 ON</label><div class="fields"><label>스냅 간격 (m)<select id="qSnapStep" data-testid="snap-step"><option value="0.001">0.001</option><option value="0.005">0.005</option><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.1">0.1</option><option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1">1</option><option value="2">2</option></select></label><label>좌표 표시 소수점<select id="qDecimals" data-testid="display-decimals"><option value="2">2자리</option><option value="3">3자리</option><option value="4">4자리</option></select></label><label>방향키 이동 (m)<select id="qKeyStep" data-testid="key-step"><option value="0.001">0.001</option><option value="0.005">0.005</option><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.1">0.1</option></select></label><label>Shift 고속 이동 (m)<select id="qFastStep" data-testid="fast-step"><option value="0.1">0.1</option><option value="0.5">0.5</option><option value="1">1</option></select></label></div><label class="check"><input id="qGuides" type="checkbox" data-testid="guides">정렬 가이드 표시</label><label class="check"><input id="qGuideSnap" type="checkbox" data-testid="guide-snap">가이드 흡착 (스냅 ON일 때)</label><div class="q-nudge row"><button type="button" data-q-nudge="0,-1" aria-label="위로 미세 이동">↑</button><button type="button" data-q-nudge="-1,0" aria-label="왼쪽으로 미세 이동">←</button><button type="button" data-q-nudge="1,0" aria-label="오른쪽으로 미세 이동">→</button><button type="button" data-q-nudge="0,1" aria-label="아래로 미세 이동">↓</button></div><p class="note">좌표 직접 입력은 0.001m까지 지원합니다. 기존 좌표는 그대로 보존합니다. 마우스 정밀도는 배율·장치의 한계를 받습니다. 격자는 표시용이며 스냅 간격과 별개입니다.</p></details><details open id="multiTools"><summary>v2.3.6 / 선택 · 통로 · 화면</summary><div class="tools"><button type="button" id="mSelectAll" data-testid="select-all">전체 랙 선택</button><button type="button" id="mClearSelection" data-testid="clear-selection">선택 해제</button></div><label>영역 선택 기준<select id="mSelectRule" data-testid="select-rule"><option value="intersect">일부 겹침</option><option value="contain">완전 포함</option></select></label><label class="check"><input id="mAllowWarnings" type="checkbox" data-testid="allow-warnings">공간 위반을 경고 후 허용 (기본 차단)</label><p class="muted">빈 공간 드래그로 영역 선택 · Ctrl 클릭 토글 · Shift 클릭 추가 · 선택 그룹 드래그 이동</p><h3>보호 통로 설정</h3><div class="tools"><button type="button" id="mPolygonAisle" data-testid="polygon-aisle">다각형 통로 그리기</button><button type="button" id="mFinishPolygon" data-testid="polygon-finish" disabled>다각형 완성</button></div><label>통로 종류<select id="mAisleType" data-testid="aisle-type"><option value="메인 이동 통로">메인 이동 통로</option><option value="작업자 이동 통로">작업자 이동 통로</option><option value="자재 운반 통로">자재 운반 통로</option><option value="랙 접근 통로">랙 접근 통로</option><option value="출입문 연결 통로">출입문 연결 통로</option></select></label><div class="fields"><label>최소 폭 (m)<input id="mRuleMin" type="number" min="0" value="1" step=".1" data-testid="rule-min"></label><label>목표 폭 (m)<input id="mRuleTarget" type="number" min="0" value="1.2" step=".1" data-testid="rule-target"></label></div><label class="check"><input id="mRuleEnabled" type="checkbox" checked data-testid="rule-enabled">이 종류 통로 경고 사용</label><button type="button" id="mApplyAisleRule" class="fullbtn" data-testid="rule-apply">같은 종류의 통로에 기준 적용</button><button type="button" id="mValidate" class="fullbtn" data-testid="aisle-validate">현재 통로 폭 · 충돌 확인</button><p class="note">폭은 지정 방향의 단면별 최대 연속 여유 폭 중 최솟값입니다. 경로 연결·차량 회전·피난 적합성은 별도 검증이 필요합니다. 수치는 사용자 기준입니다.</p><h3>작업 영역</h3><label class="check"><input id="mCenterLock" type="checkbox" data-testid="center-lock">창고 중심 고정 확대</label><section><h3>배치맵 설정</h3><label>마우스 휠 확대 감도<select id="mWheelSensitivity" data-testid="wheel-sensitivity"></select></label><button id="mWheelReset" type="button" data-testid="wheel-reset">휠 감도 기본값</button><p id="mWheelStatus" class="muted" role="status" data-testid="wheel-status"></p></section><div class="tools"><button type="button" id="mCenter" data-testid="center">중앙 정렬</button><button type="button" id="mResetZoom" data-testid="reset-zoom">기본 배율</button><button type="button" id="mZoom50" data-testid="zoom-50">50%</button><button type="button" id="mZoom200" data-testid="zoom-200">200%</button></div></details><details open id="excelTools"><summary>Excel / 로케이션 자동 생성</summary><label class="filebtn">Excel·로케이션 CSV 불러오기<input id="exFile" type="file" accept=".xlsx,.csv" hidden data-testid="excel-side-file"></label><button type="button" id="exOpen" class="fullbtn" data-testid="excel-open">가져오기 / 자동 배치 설정</button><p class="muted" id="exSideStatus" data-testid="excel-side-status">랙 → 선반 → 자재 계층으로 연결합니다.</p><label>도면 색상 기준<select id="exViz" data-testid="viz-mode"><option value="inventory">실제 재고 적재율</option><option value="height">높이 활용률</option><option value="registered">위치 등록 현황</option><option value="management">품목별 관리 지표</option></select></label><label style="margin-top:7px">랙 높이 집계 정책<select id="exHeightPolicy" data-testid="height-policy"><option value="weightedMax">선반별 최대 높이 / 높이 가중평균</option><option value="meanMax">선반별 최대 높이 비율 / 단순평균</option><option value="max">등록 자재 중 최대 높이 비율</option></select></label><p class="note">높이 활용률은 부피·수량 적재율과 다릅니다. MAX Stock과 평균 입고량을 현재고로 사용하지 않습니다.</p></details><details open><summary>01 / 프로젝트 · 공간</summary><label>프로젝트명<input id="projectName" maxlength="100" data-testid="name"></label><div id="roomBody"></div></details><details open><summary>02 / 배치 도구</summary><div class="tools" id="toolButtons"><button type="button" data-tool="select" data-testid="tool-select">↖ 선택 / 이동</button><button type="button" data-tool="pan" data-testid="tool-pan">✥ 화면 이동</button><button type="button" data-tool="rack" data-testid="tool-rack">▤ 랙 추가</button><button type="button" data-tool="wall" data-testid="tool-wall">━ 내부 벽</button><button type="button" data-tool="column" data-testid="tool-column">▪ 기둥</button><button type="button" data-tool="door" data-testid="tool-door">◴ 출입문</button><button type="button" data-tool="aisle" data-testid="tool-aisle">↔ 통로</button><button type="button" data-tool="blocked" data-testid="tool-blocked">▧ 보관 불가</button><button type="button" data-tool="work" data-testid="tool-work">▱ 작업 공간</button><button type="button" data-tool="measure" data-testid="tool-measure">⌁ 거리 측정</button></div><p class="muted" id="toolHelp" data-testid="tool-help"></p><label>추가 랙 종류<select id="newRackType" data-testid="new-rack-type"><option value="중량랙">중량랙</option><option value="경량랙">경량랙</option><option value="팔레트랙">팔레트랙</option><option value="일반 선반">일반 선반</option><option value="사용자 지정 랙">사용자 지정 랙</option></select></label><div class="fields"><label>폭 (m)<input id="newWidth" type="number" min="0.05" step="0.1" value="1.5" data-testid="new-width"></label><label>깊이 (m)<input id="newDepth" type="number" min="0.05" step="0.1" value="0.6" data-testid="new-depth"></label><label>높이 (m)<input id="newHeight" type="number" min="0.05" step="0.1" value="2" data-testid="new-height"></label><label>단위<input id="newUnit" value="BOX" maxlength="20" data-testid="new-unit"></label></div><button type="button" id="rackPalette" draggable="true" class="fullbtn" data-testid="rack-palette">▤ 이 랙을 도면으로 드래그</button><p class="muted">추가 도구를 선택하고 도면을 클릭하세요. 구조물은 기본 크기로 추가 후 정보 패널에서 수정합니다.</p></details><details open><summary>03 / 정밀 배치</summary><div class="fields"><label>표시 격자 (m)<select id="gridStep" data-testid="grid-step"><option value="0.1">0.1</option><option value="0.25">0.25</option><option value="0.5">0.5</option><option value="1">1</option><option value="2">2</option></select></label><label>충돌 정책<select id="collisionPolicy" data-testid="collision-policy"><option value="warn">경고 후 허용</option><option value="block">새 공간 위반 차단</option></select></label></div><label class="check"><input id="gridOn" type="checkbox" data-testid="grid-on">그리드 표시</label><label class="check"><input id="snapOn" type="checkbox" data-testid="snap-on">배치 스냅 (정밀 설정 간격)</label><label>랙 사이 최소 여유 (m, 0=검사 안 함)<input id="minGap" type="number" value="0" min="0" max="20" step="0.1" data-testid="min-gap"></label><div id="placementRules" data-testid="placement-rules"><p class="note">자동 배치 기준 · Excel 자동 배치 후 수정. 랙은 움직이지 않고 간격·이격 검사 기준만 바뀝니다.<span id="ruleState" data-testid="rule-state" hidden> 현재 배치에는 미적용 · Excel 입력값 표시. 값을 고치면 이 배치에 적용되어 랙·열 간격 검사가 켜집니다.</span></p><div class="fields"><label>열 사이 간격 (m)<input id="prColumnGap" type="number" min="0" max="50" step="0.01" data-rule="columnGap" data-testid="rule-columnGap" title="열 사이 간격 · 증감 0.01m / 직접 입력 0.001m까지 · 0~50m"></label><label>랙 사이 간격 (m)<input id="prRackGap" type="number" min="0" max="50" step="0.01" data-rule="rackGap" data-testid="rule-rackGap" title="랙 사이 간격 · 증감 0.01m / 직접 입력 0.001m까지 · 0~50m"></label><label>벽 최소 이격 (m)<input id="prWallGap" type="number" min="0" max="50" step="0.01" data-rule="wallGap" data-testid="rule-wallGap" title="벽 최소 이격 · 증감 0.01m / 직접 입력 0.001m까지 · 0~50m"></label><label>통로 목표 폭 (m)<input id="prAisleTarget" type="number" min="0" max="50" step="0.01" data-rule="aisleTarget" data-testid="rule-aisleTarget" title="통로 목표 폭 · 증감 0.01m / 직접 입력 0.001m까지 · 0~50m"></label></div></div><p class="note">최소 폭·간격은 사용자 기준이며 법정 기준이 아닙니다.</p><div class="tools"><button type="button" id="alignX" data-testid="align-x">좌측 정렬</button><button type="button" id="alignY" data-testid="align-y">상단 정렬</button></div><div class="fields"><label>등간격 (m)<input id="distributeGap" type="number" value="0.5" min="0" step=".001" data-testid="distribute-gap"></label><button type="button" id="distribute" style="align-self:end" data-testid="distribute">가로 배치</button></div></details><details><summary>04 / 참고 도면 배경</summary><div id="refBody"></div></details><details><summary>05 / 적재율 색상</summary><div class="fields"><label>보통 시작 (%)<input id="thresholdLow" type="number" value="50" min="1" max="98" data-testid="threshold-low"></label><label>주의 시작 (%)<input id="thresholdHigh" type="number" value="90" min="2" max="100" data-testid="threshold-high"></label><label>빈 랙<input id="colorEmpty" type="color" data-testid="color-empty"></label><label>여유<input id="colorLow" type="color" data-testid="color-low"></label><label>보통<input id="colorMid" type="color" data-testid="color-mid"></label><label>주의<input id="colorHigh" type="color" data-testid="color-high"></label><label>초과<input id="colorOver" type="color" data-testid="color-over"></label><label>정보 없음<input id="colorUnknown" type="color" data-testid="color-unknown"></label></div><button type="button" id="applyColors" data-testid="apply-colors">색상 기준 적용</button></details><button type="button" id="newBlank" class="fullbtn" data-testid="new-blank">빈 프로젝트</button><button type="button" id="loadSample" class="fullbtn" data-testid="load-sample">첨부 도면 참고 샘플</button></aside><section class="workspace"><div class="r-toolbar"><span id="rActive" class="r-state"></span><button id="rBefore" type="button" data-testid="scenario-before">BEFORE 보기</button><button id="rAfter" type="button" data-testid="scenario-after">AFTER 편집</button><button id="rClone" type="button" data-testid="scenario-clone">BEFORE → AFTER 복제</button><button id="rLock" type="button" data-testid="before-lock"></button><span id="rLockState"></span><button id="rHistory" type="button" data-testid="scenario-history">가져오기 이력</button><button id="rBackupDownload" type="button" data-testid="recovery-download" hidden>JSON 백업 다운로드</button></div><div class="v-label-controls"><label>랙 텍스트<select id="vLabelMode" data-testid="label-mode"><option value="rack-code">랙 번호만</option><option value="occupancy">랙 번호 + 실제 적재율</option><option value="occupancy-height">랙 번호 + 높이 활용률</option><option value="detail">상세 정보</option><option value="minimal">최소 표시 · 선택 랙</option></select></label><label>색상 표시<select id="vColorMode" data-testid="color-mode"><option value="data">데이터 기반</option><option value="custom">사용자 지정 색상</option></select></label><button id="vThemeOpen" type="button" data-testid="theme-open">색상 설정·기본색 복원</button><small id="vLabelStatus" class="muted" data-testid="label-status"></small><div class="q-label-options"><label>ZONE·번호 배치<select id="qLabelLayout" data-testid="label-layout"><option value="auto">자동 · 좁으면 두 줄</option><option value="stacked">항상 두 줄</option><option value="inline">한 줄</option><option value="minimal">최소 · 선택 랙</option></select></label><label>랙 번호 형식<select id="qNumberPadding" data-testid="label-padding"><option value="0">5</option><option value="2">05</option><option value="3">005</option></select></label></div></div><div class="toolbar"><div class="m-panel-tools"><button id="mLeftPanel" type="button" data-testid="toggle-left"></button><button id="mRightPanel" type="button" data-testid="toggle-right"></button><button id="mBothClose" type="button">양쪽 접기</button><button id="mBothOpen" type="button">양쪽 펼치기</button></div><button id="sBottomToggle" type="button" data-testid="bottom-toggle"></button><button id="bDefaultLayout" type="button" data-testid="bottom-default">기본 레이아웃 복원</button><label class="inline">편집 배치</label><select id="scenario" style="width:145px" data-testid="scenario-select"><option value="before">Before · 현재안</option><option value="after">After · 개선안</option></select><button id="compareBtn" type="button" data-testid="scenario-compare">비교</button><button id="seedAfter" type="button" title="미리보기와 백업 후 독립 복제">BEFORE → AFTER 복제</button><span class="spacer"></span><button id="zoomOut" type="button" aria-label="축소" data-testid="zoom-out">−</button><button id="zoomIn" type="button" aria-label="확대" data-testid="zoom-in">＋</button><button id="fit" type="button" data-testid="fit">전체 보기</button><button id="focusSelection" type="button" data-testid="focus-selection">선택 확대</button><small id="zoomLabel" data-testid="zoom-label">100%</small></div><div class="canvas-wrap" id="canvasWrap" data-testid="canvas-wrap"><svg id="plan" role="img" aria-label="창고 평면도. 도구 선택 후 클릭하여 배치합니다." data-testid="plan"></svg><div class="canvas-hint" id="canvasHint" data-testid="canvas-hint">원점: 좌상단 · X → / Y ↓ · 단위 m</div></div><div class="legend" id="legend" data-testid="legend"></div><div class="toolbar"><button id="rotate" type="button" data-testid="rotate">↻ 90°</button><button id="duplicate" type="button" data-testid="duplicate">복제</button><button id="delete" type="button" class="danger" data-testid="delete">삭제</button><span id="selectionStatus" class="muted" data-testid="selection-status"></span><span class="spacer"></span><button id="svgOut" type="button" data-testid="export-svg">SVG</button><button id="pngOut" type="button" data-testid="export-png">PNG</button><button id="printBtn" type="button" data-testid="export-print">인쇄</button></div></section><aside class="sidebar right" aria-label="선택 정보"><h2>선택 객체 <span class="badge" id="selectedCount">0</span></h2><div id="inspector"></div><h3><button id="metricsToggle" type="button" class="metrics-toggle" aria-controls="spaceMetrics" data-testid="metrics-toggle">공간 지표</button></h3><div id="spaceMetrics" data-testid="space-metrics"></div></aside></main>
<button id="sGrip" type="button" aria-label="하단 패널 높이 조절" role="separator" aria-orientation="horizontal" aria-valuemin="160" aria-valuemax="600" title="위아래로 끌어 공통 높이 조절 · 방향키 20px" tabindex="0" data-testid="bottom-grip"></button><div id="sBottom" data-testid="bottom-panel">${BOTTOM_HTML}</div></div>
<footer>오프라인 전용 · 외부 통신 없음 · 브라우저 로컬 저장 + JSON 백업 권장 · 직사각형 평면 설계 도구이며 하중·법규·피난 동선 검증은 별도로 필요합니다.</footer>
<div id="toast" class="toast" role="alert" data-testid="toast" hidden></div>`;

function renderShell(root) {
  const tpl = document.createElement('template');
  tpl.innerHTML = SHELL;
  root.prepend(tpl.content);
  const $ = (id) => document.getElementById(id);
  $('appVersion').textContent = `v${APP_VERSION}`;
  $('appVersion').title = `앱 v${APP_VERSION} · 프로젝트 스키마 ${SCHEMA_VERSION}`;

  // 왼쪽(기준본 sidebar.left): 정밀 설정 · 선택/통로/화면 · Excel · 01~05 · 새 프로젝트. 창고 치수·참고 도면 칸은 room-panel이 채운다.
  const wheelSelect = $('mWheelSensitivity');
  for (const [v, t] of Object.entries(WHEEL_LABELS)) wheelSelect.append(el('option', { value: v }, t));
  const toolButtons = [...document.querySelectorAll('#toolButtons [data-tool]')];
  const colorInputs = Object.fromEntries(['empty', 'low', 'mid', 'high', 'over', 'unknown'].map((k) => [k, $('color' + k[0].toUpperCase() + k.slice(1))]));

  // 오른쪽(기준본 sidebar.right): 선택 객체·공간 지표
  const inspector = $('inspector');
  inspector.dataset.testid = 'inspector';
  const selList = el('ul'); // 기준본에 없는 선택 목록: 화면에는 두지 않는다

  // 하단(기준본 sBottom): 마크업은 ui/bottom-markup.js. 구역은 key로 찾는다.
  const bottomSections = Object.fromEntries([...document.querySelectorAll('#sBottom .s-section')].map((e) => [e.dataset.section, e]));
  const exportBtns = { svg: $('svgOut'), png: $('pngOut'), print: $('printBtn'), 'racks-csv': $('rackCsv'), 'history-csv': $('historyCsv'), 'template-csv': $('csvTemplate') };

  return {
    status: $('saveStatus'), detail: document.querySelector('[data-testid=status-detail]'), notice: document.querySelector('[data-testid=notice]'), banner: $('sampleBanner'),
    saveBtn: $('vSave'), undoBtn: $('undo'), redoBtn: $('redo'), exportBtn: $('jsonOut'), importInput: $('jsonIn'),
    versionsBtn: $('vVersions'), storageBtn: $('vStorage'), retryBtn: $('vRetry'), rawBtn: $('vRecoverRaw'), recoveryBtn: $('rBackupDownload'),
    kpi: { area: $('kArea'), areaSub: $('kAreaSub'), footprintSub: $('kFootprintSub'), racks: $('kRacks'), footprint: $('kFootprint'), aisleShare: $('kAisleShare'), aisleArea: $('kAisleArea'), blockedShare: $('kBlockedShare'), blockedArea: $('kBlockedArea'), remainShare: $('kRemainShare'), remainArea: $('kRemainArea'), minAisle: $('kMinAisle'), minAisleSub: $('kMinAisleSub'), warnings: $('kWarnings'), summary: $('topSummary') }, topToggle: $('topToggle'), metricsToggle: $('metricsToggle'), wSummary: document.querySelector('[data-testid=w-summary]'), wNote: $('wTopNote'), wAll: $('wAll'), wViolations: $('wViolations'),
    measureResult: $('measureResult'), toolSelect: toolButtons[0], toolPan: toolButtons[1], toolHelp: $('toolHelp'), zoomOut: $('zoomOut'), zoomIn: $('zoomIn'), zoomLabel: $('zoomLabel'), fit: $('fit'), zoom50: $('mZoom50'), zoom200: $('mZoom200'), focus: $('focusSelection'), centerLock: $('mCenterLock'),
    centerBtn: $('mCenter'), resetZoomBtn: $('mResetZoom'), selectAllBtn: $('mSelectAll'), clearSelBtn: $('mClearSelection'), selectRule: $('mSelectRule'), policy: $('collisionPolicy'), gridStep: $('gridStep'), gridOn: $('gridOn'), minGap: $('minGap'), ruleInputs: [...document.querySelectorAll('[data-rule]')], ruleState: $('ruleState'),
    snapOn2: $('snapOn'), decimals: $('qDecimals'), fastStep: $('qFastStep'), guides: $('qGuides'), guideSnap: $('qGuideSnap'), nudgeBtns: [...document.querySelectorAll('[data-q-nudge]')],
    aisleType: $('mAisleType'), ruleMin: $('mRuleMin'), ruleTarget: $('mRuleTarget'), ruleEnabled: $('mRuleEnabled'), ruleApply: $('mApplyAisleRule'), validateBtn: $('mValidate'), polygonBtn: $('mPolygonAisle'), polygonFinish: $('mFinishPolygon'),
    excelFile: $('exFile'), excelStatus: $('exSideStatus'), rackPalette: $('rackPalette'), newBlank: $('newBlank'), loadSample: $('loadSample'),
    labelMode: $('vLabelMode'), labelLayout: $('qLabelLayout'), labelPadding: $('qNumberPadding'), labelStatus: $('vLabelStatus'),
    vizMode: $('exViz'), heightPolicy: $('exHeightPolicy'), colorMode: $('vColorMode'), themeBtn: $('vThemeOpen'), applyColorsBtn: $('applyColors'),
    thrLow: $('thresholdLow'), thrHigh: $('thresholdHigh'), colorInputs,
    wheelSelect, wheelReset: $('mWheelReset'), wheelStatus: $('mWheelStatus'), canvasWrap: $('canvasWrap'), plan: $('plan'), hint: $('canvasHint'), selStatus: $('selectionStatus'), selCount: $('selectedCount'), selList,
    scenBefore: $('rBefore'), scenAfter: $('rAfter'), rActive: $('rActive'), lockBtn: $('rLock'), lockState: $('rLockState'), cloneBtn: $('rClone'), seedAfter: $('seedAfter'), scenarioSelect: $('scenario'), compareBtn: $('compareBtn'), historyBtn: $('rHistory'),
    leftToggle: $('mLeftPanel'), rightToggle: $('mRightPanel'), bothClose: $('mBothClose'), bothOpen: $('mBothOpen'), bottomToggle: $('sBottomToggle'), bottomDefault: $('bDefaultLayout'), bottomGrip: $('sGrip'), bottom: $('sBottom'),
    bottomSections, exportBtns, main: $('app'), metricsBody: $('spaceMetrics'), legendBox: $('legend'), excelBtn: $('exOpen'), alignXBtn: $('alignX'), alignYBtn: $('alignY'), distributeBtn: $('distribute'), distributeGap: $('distributeGap'),
    name: $('projectName'), roomBody: $('roomBody'), refBody: $('refBody'), histDate: $('historyDate'), histSlider: $('dateSlider'), histMode: $('historyMode'), liveBtn: $('liveBtn'), histStatus: $('historyStatus'), histFirst: $('historyFirst'), histLast: $('historyLast'), toolButtons, rackType: $('newRackType'), newWidth: $('newWidth'), newDepth: $('newDepth'), newHeight: $('newHeight'), newUnit: $('newUnit'),
    rotateBtn: $('rotate'), duplicateBtn: $('duplicate'), deleteBtn: $('delete'), allowWarnings: $('mAllowWarnings'), snapOn: $('qSnap'), snapStep: $('qSnapStep'), keyStep: $('qKeyStep'), inspector, toast: $('toast'),
  };
}

async function start() {
  const ui = renderShell(document.body);
  const printArea = el('div', { id: 'printArea', 'aria-hidden': 'true' });
  document.body.append(printArea);
  const store = createProjectStore({ storage: window.localStorage, validate: projectValidator });
  const ids = createIdGenerator();
  // 주요 작업 전 전체 프로젝트 백업 링(기준본 V.checkpoint, D-026). 지문은 저장 메타(persistence)를 뺀 프로젝트 JSON.
  const backups = createBackupRing({ storage: window.localStorage, validate: projectValidator, fingerprint: (p) => JSON.stringify({ ...p, persistence: undefined }), nextId: ids });
  const session = createSession({ store, nextId: ids, backups });
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const storageDialogs = createStorageDialogs({ session, store, backups, storage: window.localStorage, validate: projectValidator, schemaVersion: SCHEMA_VERSION, today, toast: (t) => showToast(t), download });

  // ── 화면 상태(세션 밖) ──
  let tool = 'select';
  let selected = new Set();
  let view = null; // 현재 카메라. 조작 중에는 세션보다 앞서 있을 수 있다.
  let gesture = null;
  let marquee = null;
  let lastProject = null;
  let sceneKey = null;
  let sceneScale = null;
  let sceneWarnings = [];
  let lastScan = null; // 마지막 배치 검사 결과(선택 정보 패널의 위치·배치 검사 칸)
  let multiTouch = false; // 기준본 multiTouchSelect: 켜면 클릭이 선택 토글
  const tracker = createWheelTracker();
  const wheel = { pending: 0, clientX: 0, clientY: 0, frame: 0 };
  const touches = new Map();
  let wheelMode = loadWheelMode(window.localStorage);
  let polygonPoints = null; // 다각형 통로 그리는 중이면 월드 m 꼭짓점 배열, 아니면 null
  let measurePts = []; // 거리 측정 도구의 점(화면 상태, 프로젝트·실행취소와 무관)
  let preview = null; // 드래그 이동 중 미리보기 { layout, guides }
  let clipboard = [];
  let toastTimer = 0;
  let historyDate = ''; // 과거 조회 날짜: 화면 상태이며 프로젝트에 저장하지 않는다(기준본 historyDate 전역).
  let historyMode = 'recorded';
  let histMemo = null;
  const panels = createPanels({ kpi: ui.kpi, metrics: ui.metricsBody, legend: ui.legendBox }, {
    onFocus: (ids) => {
      const existing = new Set(layout().objects.map((o) => o.id));
      commitSelection(new Set(ids.filter((id) => existing.has(id))));
      const box = selectionBox(layout().objects.filter((o) => selected.has(o.id)));
      if (box) commitView(focusBox(view, box, W(), size()));
    },
    onView: (v) => pref({ panels: { view: v } }),
  });
  const rackDetail = createRackDetail({
    getProject: () => project(),
    getLayout: () => layout(),
    saveOrder: (order) => pref({ rackInfographic: { shelfOrder: order } }),
    download,
    toast: (t) => showToast(t),
  });
  const records = createRecordsPanel({
    getProject: () => project(),
    isHistory: () => !!historyDate,
    onView: (snap) => { if (snap.scenario !== project().settings.scenario) switchScenario(snap.scenario); historyMode = 'recorded'; setHistory(snap.date); },
    onViewState: (v) => pref({ panels: { view: v } }),
    openCompare: () => scenarioDialogs.openCompare(),
    saveInventory: async ({ date, source, includeLayout }) => {
      const r = await command('현재 재고·배치 저장', saveInventorySnapshot({ id: session.nextId(), date, source, includeLayout, recordedAt: new Date().toISOString() }));
      if (r?.ok) showToast(`${date} 기록을 저장했습니다. 미입력 재고는 미확인으로 유지됩니다.`);
    },
    importCsv: async (text, replace) => {
      const { history, count } = parseInventoryCsv(text, project(), { replace });
      const r = await command('재고 CSV 가져오기', importInventory(history));
      if (!r?.ok) throw new Error('재고 가져오기가 차단되었습니다.');
      showToast(`${count}개 재고 기록을 가져왔습니다. 날짜를 선택해 조회하세요.`);
    },
    today,
    saveSnapshot: (date, name) => command('현재 배치 기록', saveSnapshot({ id: session.nextId(), date, name, recordedAt: new Date().toISOString() }), SAVE_SNAPSHOT_COMMAND),
    restoreSnapshot: async (id) => {
      const r = await run(RESTORE_SNAPSHOT_COMMAND, (p, ctx) => applyCommand(p, restoreSnapshot(id), { command: RESTORE_SNAPSHOT_COMMAND, selection: [...selected], resetCamera: true, ...ctx }));
      if (r?.ok) {
        commitSelection(new Set());
        showToast('배치를 복원했습니다. 현재 수량·자재 연결과 날짜별 이력은 유지됩니다.');
      }
    },
    toast: (t) => showToast(t),
  });
  const excelDialog = createExcelDialog({ toast: (t) => showToast(t), getProject: () => project(), nextId: session.nextId, applyProposal: (pr, ctx) => historyBlocked() || session.apply(EXCEL_APPLY_COMMAND, (p, opts) => applyExcelProposal(p, pr, ctx, opts)),
    download, exportRecovery: () => storageDialogs.exportRecovery(), openStorage: () => storageDialogs.openStorage(),
    // 기준본 40 exPick: 대화상자를 닫고 도면을 클릭한 지점을 A열 기준점으로 쓴다. Esc는 취소(대화상자는 닫힌 채).
    pickPoint: (done) => {
      picking = done;
      setTool('select');
      showToast('도면을 클릭해 A열 기준점(회전 외곽 좌상단)을 지정하세요. Esc로 취소합니다.');
    } });
  let picking = null;
  ui.plan.addEventListener('pointerdown', (e) => {
    if (!picking) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const done = picking, p = toWorld(e.clientX, e.clientY);
    picking = null;
    done(p);
  }, { capture: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && picking) {
      picking = null;
      showToast('A열 기준점 지정을 취소했습니다.');
    }
  }, true);
  const scenarioDialogs = createScenarioDialogs({
    getProject: () => project(), toast: (t) => showToast(t), download, pngBlob, openHistoryPanel: () => pref({ panels: { bottomOpen: true, bottomSections: { ...panelsOf().bottomSections, layout: true }, layoutPreset: 'custom' } }), jsonName: () => `warehouse_project_v${SCHEMA_VERSION.replaceAll('.', '_')}_${today()}.json`, cloneBeforeToAfter, restoreBackup, cloneCommand: CLONE_COMMAND, restoreCommand: RESTORE_COMMAND,
    apply: (label, compute) => historyBlocked() || session.apply(label, compute),
  });
  createInfoDialogs({ appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION });
  const groupDialog = createGroupDialog({
    getProject: () => project(),
    getSelection: () => selectedRackIds(),
    toast: (t) => showToast(t),
    apply: (label, mutate, overrideAllow) => run(label, (p, ctx) => applyCommand(p, mutate, { command: label, selection: [...selected], overrideAllow, ...ctx })),
  });

  const project = () => session.state.project;
  const layout = () => {
    const p = project();
    if (!historyDate) return p.scenarios[p.settings.scenario];
    if (!histMemo || histMemo.p !== p || histMemo.d !== historyDate || histMemo.m !== historyMode) histMemo = { p, d: historyDate, m: historyMode, l: historyLayout(p, historyDate, historyMode) };
    return histMemo.l;
  };
  const HISTORY_MESSAGE = '과거 조회는 읽기 전용입니다.';
  /** 과거 조회 중이면 편집을 막는다(BEFORE 잠금 안내가 먼저). 막았으면 실패 결과를 돌려준다. */
  function historyBlocked() {
    if (!historyDate || isLocked(project())) return null;
    showToast(HISTORY_MESSAGE);
    return { ok: false, reason: HISTORY_MESSAGE };
  }
  const size = () => {
    const r = ui.canvasWrap.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const toWorld = (clientX, clientY) => {
    const pt = ui.plan.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ui.plan.getScreenCTM().inverse());
  };
  /** 화면 픽셀 이동량 → 월드 m 이동량(시작 시점 변환 행렬 m). */
  const deltaWorld = (m, dx, dy) => ({ x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy });

  function applyCamera() {
    if (!view || !project()) return;
    const v = viewBox(view, layout().warehouse, size());
    ui.plan.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    ui.zoomLabel.textContent = `${fmt(view.zoom * 100, 0)}%`;
    ui.centerLock.checked = view.centerLocked;
    renderPlan();
  }

  let appliedTheme = null;
  function renderPlan(force = false) {
    const p = project();
    if (!p) return;
    if (p.theme !== appliedTheme) { appliedTheme = p.theme; applyTheme(p); }
    const l = layout();
    const u = view ? pixelsPerMeter(view, l.warehouse, size()) : 20;
    const key = [l, !!historyDate, p.settings, p.theme, p.precision, p.rackLabels, p.scenarioMeta, p.panels, p.inventoryHistory, p.layoutSnapshots, [...selected].join('\u0000'), tool, marquee && JSON.stringify(marquee), polygonPoints, measurePts, preview, gesture && gesture.kind !== 'move' ? gesture.kind : null];
    const same = !force && sceneKey && key.every((k, i) => k === sceneKey[i]);
    if (same && u === sceneScale) return;
    // 확대율만 바뀌면 라벨 크기·배치(화면 px 기준)만 다시 계산하고 선택·패널은 그대로 둔다.
    const scaleOnly = same;
    sceneKey = key;
    sceneScale = u;
    const r = buildScene(preview?.layout ?? l, p, { selected, tool, marquee, guides: preview?.guides, pixelsPerMeter: u, gesture: gesture?.kind, resize: isLocked(p) || historyDate ? null : { live: gesture?.kind === 'resize' && gesture.moved, invalidText: preview?.invalidText }, filter: p.panels.view, warnings: scaleOnly ? sceneWarnings : undefined });
    sceneWarnings = r.warnings;
    ui.plan.innerHTML = r.svg + overlaySvg(u);
    ui.labelStatus.textContent = labelStatusText(r.labelHidden);
    if (scaleOnly) return;
    // 기준본 W.top: 현재(또는 과거 조회) 도면 재검사 한 줄 요약
    if (!preview) {
      const chk = lastScan = scanLayout(l, p);
      ui.wSummary.textContent = candidateSummary(chk);
      ui.wSummary.className = chk.rows?.some((x) => x.issues?.length) ? 'w-warning' : '';
      ui.wNote.textContent = '실제 설치 검토 전 설계안 · ' + (historyDate ? '과거 도면 재검사' : '현재 도면 재검사');
    }
    renderSelection();
    if (!preview) {
      panels.render({ layout: l, project: p, selected, warnings: r.warnings });
      records.render();
      bottomSummary(p, l);
      rackDetail.refresh();
    }
  }

  /** 기준본 B.summary(65·70): 하단 구역 머리글 요약. */
  function bottomSummary(p, l) {
    const n = p.inventoryHistory.length, cur = p.inventoryHistory.filter((r) => r.scenario === p.settings.scenario).length;
    const text = { inventory: n ? `현재 ${cur}건 · 전체 ${n}건` : '기록 없음 · 0건', layout: p.layoutSnapshots.length ? `${p.layoutSnapshots.length}건` : '기록 없음 · 0건', racks: `${l.objects.filter((o) => o.kind === 'rack').length}개`, space: document.getElementById('warningCount').textContent };
    for (const [k, box] of Object.entries(ui.bottomSections)) box.querySelector('.b-summary').textContent = text[k];
  }

  /** 진행 중인 다각형 통로와 거리 측정 점(화면 전용 덧그림). */
  function overlaySvg(u) {
    const dots = (pts, color) => pts.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="${4 / u}" fill="${color}"/>`).join('');
    const line = (pts, color, close) => (pts.length > 1 ? `<polyline points="${pts.map((q) => q.join(',')).join(' ')}${close ? ' ' + pts[0].join(',') : ''}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>` : '');
    const m = measurePts.map((q) => [q.x, q.y]);
    return `<g pointer-events="none">${polygonPoints ? line(polygonPoints, '#38bdf8', polygonPoints.length > 2) + dots(polygonPoints, '#38bdf8') : ''}${line(m, '#ffd166') + dots(m, '#ffd166')}</g>`;
  }
  function cancelPolygon() {
    polygonPoints = null;
    ui.polygonFinish.disabled = true;
  }

  function renderSelection() {
    const os = layout().objects.filter((o) => selected.has(o.id));
    // 기준본 50-editor: 랙이 있으면 'N개 랙 · 면적 ㎡', 아니면 'N개 객체 선택'. 배지는 선택 수.
    const rs = os.filter((o) => o.kind === 'rack');
    ui.selStatus.textContent = rs.length ? `${rs.length}개 랙 · 면적 ${fmt(rs.reduce((a, o) => a + o.width * o.depth, 0), 3)}㎡` : `${os.length}개 객체 선택`;
    ui.selCount.textContent = String(os.length);
    const lockedNow = !!historyDate || isLocked(project());
    for (const b of ui.nudgeBtns) b.disabled = !os.length || lockedNow;
    ui.rackPalette.disabled = lockedNow;
    // 기준본 40 exSideStatus
    const linked = layout().objects.filter((o) => o.kind === 'rack' && o.excel);
    ui.excelStatus.textContent = linked.length ? `${linked.length}개 연결 랙 · ${linked.reduce((n, o) => n + rackItems(o).length, 0)}개 자재 위치` : '랙 → 선반 → 자재 계층으로 연결합니다.';
    ui.selList.replaceChildren(...os.slice(0, 50).map((o) => el('li', {}, `${o.code} · ${o.kind === 'rack' ? '랙' : o.kind}`)));
    if (os.length > 50) ui.selList.append(el('li', { class: 'muted' }, `외 ${os.length - 50}개`));
    ui.focus.disabled = !os.length;
    const locked = isLocked(project());
    const ro = locked || !!historyDate;
    for (const b of [ui.rotateBtn, ui.duplicateBtn, ui.deleteBtn]) b.disabled = !os.length || ro;
    const rackCount = os.filter((o) => o.kind === 'rack').length;
    for (const b of [ui.alignXBtn, ui.alignYBtn, ui.distributeBtn]) b.disabled = rackCount < 2 || ro;
    if (!preview) renderInspector(ui.inspector, { objects: os, layout: layout(), project: project(), selected, history: !!historyDate, locked, multiTouch, warnings: sceneWarnings, scan: lastScan, on: inspectorHandlers });
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 6000);
  }

  /** 편집 명령 실행: 실패하면 이유를 알린다(기준본 toast '전체 취소: …'). */
  async function run(label, compute) {
    const blocked = historyBlocked();
    if (blocked) return blocked;
    try {
      const r = await session.apply(label, compute);
      if (r && !r.ok) showToast(`전체 취소: ${r.reason}`);
      return r;
    } catch (e) {
      showToast(`편집을 적용하지 않았습니다: ${e.message}`);
      return null;
    }
  }
  // 명령 기록 이름은 기준본처럼 따로 지정한 것 외에는 '객체 수정'이다. label은 실행취소 표시용.
  const command = (label, mutate, name = COMMAND_DEFAULT) => run(label, (p, ctx) => applyCommand(p, mutate, { command: name, selection: [...selected], ...ctx }));

  // 창고 치수·참고 도면(Phase 9a): 모든 변경은 applyCommand를 거쳐 실행취소에 기록된다.
  let calibration = [];
  const roomPanel = createRoomPanel({ room: ui.roomBody, ref: ui.refBody }, {
    getProject: () => project(),
    isHistory: () => !!historyDate,
    applyRoom: (r) => run('치수 적용', (p, ctx) => applyRoom(p, r, ctx)),
    setBackground: (label, mutate) => command(label, (d, l) => mutate(d.settings.background, l.warehouse)),
    useReference: () => command('첨부 도면 사용', (d, l) => Object.assign(d.settings.background, { data: REFERENCE_IMAGE, show: true, x: 0, y: 0, width: l.warehouse.width, height: l.warehouse.height })),
    startCalibration: () => { calibration = []; setTool('calibrate'); },
    toast: (t) => showToast(t),
  });
  /** 축척 보정 도구의 클릭 한 번(기준본 30 tool==='calibrate'): 두 점 거리와 실측 거리의 비로 첫 점 기준 균일 확대. */
  function calibrationClick(p) {
    calibration.push({ x: p.x, y: p.y });
    if (calibration.length < 2) return;
    const [a, b] = calibration, d = Math.hypot(a.x - b.x, a.y - b.y), actual = roomPanel.calibrationLength();
    calibration = [];
    if (d > EPS && actual > 0) {
      const f = actual / d;
      command('참고 도면 축척 보정', (dr) => {
        const g = dr.settings.background;
        g.x = a.x + (g.x - a.x) * f;
        g.y = a.y + (g.y - a.y) * f;
        g.width *= f;
        g.height *= f;
      }).then((r) => r?.ok && showToast('배경 축척을 보정했습니다. 위치는 별도로 조정할 수 있습니다.'));
    }
    setTool('select');
  }

  /** 라벨 표시 설정 변경. 기준본 V.appearanceEdit처럼 실행취소에 기록하고 저장한다. */
  function labelEdit(label, mutate) {
    return session.edit(label, mutate).then(() => renderPlan(true)).catch((e) => { showToast(`색상·표시 설정 취소: ${e.message}`); renderPlan(true); });
  }
  function syncColorInputs() {
    const st = project().settings;
    ui.vizMode.value = st.vizMode ?? 'inventory';
    ui.heightPolicy.value = st.heightPolicy ?? 'weightedMax';
    ui.colorMode.value = project().theme.colorMode;
    ui.thrLow.value = st.low;
    ui.thrHigh.value = st.high;
    for (const [k, i] of Object.entries(ui.colorInputs)) i.value = st.colors[k];
  }
  const colorEdit = (label, mutate) => labelEdit(label, mutate).then(syncColorInputs);
  const themeDialog = createThemeDialog({
    project, resetColors,
    edit: (label, mutate) => session.edit(label, mutate).then(() => { renderPlan(true); syncColorInputs(); return true; }).catch((e) => { showToast(`색상·표시 설정 취소: ${e.message}`); renderPlan(true); return false; }),
  });
  function editObjectColor(id, color) {
    colorEdit('객체 표시 색상', (d) => setObjectColor(d, id, color));
  }
  function editZone(o, name) {
    if (name === '') return showToast('표시 이름을 입력하세요.');
    const { key } = rackLabelParts(o, project(), project().settings.scenario);
    labelEdit('ZONE 표시 이름', (d) => {
      const names = d.rackLabels.zoneNames[d.settings.scenario];
      if (name === null) delete names[key];
      else Object.defineProperty(names, key, { value: name, enumerable: true, configurable: true, writable: true });
    });
  }

  function editField(id, field, raw, isNumber) {
    if (selected.size === 1 && MM_INPUT_FIELDS.has(field) && !isMmInput(raw)) {
      showToast(mmInputMessage(field, raw));
      renderPlan(true);
      return;
    }
    const dim = (field === 'width' || field === 'depth') && selected.size === 1;
    (dim ? command(DIMENSION_COMMAND, setDimension(id, field, raw), DIMENSION_COMMAND) : command('객체 수정', setField(id, field, fieldValue(field, raw, isNumber)))).then(() => renderPlan(true));
  }
  // 선택 정보 패널(ui/inspector.js)의 동작. 모두 command(applyCommand)를 거쳐 실행취소에 기록되고, 실패하면 '전체 취소: …'를 알린다.
  const redraw = (r) => { renderPlan(true); return r; };
  const inspectorHandlers = {
    change: editField,
    limit: (id, key, raw) => command(LIMIT_COMMAND, setLimit(id, key, Number(raw)), LIMIT_COMMAND).then(redraw),
    aspect: (id, v) => command('폭·깊이 비율 잠금', setAspectLock(id, v)).then(redraw),
    lock: (id, v) => command('위치 잠금', setPositionLock(id, v)).then(redraw),
    review: (id, on) => command(on ? '검토 중 표시' : '검토 중 표시 해제', setReviewMark(id, on)).then(redraw),
    zone: (name) => editZone([...selected].map((id) => layout().objects.find((o) => o.id === id))[0], name),
    color: (c) => editObjectColor([...selected][0], c),
    openInfo: (id) => rackDetail.open(id),
    physical: (id) => {
      if (!confirm('현재 설계 치수를 실제 설비 변경으로 확인하여 기록합니까? Excel 원본 규격은 그대로 보존됩니다.')) return;
      command(PHYSICAL_COMMAND, confirmPhysical(id, new Date().toISOString(), session.nextId()), PHYSICAL_COMMAND).then(redraw);
    },
    aisle: (id, key, raw) => {
      let value = raw;
      if (key === 'scopeIds') {
        value = parseScope(raw, layout().objects);
        if (!value) { showToast('검사 대상 랙 번호를 확인하세요.'); return renderPlan(true); }
      }
      return command('통로 검사 설정', setAisleField(id, key, value)).then(redraw);
    },
    multi: (v) => { multiTouch = v; },
    group: (action) => groupDialog.open(action),
    duplicate: () => duplicate(selectedObjects()),
    remove: () => deleteSelected(),
    undo: () => { if (!historyDate) guard(() => session.undo()); },
    check: () => aisleDialog.open(),
    compare: () => scenarioDialogs.openCompare(),
    exportCsv: (racks) => csv(SELECTED_CSV_NAME, selectedCsvRows(racks)),
  };
  async function addAt(kind, point) {
    const p = project();
    const add = addObjectAt(p, kind, point, { nextId: session.nextId, rack: { width: Number(ui.newWidth.value), depth: Number(ui.newDepth.value), height: Number(ui.newHeight.value), type: ui.rackType.value, unit: ui.newUnit.value } });
    // D-040: 거부 사유와 해결 방법을 알린다(기준본은 창고 밖 클릭을 조용히 무시).
    if (!add) return showToast(`${OBJECT_NAMES[kind] || '객체'}를 추가하지 않았습니다: 창고 범위 밖입니다. 창고 안쪽을 클릭하세요.`);
    let res;
    const r = await run('객체 추가', (q, ctx) => (res = applyCommand(q, add.mutate, { command: COMMAND_DEFAULT, selection: [...selected], ...ctx })));
    if (r?.ok) commitSelection(new Set([add.id]));
    else if (res?.spatial) showToast(`전체 취소: ${res.reason} · 빈 곳을 다시 클릭하거나, 겹침을 허용하려면 '공간 위반을 경고 후 허용'을 켜세요.`);
  }
  const selectedObjects = () => layout().objects.filter((o) => selected.has(o.id));
  const OBJECT_NAMES = { rack: '랙', wall: '내부 벽', column: '기둥', door: '출입문', aisle: '통로', blocked: '보관 불가 구역', work: '작업 공간' };
  const deleteNoun = () => { const k = new Set(selectedObjects().map((o) => o.kind)); return k.size === 1 && k.has('rack') ? '랙' : '객체'; };
  async function deleteSelected() {
    if (!selected.size) return;
    // D-040: 2개 이상 삭제는 확인 후 진행(1개는 기준본처럼 즉시).
    if (selected.size >= 2 && !confirm(`${deleteNoun()} ${selected.size}개를 삭제합니다. 자동 백업 후 삭제되며 ↶로 되돌릴 수 있습니다.`)) return;
    const r = await command('객체 삭제', deleteObjects([...selected]));
    if (r?.ok) commitSelection(new Set());
  }
  async function duplicate(source) {
    if (!source.length) return;
    const d = duplicateObjects(source, { nextId: session.nextId });
    const r = await command('객체 복제', d.mutate);
    if (r?.ok) commitSelection(new Set(d.ids));
  }
  const selectedRackIds = () => [...selected].filter((id) => layout().objects.some((o) => o.kind === 'rack' && o.id === id));
  const rotateSelected = () => {
    if (!selected.size) return;
    if (selectedRackIds().length > 1) return groupDialog.open('rotate');
    command('객체 회전', rotateObjects([...selected]));
  };
  function nudge(dx, dy, fast) {
    if (!selected.size || tool !== 'select') return;
    const n = nudgeObjects(project(), [...selected], dx, dy, fast);
    const name = `키보드 미세 이동 ${fmt(n.step, 3)}m`;
    command(name, n.mutate, name);
  }

  function syncHistory() {
    const p = project();
    if (!p) return;
    const dates = historyDates(p), on = !!historyDate;
    ui.histDate.value = historyDate || ui.histDate.value || today();
    ui.histFirst.textContent = dates[0] || '기록 없음';
    ui.histLast.textContent = dates.at(-1) || '—';
    ui.liveBtn.classList.toggle('primary', !on);
    ui.histMode.value = historyMode;
    ui.histSlider.max = String(Math.max(0, dates.length - 1));
    ui.histSlider.value = String(Math.max(0, dates.indexOf(historyDate)));
    ui.histSlider.disabled = !dates.length;
    ui.liveBtn.disabled = !on;
    ui.histStatus.textContent = historyStatusText(p, historyDate, layout());
    ui.hint.textContent = on ? `과거 조회 · 읽기 전용 · ${historyDate}` : '원점: 좌상단 · X → / Y ↓ · 단위 m';
    ui.undoBtn.disabled = on || !session.state.canUndo || session.state.status === 'saving';
    ui.redoBtn.disabled = on || !session.state.canRedo || session.state.status === 'saving';
    for (const b of ui.toolButtons) if (!['select', 'pan', 'measure'].includes(b.dataset.tool)) b.disabled = on;
    roomPanel.updateState();
  }
  /** 기준본 setHistory: 선택 해제·카메라 초기화·선택 도구. */
  function setHistory(d) {
    abortGesture();
    historyDate = d;
    commitSelection(new Set());
    setTool('select');
    commitView(centerView(view, true, W(), size()));
    syncHistory();
    renderPlan(true);
  }

  function setTool(t) {
    tool = t;
    cancelPolygon();
    measurePts = [];
    for (const b of ui.toolButtons) b.classList.toggle('active', b.dataset.tool === t);
    ui.toolHelp.textContent = TOOL_HELP[t] ?? `${OBJECT_TYPES[t]}를 배치할 위치를 클릭하세요.`;
    ui.plan.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    renderPlan();
  }

  /** 카메라를 바꾸고 저장을 예약한다(실행취소 기록 없음). */
  function commitView(next, delay) {
    view = next;
    applyCamera();
    session.setView({ viewport: view }, delay === undefined ? undefined : { delay });
  }
  const commitSelection = (next) => {
    selected = next;
    renderPlan();
    session.setView({ selection: [...selected] }, { delay: 0 });
  };
  const cancelWheel = () => {
    cancelAnimationFrame(wheel.frame);
    wheel.frame = 0;
    wheel.pending = 0;
  };

  // 기준본 S.panels 높이 계산(데스크톱): 작업 영역 높이 = max(화면 남은 높이, 도면 최소 + 하단 전체 높이).
  function sizeWork() {
    const pn = project()?.panels;
    if (!pn) return;
    const work = document.getElementById('sWork'), ws = document.querySelector('.workspace');
    const tools = [...ws.children].filter((e) => e.id !== 'canvasWrap').reduce((n, e) => n + e.getBoundingClientRect().height, 0);
    const mainMin = Math.max(460, Math.ceil(tools + 280));
    const upper = Math.max(60, Math.min(360, pn.panelHeights.upper)), lower = Math.max(80, Math.min(420, pn.panelHeights.lower));
    const fullDock = document.getElementById('bDatebar').getBoundingClientRect().height + 2 * 38 + upper + lower + 20;
    const room = Math.max(700, innerHeight - ws.getBoundingClientRect().top - scrollY - 36);
    // D-040: 하단 패널을 닫으면 화면 높이에 맞춘다(페이지 세로 스크롤 없음). 열면 기준본 높이.
    // 3단 화면(폭 1100px 초과)에서만 적용. 아래 꼬리(footer)는 작업 영역을 따라 움직이므로 높이 계산이 되먹임하지 않는다.
    const wb = work.getBoundingClientRect(), foot = document.querySelector('body > footer');
    const tail = foot ? Math.max(0, foot.getBoundingClientRect().bottom - wb.bottom) : 0;
    const fit = !pn.bottomOpen && innerWidth > 1100;
    // D-051: 화면에 맞추더라도 도면 칸은 기준본 높이(약 674px) 아래로 줄이지 않는다. 화면이 더 크면 그만큼 키운다.
    const floor = mainMin + fullDock + 10; // 기준본에서 도면 칸이 갖는 높이
    // D-056: 하단 패널을 열어도 도면 칸은 닫았을 때의 최소 높이(floor − 도구 줄, 약 674px)를 지킨다. 하단 패널은 그 아래로 내려가고 페이지가 스크롤된다.
    // (기준본은 하단을 열면 도면 칸이 약 280px까지 줄었다.)
    const openRow = floor, openHeight = openRow + 10 + fullDock;
    work.style.height = (fit ? Math.max(floor, Math.floor(innerHeight - wb.top - scrollY - tail)) : pn.bottomOpen ? Math.max(room, openHeight) : Math.max(room, floor)) + 'px';
    work.style.gridTemplateRows = pn.bottomOpen ? `minmax(${openRow}px,1fr) 10px auto` : `minmax(${mainMin}px,1fr)`;
  }
  let workFrame = 0;
  const resizeWork = () => { cancelAnimationFrame(workFrame); workFrame = requestAnimationFrame(sizeWork); };
  window.addEventListener('resize', resizeWork);
  new ResizeObserver(resizeWork).observe(document.querySelector('header'));

  // ── 세션 상태 → 화면 ──
  const paint = (s) => {
    storageDialogs.observe(s);
    ui.recoveryBtn.hidden = !s.lastFailure;
    excelDialog.setStorage(STATUS_TEXT[s.status] ?? s.status, storageDialogs.riskText());
    ui.status.textContent = STATUS_TEXT[s.status] ?? s.status;
    ui.status.dataset.state = s.status;
    // 기준본 V.paint 상세 문구: (오류 · )(안내 · )마지막 확인 저장 시각 · 이 PC·브라우저 저장 …
    const saved = s.project?.persistence?.lastSavedAt;
    ui.detail.textContent = (s.error ? `${ERROR_HINT[s.error.code] ?? ''} (${s.error.code}${s.error.stage ? ' / ' + s.error.stage : ''}) ${s.error.message}${s.error.code === 'QUOTA' ? ' ' + storageDialogs.riskText() : ''} · ` : '') + (saved ? `마지막 확인 저장: ${new Date(saved).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · ` : '확인된 저장 시각 없음 · ');
    ui.notice.textContent = s.notice ? s.notice + ' · ' : '';
    ui.detail.parentElement.title = ui.detail.parentElement.textContent;
    if (s.project && document.activeElement !== ui.name) ui.name.value = s.project.metadata.name;
    if (s.project) {
      // 기준본 sampleBanner(20-renderer) + Excel 연결 문구(40-excel).
      const scenLayout = s.project.scenarios[s.project.settings.scenario];
      ui.banner.textContent = scenLayout.objects.some((o) => o.excel) ? 'Excel 연결 · 치수는 원본 기준 / 자동 생성 위치는 실측 아님 · ' + legend(s.project.settings).title + ' · 재고 수량과 높이 비율 분리' : s.project.metadata.sample ? '샘플 도면 · 첨부 평면도 참고. 창고·객체 치수와 위치는 실측값이 아닙니다. 초기 재고는 미입력입니다.' : '사용자 프로젝트 · 치수·위치의 근거는 선택 객체의 정보에서 확인하세요.';
      const scen = s.project.settings.scenario, locked = s.project.scenarioMeta[scen]?.locked, noBase = !s.project.scenarios.before.objects.some((o) => o.kind === 'rack');
      ui.rActive.textContent = `${scen.toUpperCase()} · ${locked ? '조회 / 원본 잠금' : '편집'}${noBase ? ' · BEFORE 기준 없음' : ''}`;
      ui.scenarioSelect.value = scen;
    }
    ui.retryBtn.hidden = s.status !== 'error';
    ui.rawBtn.hidden = !(s.corrupt || storageDialogs.hasProtectedRaw()); // 기준본 vRecoverRaw: 보호 원본이 있을 때
    ui.undoBtn.disabled = !s.canUndo || s.status === 'saving';
    ui.redoBtn.disabled = !s.canRedo || s.status === 'saving';
    ui.saveBtn.disabled = s.status === 'saving' || s.status === 'loading';
    if (!s.project) return;
    scenarioDialogs.renderHistory();
    ui.allowWarnings.checked = s.project.editing.allowWarnings;
    const pn = s.project.panels;
    ui.main.classList.toggle('left-closed', !pn.leftOpen);
    ui.main.classList.toggle('right-closed', !pn.rightOpen);
    // D-055: 상단 지표 영역·오른쪽 공간 지표 접기(값이 없으면 펼침). 접어도 경고 수는 한 줄 요약에 남긴다.
    const topShut = pn.topCollapsed === true, metricsShut = pn.metricsCollapsed === true;
    document.body.classList.toggle('top-collapsed', topShut);
    ui.kpi.summary.hidden = !topShut;
    ui.topToggle.textContent = topShut ? '지표 펼치기' : '지표 접기';
    ui.topToggle.setAttribute('aria-expanded', String(!topShut));
    ui.metricsBody.hidden = metricsShut;
    ui.metricsToggle.setAttribute('aria-expanded', String(!metricsShut));
    ui.bottom.hidden = ui.bottomGrip.hidden = !pn.bottomOpen;
    ui.bottomGrip.setAttribute('aria-valuenow', String(pn.bottomHeight));
    ui.bottomToggle.textContent = pn.bottomOpen ? '하단 전체 접기' : '하단 전체 펼치기';
    ui.bottomToggle.setAttribute('aria-expanded', String(pn.bottomOpen));
    ui.bottomToggle.setAttribute('aria-label', pn.bottomOpen ? '하단 전체 패널 접기' : '이전 개별 상태로 하단 전체 펼치기'); // 기준본 S.panels
    // 기준본 S.panels: 위 줄(재고기록·배치이력)은 panelHeights.upper, 아래 줄(랙 목록·공간검토)은 lower 높이. 접으면 머리글(38px)만 남는다.
    for (const [k, box] of Object.entries(ui.bottomSections)) {
      const open = pn.bottomSections[k], upperRow = k === 'inventory' || k === 'layout', content = box.querySelector('.s-content');
      const h = upperRow ? Math.max(60, Math.min(360, pn.panelHeights.upper)) : Math.max(80, Math.min(420, pn.panelHeights.lower));
      content.hidden = !open;
      content.style.height = h + 'px';
      box.style.height = 38 + (open ? h : 0) + 'px';
      const btn = box.querySelector('[data-bottom]');
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', BOTTOM_TITLES[k] + (open ? ' 접기' : ' 펼치기'));
      btn.querySelector('.b-toggle-heading').textContent = (open ? '▾ ' : '▸ ') + BOTTOM_TITLES[k];
    }
    ui.leftToggle.textContent = pn.leftOpen ? '접기: 설계 도구' : '펼치기: 설계 도구';
    ui.rightToggle.textContent = pn.rightOpen ? '접기: 선택 정보' : '펼치기: 선택 정보';
    sizeWork();
    ui.lockBtn.textContent = s.project.scenarioMeta.before.locked ? 'BEFORE 잠금 해제' : 'BEFORE 잠그기';
    ui.lockState.textContent = 'BEFORE ' + (s.project.scenarioMeta.before.locked ? '잠금' : '수정 허용');
    ui.lockBtn.dataset.locked = String(s.project.scenarioMeta.before.locked);
    ui.snapOn.checked = s.project.settings.snap;
    ui.snapOn2.checked = s.project.settings.snap;
    ui.policy.value = s.project.editing.allowWarnings ? 'warn' : 'block';
    ui.selectRule.value = s.project.editing.selectionRule;
    ui.gridStep.value = String(s.project.settings.grid);
    ui.gridOn.checked = s.project.settings.gridOn;
    if (document.activeElement !== ui.minGap) ui.minGap.value = String(s.project.settings.minGap);
    const er = effectiveRules(s.project, layout(), s.project.settings.scenario);
    for (const el of ui.ruleInputs) {
      el.disabled = !er;
      if (document.activeElement !== el) el.value = er && Number.isFinite(er.values[el.dataset.rule]) ? String(er.values[el.dataset.rule]) : '';
    }
    ui.ruleState.hidden = !er || er.applied;
    ui.decimals.value = String(s.project.precision.displayDecimals);
    ui.fastStep.value = String(s.project.precision.fastStep);
    ui.guides.checked = s.project.precision.guides;
    ui.guideSnap.checked = s.project.precision.guideSnap;
    if (![ui.ruleMin, ui.ruleTarget, ui.ruleEnabled].includes(document.activeElement)) loadAisleRule();
    ui.snapStep.value = String(s.project.precision.snapStep);
    ui.keyStep.value = String(s.project.precision.keyStep);
    syncColorInputs();
    ui.labelMode.value = s.project.rackLabels.displayMode === 'occupancy' && s.project.rackLabels.ratioSource === 'height' ? 'occupancy-height' : s.project.rackLabels.displayMode;
    ui.labelLayout.value = s.project.rackLabels.layoutMode;
    ui.labelPadding.value = String(s.project.rackLabels.numberPadding);
    if (s.project !== lastProject) {
      // 프로젝트를 처음 불러오거나 실행취소 등으로 바뀌면 저장된 선택·카메라를 따른다(조작 중이면 조작이 우선).
      const ids = new Set(s.project.scenarios[s.project.settings.scenario].objects.map((o) => o.id));
      selected = lastProject === null ? restoreSelection(s.project) : new Set([...selected].filter((id) => ids.has(id)));
      // 저장된 viewport에 fitScale이 아직 없으면(처음 연 프로젝트) 화면에서 정한 fitScale을 계속 쓴다.
      // 그렇지 않으면 패널 접기 같은 다른 변경 때 현재 화면 크기로 다시 계산되어 축척이 바뀐다.
      const pv = s.project.viewport;
      const sameBase = view && pv.zoom === view.zoom && pv.panX === view.panX && pv.panY === view.panY && pv.centerLocked === view.centerLocked;
      if (!gesture && !(sameBase && !(pv.fitScale > 0) && view.fitScale > 0)) view = withFitScale(pv, s.project.scenarios[s.project.settings.scenario].warehouse, size());
      lastProject = s.project;
    }
    renderPlan();
    applyCamera();
    syncHistory();
    roomPanel.sync();
  };
  session.subscribe(paint);

  const guard = async (fn) => {
    try {
      await fn();
    } catch (e) {
      ui.detail.textContent = `편집을 적용하지 않았습니다: ${e.message}`;
      ui.detail.title = ui.detail.textContent;
    }
  };

  // ── 프로젝트 명령 ──
  ui.name.addEventListener('change', () => guard(() => session.edit('프로젝트 이름 변경', (p) => { p.metadata.name = ui.name.value; })));
  let lastSave = null;
  ui.saveBtn.addEventListener('click', () => guard(() => (lastSave = session.save())));
  // D-040: Ctrl+S 결과를 짧게 알린다(저장 버튼과 같은 경로).
  async function saveByKey() {
    lastSave = null;
    ui.saveBtn.click();
    if (!lastSave) return showToast('저장 중이거나 저장할 수 없는 상태입니다.');
    const r = await lastSave.catch((e) => ({ state: 'FAILED', error: e }));
    showToast(r?.state === 'FAILED' ? `저장 실패: ${r.error?.message || '원인 미확인'} · 작업은 메모리에 유지됩니다 (UNSAVED)` : r?.state === 'UNCHANGED' ? '변경 없음 · 이미 저장됨 (SAVED)' : '저장됨 (SAVED) · 저장 후 읽기 확인 완료');
  }
  ui.histDate.addEventListener('change', () => setHistory(/^\d{4}-\d{2}-\d{2}$/.test(ui.histDate.value) ? ui.histDate.value : ''));
  ui.histSlider.addEventListener('input', () => { const d = historyDates(project())[Number(ui.histSlider.value)]; if (d) setHistory(d); });
  ui.histMode.addEventListener('change', () => { historyMode = ui.histMode.value; syncHistory(); renderPlan(true); });
  ui.liveBtn.addEventListener('click', () => setHistory(''));
  ui.undoBtn.addEventListener('click', () => guard(() => session.undo()));
  ui.redoBtn.addEventListener('click', () => guard(() => session.redo()));
  ui.exportBtn.addEventListener('click', () => { if (project()) storageDialogs.exportCurrent(); });
  // 내보내기(기준본 30): 현재 화면의 배치(과거 조회 중이면 그 날짜의 배치)를 쓴다. SVG·PNG·인쇄는 같은 reportSvg.
  const csv = (name, rows) => download(name, csvEncode(rows), 'text/csv;charset=utf-8');
  const report = () => reportSvg(project(), { layout: layout(), historyDate, today: today() });
  ui.exportBtns.svg.addEventListener('click', () => download('warehouse_layout.svg', report(), 'image/svg+xml;charset=utf-8'));
  ui.exportBtns.png.addEventListener('click', async () => {
    try {
      download('warehouse_layout.png', await pngBlob(report()));
      showToast('PNG 보고서를 저장했습니다.');
    } catch (e) {
      showToast('PNG 출력 실패: ' + e.message + ' · SVG 출력을 이용하세요.');
    }
  });
  ui.exportBtns.print.addEventListener('click', () => { printArea.innerHTML = report(); window.print(); });
  ui.exportBtns['racks-csv'].addEventListener('click', () => csv('warehouse_racks.csv', rackCsvRows(layout())));
  ui.exportBtns['history-csv'].addEventListener('click', () => csv('inventory_history.csv', historyCsvRows(project())));
  ui.exportBtns['template-csv'].addEventListener('click', () => csv('inventory_template.csv', templateCsvRows(layout(), today())));

  // 하단 패널(기준본 65): 접기·기본 복원·구역 접기·높이 조절. 화면 상태이므로 실행취소에 넣지 않는다.
  const panelsOf = () => project().panels;
  ui.bottomToggle.addEventListener('click', () => pref({ panels: { bottomOpen: !panelsOf().bottomOpen } }));
  ui.bottomDefault.addEventListener('click', () => {
    pref({ panels: { leftOpen: true, rightOpen: true, bottomOpen: false, bottomSections: { inventory: true, layout: true, racks: true, space: true }, bottomHeight: 300, panelHeights: { upper: 126, lower: 174 }, layoutPreset: 'restored-default' } });
    showToast('화면 구성만 초기화됩니다. 창고 데이터는 유지됩니다.');
  });
  for (const [k, box] of Object.entries(ui.bottomSections)) {
    box.querySelector('[data-bottom]').addEventListener('click', () => { if (project()) pref({ panels: { bottomSections: { ...panelsOf().bottomSections, [k]: !panelsOf().bottomSections[k] }, layoutPreset: 'custom' } }); });
  }
  const setBottomHeight = (h) => { const v = Math.max(160, Math.min(600, Math.round(h))); pref({ panels: { bottomHeight: v, panelHeights: { upper: Math.round(v * 0.42), lower: Math.round(v * 0.58) }, layoutPreset: 'custom' } }); };
  let gripDrag = null;
  ui.bottomGrip.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); gripDrag = { y: e.clientY, h: panelsOf().bottomHeight, id: e.pointerId }; ui.bottomGrip.setPointerCapture(e.pointerId); });
  ui.bottomGrip.addEventListener('pointermove', (e) => { if (gripDrag && e.pointerId === gripDrag.id) ui.bottom.style.height = Math.max(160, Math.min(600, gripDrag.h + gripDrag.y - e.clientY)) + 'px'; });
  const gripEnd = (e) => { if (!gripDrag) return; const d = gripDrag; gripDrag = null; if (e.type === 'pointerup') setBottomHeight(d.h + d.y - e.clientY); else ui.bottom.style.height = d.h + 'px'; };
  ui.bottomGrip.addEventListener('pointerup', gripEnd);
  ui.bottomGrip.addEventListener('pointercancel', gripEnd);
  ui.bottomGrip.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    setBottomHeight(e.key === 'Home' ? 160 : e.key === 'End' ? 600 : panelsOf().bottomHeight + (e.key === 'ArrowUp' ? 20 : -20));
  });
  ui.importInput.addEventListener('change', async () => {
    const f = ui.importInput.files[0];
    if (!f) return;
    ui.importInput.disabled = true;
    // 파일을 다 읽은 뒤에 선택을 비운다(같은 파일 다시 선택 가능). 읽기 전에 비우지 않는다.
    try { await storageDialogs.importFile(f); } finally { ui.importInput.value = ''; ui.importInput.disabled = false; }
  });
  ui.versionsBtn.addEventListener('click', () => storageDialogs.openBackups());
  ui.storageBtn.addEventListener('click', () => storageDialogs.openStorage());
  // 기준본 vRetry: 다른 탭 충돌이면 덮어쓰기 확인 후 강제 저장, 아니면 일반 저장(보호 원본은 저장이 차단되고 JSON 보관·이전 버전 복원으로만 교체).
  ui.retryBtn.addEventListener('click', () => {
    if (session.state.error?.code !== 'CONFLICT') return ui.saveBtn.click();
    if (!confirm('다른 탭 또는 창에서 저장한 내용을 이 탭의 현재 프로젝트로 덮어씁니다. 다른 탭의 저장본은 직전 정상본(이전 버전·백업)으로 보관됩니다. 계속하시겠습니까?')) return showToast('덮어쓰지 않았습니다. 현재 JSON을 내보내 보관한 뒤 새로고침하면 다른 탭에서 저장한 내용을 볼 수 있습니다.');
    guard(() => session.save({ force: true }));
  });
  ui.rawBtn.addEventListener('click', () => storageDialogs.exportProtectedRaw());
  ui.recoveryBtn.addEventListener('click', () => storageDialogs.exportRecovery());

  // ── 화면 명령(기준본 fit/zoomIn/zoomOut/mZoom50/mZoom200/mCenterLock/focusSelection) ──
  const W = () => layout().warehouse;
  for (const b of ui.toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
  ui.rotateBtn.addEventListener('click', () => rotateSelected());
  ui.excelBtn.addEventListener('click', () => excelDialog.open());
  ui.cloneBtn.addEventListener('click', () => scenarioDialogs.openClone());
  ui.seedAfter.addEventListener('click', () => scenarioDialogs.openClone());
  ui.compareBtn.addEventListener('click', () => scenarioDialogs.openCompare());
  ui.historyBtn.addEventListener('click', () => scenarioDialogs.openHistory());
  ui.alignXBtn.addEventListener('click', () => groupDialog.open('left'));
  ui.alignYBtn.addEventListener('click', () => groupDialog.open('top'));
  ui.distributeBtn.addEventListener('click', () => groupDialog.open('spaceX', { gap: ui.distributeGap.value }));
  const switchScenario = (k) => {
    abortGesture();
    selected = new Set();
    pref({ scenario: k });
  };
  ui.leftToggle.addEventListener('click', () => pref({ panels: { leftOpen: !project().panels.leftOpen } }));
  ui.rightToggle.addEventListener('click', () => pref({ panels: { rightOpen: !project().panels.rightOpen } }));
  ui.topToggle.addEventListener('click', () => pref({ panels: { topCollapsed: project().panels.topCollapsed !== true } }));
  ui.metricsToggle.addEventListener('click', () => pref({ panels: { metricsCollapsed: project().panels.metricsCollapsed !== true } }));
  ui.scenBefore.addEventListener('click', () => switchScenario('before'));
  ui.scenarioSelect.addEventListener('change', () => switchScenario(ui.scenarioSelect.value));
  ui.bothClose.addEventListener('click', () => pref({ panels: { leftOpen: false, rightOpen: false } }));
  ui.bothOpen.addEventListener('click', () => pref({ panels: { leftOpen: true, rightOpen: true } }));
  ui.scenAfter.addEventListener('click', () => switchScenario('after'));
  ui.lockBtn.addEventListener('click', () => {
    const locked = project().scenarioMeta.before.locked;
    if (locked && !confirm('개선 전 배치를 수정하면 개선 효과 분석의 기준 데이터가 변경됩니다. BEFORE 잠금을 해제합니까?')) return;
    pref({ beforeLocked: !locked });
  });
  ui.duplicateBtn.addEventListener('click', () => duplicate(selectedObjects()));
  ui.deleteBtn.addEventListener('click', () => deleteSelected());
  const pref = (v) => { try { session.setView(v, { delay: 0 }); } catch (e) { showToast(e.message); } };
  ui.allowWarnings.addEventListener('change', () => pref({ allowWarnings: ui.allowWarnings.checked }));
  ui.labelMode.addEventListener('change', () => labelEdit('랙 텍스트', (d) => {
    const height = ui.labelMode.value === 'occupancy-height';
    d.rackLabels.displayMode = height ? 'occupancy' : ui.labelMode.value;
    if (height) d.rackLabels.ratioSource = 'height';
    else delete d.rackLabels.ratioSource;
  }));
  ui.labelLayout.addEventListener('change', () => labelEdit('ZONE·번호 배치', (d) => { d.rackLabels.layoutMode = ui.labelLayout.value; }));
  ui.labelPadding.addEventListener('change', () => labelEdit('랙 번호 형식', (d) => { d.rackLabels.numberPadding = Number(ui.labelPadding.value); }));
  ui.vizMode.addEventListener('change', () => colorEdit('색상 표시 기준', (d) => { d.settings.vizMode = ui.vizMode.value; }));
  ui.heightPolicy.addEventListener('change', () => colorEdit('높이 집계 정책', (d) => { d.settings.heightPolicy = ui.heightPolicy.value; }));
  ui.colorMode.addEventListener('change', () => colorEdit('색상 표시', (d) => setColorMode(d, ui.colorMode.value)));
  ui.applyColorsBtn.addEventListener('click', () => colorEdit('적재율 색상 기준', (d) => applyThresholdColors(d, { low: ui.thrLow.value, high: ui.thrHigh.value, colors: Object.fromEntries(Object.entries(ui.colorInputs).map(([k, i]) => [k, i.value])) })));
  ui.themeBtn.addEventListener('click', () => { if (project()) themeDialog.open(); });
  ui.snapOn.addEventListener('change', () => pref({ snap: ui.snapOn.checked }));
  ui.snapStep.addEventListener('change', () => pref({ precision: { snapStep: Number(ui.snapStep.value) } }));
  ui.keyStep.addEventListener('change', () => {
    const k = Number(ui.keyStep.value);
    pref({ precision: { keyStep: k, fastStep: Math.max(k, project().precision.fastStep) } });
  });
  ui.zoomIn.addEventListener('click', () => { cancelWheel(); commitView(zoomBy(view, 0.8, null, W(), size())); });
  ui.zoomOut.addEventListener('click', () => { cancelWheel(); commitView(zoomBy(view, 1.25, null, W(), size())); });
  ui.fit.addEventListener('click', () => { cancelWheel(); tracker.reset(); commitView(centerView(view, true, W(), size())); });
  ui.zoom50.addEventListener('click', () => { cancelWheel(); commitView({ ...centerView(view, true, W(), size()), zoom: 0.5 }); });
  ui.zoom200.addEventListener('click', () => { cancelWheel(); commitView({ ...centerView(view, true, W(), size()), zoom: 2 }); });
  ui.centerLock.addEventListener('change', () => commitView(ui.centerLock.checked ? { ...view, centerLocked: true, panX: 0, panY: 0 } : { ...view, centerLocked: false }));
  // 기준본 W.fitAll: 모든 랙의 외곽에 맞춰 보기
  ui.wAll.addEventListener('click', () => {
    const box = selectionBox(layout().objects.filter((o) => o.kind === 'rack'));
    if (box) { cancelWheel(); commitView(focusBox(view, box, W(), size())); }
  });
  // 위반 목록 대화상자(기준본 wDialog): 현재 표시 도면을 다시 검사한 결과를 보여 준다.
  const wDialog = document.createElement('dialog');
  wDialog.id = 'wDialog';
  wDialog.innerHTML = '<button id="wClose">닫기 ×</button><h2>배치 위반 목록 · 현재 계산</h2><p>경계 거리: 회전된 실제 외곽 기준. 검토 중 표시는 해결로 처리되지 않습니다.</p><div id="wMainList"></div>';
  document.body.append(wDialog);
  const wList = document.getElementById('wMainList');
  document.getElementById('wClose').onclick = () => wDialog.close();
  const wFocus = (id) => {
    commitSelection(new Set([id]));
    const box = selectionBox(layout().objects.filter((o) => selected.has(o.id)));
    if (box) commitView(focusBox(view, box, W(), size()));
    if (wDialog.open) wDialog.close();
  };
  const wRender = (page = 0) => { wList.innerHTML = violationListHtml(scanLayout(layout(), project()), project(), page); };
  wList.addEventListener('click', (e) => {
    const pg = e.target.closest('[data-cl-page]');
    if (pg) { wRender(Number(pg.dataset.clNext)); return; }
    const f = e.target.closest('[data-w-focus]');
    const tr = e.target.closest('tr[data-w-rack]');
    if (f) wFocus(f.dataset.wFocus);
    else if (tr && !e.target.closest('button,input')) wFocus(tr.dataset.wRack);
  });
  wList.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-w-rack]');
    if (e.key === 'Enter' && tr) { e.preventDefault(); wFocus(tr.dataset.wRack); }
  });
  ui.wViolations.addEventListener('click', () => { wRender(); wDialog.showModal(); });
  ui.focus.addEventListener('click', () => {
    const box = selectionBox(layout().objects.filter((o) => selected.has(o.id)));
    if (box) commitView(focusBox(view, box, W(), size()));
  });

  // ── 휠 감도(F-039) ──
  ui.wheelSelect.value = wheelMode.mode;
  ui.wheelStatus.textContent = WHEEL_STATUS_TEXT[wheelMode.status];
  const setWheelMode = (v) => {
    cancelWheel();
    const r = saveWheelMode(window.localStorage, v);
    wheelMode = { mode: r.mode, status: r.saved ? 'saved' : 'unsaved' };
    ui.wheelSelect.value = r.mode;
    ui.wheelStatus.textContent = WHEEL_STATUS_TEXT[wheelMode.status];
  };
  ui.wheelSelect.addEventListener('change', () => setWheelMode(ui.wheelSelect.value));
  ui.wheelReset.addEventListener('click', () => setWheelMode('low'));

  // ── 왼쪽 정밀 설정·선택·통로·화면(기준본 50 M·80 Q 컨트롤, Phase 9b-2) ──
  ui.snapOn2.addEventListener('change', () => pref({ snap: ui.snapOn2.checked }));
  ui.policy.addEventListener('change', () => pref({ allowWarnings: ui.policy.value === 'warn' }));
  ui.selectRule.addEventListener('change', () => pref({ selectionRule: ui.selectRule.value }));
  ui.decimals.addEventListener('change', () => pref({ precision: { displayDecimals: Number(ui.decimals.value) } }));
  ui.fastStep.addEventListener('change', () => pref({ precision: { fastStep: Math.max(Number(ui.fastStep.value), project().precision.keyStep) } }));
  ui.guides.addEventListener('change', () => pref({ precision: { guides: ui.guides.checked } }));
  ui.guideSnap.addEventListener('change', () => pref({ precision: { guideSnap: ui.guideSnap.checked } }));
  for (const b of ui.nudgeBtns) b.addEventListener('click', (e) => { const [dx, dy] = b.dataset.qNudge.split(',').map(Number); nudge(dx, dy, e.shiftKey); });
  // 기준본 30: 표시 격자·그리드 표시·최소 여유는 실행취소 가능한 명령
  ui.gridStep.addEventListener('change', () => command('표시 격자', (d) => { d.settings.grid = Number(ui.gridStep.value); }));
  ui.gridOn.addEventListener('change', () => command('그리드 표시', (d) => { d.settings.gridOn = ui.gridOn.checked; }));
  // D-054: Excel 자동 배치 기준(autoPlacementRules)을 배치 후에 수정. 랙은 옮기지 않고 검사 기준만 바꾼다.
  const restoreRule = (el) => { const er = effectiveRules(project(), layout(), project().settings.scenario); el.value = er && Number.isFinite(er.values[el.dataset.rule]) ? String(er.values[el.dataset.rule]) : ''; };
  for (const el of ui.ruleInputs) el.addEventListener('change', () => command('자동 배치 기준', (d) => {
    const v = el.value.trim() === '' ? NaN : Number(el.value);
    if (!Number.isFinite(v) || v < 0 || v > 50 || Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-6) throw new Error('자동 배치 기준은 0~50m, 0.001m 단위로 입력하세요.');
    setPlacementRule(d, d.settings.scenario, el.dataset.rule, v); // D-057: 기록이 없으면 Excel 입력값으로 만든 뒤 고친다
  }).then((r) => { if (!r?.ok) restoreRule(el); }));
  ui.minGap.addEventListener('change', () => command('랙 사이 최소 여유', (d) => {
    const v = ui.minGap.value.trim() === '' ? NaN : Number(ui.minGap.value);
    if (!Number.isFinite(v) || v < 0 || v > 20) throw new Error('최소 간격 값이 올바르지 않습니다.');
    d.settings.minGap = v;
  }));
  ui.selectAllBtn.addEventListener('click', () => commitSelection(selectAllRacks(layout())));
  ui.clearSelBtn.addEventListener('click', () => commitSelection(new Set()));
  const loadAisleRule = () => {
    const r = project()?.aisleRules[ui.aisleType.value];
    if (!r) return;
    ui.ruleMin.value = r.minWidth;
    ui.ruleTarget.value = r.targetWidth;
    ui.ruleEnabled.checked = r.enabled;
  };
  ui.aisleType.addEventListener('change', loadAisleRule);
  const aisleDialog = createAisleDialog({ getLayout: () => layout(), getWarnings: () => sceneWarnings, csv });
  ui.validateBtn.addEventListener('click', () => { if (project()) aisleDialog.open(); });
  ui.polygonBtn.addEventListener('click', () => {
    if (historyDate) return showToast('현재 편집으로 돌아오세요.');
    setTool('select');
    polygonPoints = [];
    ui.polygonFinish.disabled = true;
    renderPlan();
    showToast('통로 꼭짓점을 순서대로 클릭한 뒤 다각형 완성을 누르세요. Esc 취소.');
  });
  ui.polygonFinish.addEventListener('click', async () => {
    if (!polygonPoints || polygonPoints.length < 3) return;
    let add;
    try { add = addPolygonAisle(polygonPoints, ui.aisleType.value, { nextId: session.nextId }); } catch (e) { return showToast(e.message); }
    const r = await command('다각형 통로 생성', add.mutate);
    if (!r?.ok) return;
    cancelPolygon();
    commitSelection(new Set([add.id]));
  });
  // 랙 팔레트 끌어놓기: 놓은 점이 중심인 랙을 '추가 랙' 설정으로 추가(도구 클릭 경로 addAt 재사용)
  const RACK_DRAG = 'application/warehouse-rack';
  ui.rackPalette.addEventListener('dragstart', (e) => e.dataTransfer.setData(RACK_DRAG, 'rack'));
  ui.plan.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes(RACK_DRAG)) e.preventDefault(); });
  ui.plan.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.types.includes(RACK_DRAG)) return;
    e.preventDefault();
    if (historyDate) return showToast('현재 편집으로 돌아온 뒤 배치하세요.');
    const p = toWorld(e.clientX, e.clientY);
    addAt('rack', { x: p.x, y: p.y });
  });
  ui.ruleApply.addEventListener('click', () => command('통로 유형 기준 변경', (d, l) => applyAisleRule(d, l, ui.aisleType.value, { min: ui.ruleMin.value, target: ui.ruleTarget.value, enabled: ui.ruleEnabled.checked })));
  // 기준본 M.center(false/true)
  ui.centerBtn.addEventListener('click', () => { cancelWheel(); commitView({ ...view, centerLocked: true, panX: 0, panY: 0 }); });
  ui.resetZoomBtn.addEventListener('click', () => { cancelWheel(); tracker.reset(); commitView(centerView(view, true, W(), size())); });
  ui.excelFile.addEventListener('change', () => {
    const f = ui.excelFile.files[0];
    ui.excelFile.value = '';
    if (!f) return;
    if (historyDate) return showToast('현재 편집으로 돌아온 뒤 가져오세요.');
    excelDialog.openWithFile(f);
  });
  // 기준본 75 replaceProject: 빈 프로젝트·샘플로 전체 교체(현재 프로젝트 백업·실행취소 가능)
  const replaceWith = async (sample) => {
    const label = sample ? '샘플 프로젝트' : '빈 창고 프로젝트';
    if (!(await storageDialogs.confirmReplace(label))) return;
    await storageDialogs.install(createProject({ sample, nextId: ids, today }), label);
  };
  ui.newBlank.addEventListener('click', () => replaceWith(false));
  ui.loadSample.addEventListener('click', () => replaceWith(true));

  // ── 휠 확대: 휠이 시작된 영역이 도면일 때만(패널 스크롤이 도면 확대로 이어지지 않게) ──
  const wheelArea = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (document.querySelector('dialog[open]') || t?.closest('dialog')) return 'MODAL';
    if (t?.closest('#plan')) return 'CANVAS';
    if (t?.closest('.side.left')) return 'LEFT_PANEL';
    if (t?.closest('.side.right')) return 'RIGHT_PANEL';
    return 'OTHER';
  };
  let wheelAllowed = false;
  document.addEventListener('wheel', (e) => {
    wheelAllowed = tracker.observe(wheelArea(e), performance.now(), e.momentum === true);
    if (!wheelAllowed) cancelWheel();
  }, { capture: true, passive: true });
  const flushWheel = () => {
    const delta = wheel.pending;
    wheel.frame = 0;
    wheel.pending = 0;
    if (!project() || !view) return;
    const f = wheelFactor(delta, wheelMode.mode);
    if (f !== 1) commitView(zoomBy(view, f, toWorld(wheel.clientX, wheel.clientY), W(), size()));
  };
  ui.plan.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!wheelAllowed || gesture) return;
    const style = getComputedStyle(ui.plan);
    const delta = wheelPixels(e, { lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 16, pageHeight: ui.plan.getBoundingClientRect().height });
    if (!delta) return;
    wheel.pending += delta;
    wheel.clientX = e.clientX;
    wheel.clientY = e.clientY;
    if (!wheel.frame) wheel.frame = requestAnimationFrame(flushWheel);
  }, { passive: false });

  // ── 포인터: 선택·영역 선택·팬·두 손가락 확대 ──
  const capture = (e) => { try { ui.plan.setPointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ } };
  let moveEvent = null, moveFrame = 0;
  function abortGesture() {
    const g = gesture;
    if (!g) return;
    moveEvent = null;
    gesture = null;
    if (g.kind === 'marquee') {
      marquee = null;
      selected = new Set(g.previous);
      renderPlan();
    } else if (g.kind === 'pan' || g.kind === 'pinch') {
      view = g.viewport;
      applyCamera();
    } else if (g.kind === 'move' || g.kind === 'resize') {
      preview = null; // 기준본 Esc: 기록 없이 이동·크기 조절 전으로
      renderPlan();
    }
  }
  ui.plan.addEventListener('pointerdown', (e) => {
    // 도면을 누르면 입력 칸 포커스를 풀어 방향키·Delete 단축키가 도면에 적용되게 한다(입력 칸 안에서는 단축키 무시).
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    tracker.reset();
    cancelWheel();
    if (!project()) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        e.preventDefault();
        abortGesture();
        const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid, zoom: view.zoom, viewport: view, view: viewBox(view, W(), size()), matrix: ui.plan.getScreenCTM().inverse(), anchor: toWorld(mid.x, mid.y) };
        capture(e);
        return;
      }
      if (touches.size > 2) return;
    }
    if (e.button !== 0 || gesture) return;
    e.preventDefault();
    if (polygonPoints) {
      const p = toWorld(e.clientX, e.clientY);
      if (polygonPoints.length >= 60) showToast('다각형 꼭짓점은 최대 60개입니다.');
      else {
        polygonPoints = [...polygonPoints, [snapped(project(), p.x), snapped(project(), p.y)]];
        ui.polygonFinish.disabled = polygonPoints.length < 3;
      }
      renderPlan();
      return;
    }
    if (tool === 'measure') {
      const p = toWorld(e.clientX, e.clientY);
      measurePts = measurePts.length === 1 ? [...measurePts, { x: p.x, y: p.y }] : [{ x: p.x, y: p.y }];
      if (measurePts.length === 2) {
        const [a, b] = measurePts, dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        ui.measureResult.textContent = `두 점 거리 ${fmt(Math.hypot(dx, dy), 3)} m · ΔX ${fmt(dx, 3)} m · ΔY ${fmt(dy, 3)} m`;
      }
      renderPlan();
      return;
    }
    if (tool === 'calibrate') {
      const p = toWorld(e.clientX, e.clientY);
      calibrationClick(p);
      return;
    }
    if (tool !== 'select' && tool !== 'pan') {
      const p = toWorld(e.clientX, e.clientY);
      addAt(tool, { x: p.x, y: p.y });
      return;
    }
    capture(e);
    if (tool === 'pan') {
      gesture = { kind: 'pan', pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, viewport: view, matrix: ui.plan.getScreenCTM().inverse() };
      return;
    }
    const handle = e.target.closest?.('[data-resize]');
    if (handle) {
      if (isLocked(project())) {
        showToast('BEFORE 잠금 · 크기 변경 불가');
        return;
      }
      const o = layout().objects.find((x) => x.id === handle.dataset.object);
      if (o) {
        const p = toWorld(e.clientX, e.clientY);
        const [sx, sy] = HANDLE_DIRECTIONS[handle.dataset.resize];
        gesture = { kind: 'resize', pointer: e.pointerId, start: { x: p.x, y: p.y }, sx, sy, object: structuredClone(o), changes: null, moved: false };
        return;
      }
    }
    const hit = e.target.closest?.('[data-id]')?.dataset.id;
    if (hit) {
      const toggle = e.ctrlKey || e.metaKey || multiTouch, add = e.shiftKey;
      commitSelection(clickSelect(selected, hit, { toggle, add }));
      if (toggle || add || isLocked(project())) return;
      const p = toWorld(e.clientX, e.clientY);
      const originals = layout().objects.filter((o) => selected.has(o.id));
      gesture = { kind: 'move', pointer: e.pointerId, start: { x: p.x, y: p.y }, originals, dx: 0, dy: 0, moved: false };
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    const add = e.ctrlKey || e.metaKey || e.shiftKey;
    gesture = { kind: 'marquee', pointer: e.pointerId, start: { x: p.x, y: p.y }, previous: [...selected], add };
    marquee = { a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y } };
    if (!add) selected = new Set();
    renderPlan();
  });
  // 포인터 이동은 프레임당 한 번만 처리한다(마지막 위치 기준). 포인터 종료·취소 때는 먼저 동기 반영한다.
  const flushMove = () => {
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    const e = moveEvent;
    moveEvent = null;
    if (e && gesture) onPointerMove(e);
  };
  ui.plan.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    e.preventDefault();
    if (moveEvent && moveEvent.pointerId !== e.pointerId) flushMove();
    moveEvent = e;
    if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
  });
  function onPointerMove(e) {
    const g = gesture;
    if (!g) return;
    e.preventDefault();
    if (g.kind === 'pinch') {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = deltaWorld(g.matrix, mid.x - g.mid.x, mid.y - g.mid.y);
      view = pinchFrom(g, Math.hypot(a.x - b.x, a.y - b.y), d.x, d.y, W());
      applyCamera();
      return;
    }
    if (g.pointer !== e.pointerId) return;
    if (g.kind === 'pan') {
      const d = deltaWorld(g.matrix, e.clientX - g.start.x, e.clientY - g.start.y);
      view = panFrom(g.viewport, d.x, d.y);
      applyCamera();
      return;
    }
    if (g.kind === 'resize') {
      const p = toWorld(e.clientX, e.clientY);
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 2e-3) return;
      g.moved = true;
      const pr = project(), l = layout();
      g.changes = resized(pr, g.object, g.sx, g.sy, p.x - g.start.x, p.y - g.start.y);
      const next = { ...l, objects: l.objects.map((o) => (o.id === g.object.id ? { ...o, ...g.changes } : o)) };
      const invalid = newSpatialWarnings(pr, l, next, new Set([g.object.id]));
      preview = { layout: next, guides: [], invalidText: invalid[0]?.text ?? '' };
      renderPlan();
      ui.selStatus.textContent = `크기 조절 · 폭 ${fmt(g.changes.width, 3)}m × 깊이 ${fmt(g.changes.depth, 3)}m`;
      return;
    }
    if (g.kind === 'move') {
      const p = toWorld(e.clientX, e.clientY);
      const pr = project(), l = layout();
      let { dx, dy } = dragDelta(pr, g.originals[0], g.start, p);
      const a = alignmentGuides(pr, l, g.originals, dx, dy, pixelsPerMeter(view, l.warehouse, size()));
      ({ dx, dy } = a);
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < EPS) return;
      g.moved = true;
      g.dx = dx;
      g.dy = dy;
      preview = { layout: movedLayout(l, g.originals.map((o) => o.id), dx, dy), guides: a.guides };
      renderPlan();
      ui.selStatus.textContent = `${g.originals.length}개 객체 · ΔX ${fmt(dx)}m / ΔY ${fmt(dy)}m`;
      return;
    }
    if (g.kind === 'marquee') {
      const p = toWorld(e.clientX, e.clientY);
      marquee = { a: g.start, b: { x: p.x, y: p.y } };
      selected = marqueeSelect(layout().objects, g.start, marquee.b, { rule: project().editing.selectionRule, previous: g.previous, add: g.add });
      renderPlan();
    }
  }
  const finish = (e, cancel) => {
    flushMove();
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    const g = gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches.size) return; // 손가락이 남아 있으면 이어서
      gesture = null;
      if (cancel) abortGesture();
      else commitView(view, 0);
      return;
    }
    if (g.pointer !== e.pointerId) return;
    if (g.kind === 'resize') {
      gesture = null;
      if (cancel || !g.moved || !g.changes) {
        preview = null;
        renderPlan(true);
        return;
      }
      const changes = { width: g.changes.width, depth: g.changes.depth, height: g.object.height ?? null, x: g.changes.x, y: g.changes.y };
      command(RESIZE_COMMAND, applyResize(g.object.id, changes), RESIZE_COMMAND).finally(() => {
        preview = null;
        renderPlan(true);
      });
      return;
    }
    if (g.kind === 'move') {
      gesture = null;
      const ids = g.originals.map((o) => o.id);
      if (!g.moved) return; // 움직이지 않았으면 기록 없음(기준본 M.finish)
      // pointercancel은 기준본처럼 '사용자 취소' 실패 기록을 남긴다(Esc 취소는 기록 없음).
      run(g.originals.length > 1 ? '그룹 이동' : '객체 이동', (p, ctx) => applyMove(p, ids, g.dx, g.dy, { cancel, ...ctx })).finally(() => {
        preview = null;
        renderPlan(true);
      });
      return;
    }
    if (cancel) return abortGesture();
    gesture = null;
    if (g.kind === 'pan') commitView(view, 0);
    else if (g.kind === 'marquee') {
      marquee = null;
      commitSelection(selected);
    }
  };
  ui.plan.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-resize]') || gesture || tool !== 'select' || !project()) return;
    // 포인터 캡처 때문에 대상이 SVG 전체일 수 있어 기준본처럼 점이 들어간 랙(회전 반영)을 찾는다.
    const id = e.target.closest('[data-id]')?.dataset.id, p = toWorld(e.clientX, e.clientY);
    const inside = (o) => {
      const a = (o.rotation * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a), dx = p.x - o.x - o.width / 2, dy = p.y - o.y - o.depth / 2;
      return Math.abs(dx * c + dy * si) <= o.width / 2 && Math.abs(-dx * si + dy * c) <= o.depth / 2;
    };
    const o = layout().objects.slice().reverse().find((x) => x.kind === 'rack' && (id ? x.id === id : inside(x)));
    if (!o) return;
    e.preventDefault();
    commitSelection(new Set([o.id]));
    rackDetail.open(o.id);
  });
  ui.plan.addEventListener('pointerup', (e) => finish(e, false));
  ui.plan.addEventListener('pointercancel', (e) => finish(e, true));
  document.addEventListener('keydown', (e) => {
    cancelWheel();
    if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveByKey(); return; } // 기준본: 입력칸·대화상자 여부와 무관
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || !project()) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (dir && !mod && !e.altKey) {
      if (!selected.size || tool !== 'select') return;
      e.preventDefault();
      nudge(dir[0], dir[1], e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      abortGesture();
      touches.clear();
      setTool('select');
      commitSelection(new Set());
    } else if (mod && k === 'a') {
      e.preventDefault();
      commitSelection(selectAllRacks(layout()));
    } else if (mod && k === 'z') {
      e.preventDefault();
      if (!historyDate) guard(() => (e.shiftKey ? session.redo() : session.undo()));
    } else if (mod && k === 'y') {
      e.preventDefault();
      if (!historyDate) guard(() => session.redo());
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (k === 'r' && !mod) {
      rotateSelected();
    } else if (mod && k === 'c') {
      e.preventDefault();
      clipboard = structuredClone(selectedObjects());
      showToast(`${clipboard.length}개 객체 복사`);
    } else if (mod && k === 'v') {
      e.preventDefault();
      duplicate(clipboard);
    }
  });
  new ResizeObserver(() => applyCamera()).observe(ui.canvasWrap);

  window.addEventListener('storage', (event) => session.handleStorageEvent(event));
  window.addEventListener('pagehide', () => { session.flushView(); });
  window.addEventListener('beforeunload', (event) => {
    session.flushView();
    const s = session.state.status;
    if (s === 'unsaved' || s === 'error' || s === 'saving') event.preventDefault();
  });

  setTool('select');
  await session.init();
  window.__warehouseSession = session; // E2E 검사용 읽기 진입점
  window.__excelDialog = excelDialog;
  window.__warehouseView = { get viewport() { return view; }, get selected() { return [...selected]; }, get wheelMode() { return wheelMode.mode; } };
}

start().catch((e) => {
  document.getElementById('app').textContent = `시작 실패: ${e.message}`;
});
