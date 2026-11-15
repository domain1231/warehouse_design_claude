// 선택 객체 속성 편집 칸(기준본 20 renderInspector의 입력 부분). 여러 개를 고르면 첫 객체를 편집한다.
// 값 변환·적용은 commands.fieldValue / setField가 하고, 이 파일은 칸을 그리고 변경을 알린다.
import { esc } from '../cad/scene.js';
import { OBJECT_TYPES, AISLE_TYPES } from '../core/project.js';
import { ratio } from '../warehouse/constraints.js';
import { loadState } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';

const RACK_TYPES = ['경량랙', '중량랙', '팔레트랙', '일반 선반', '사용자 지정 랙'];
const SWINGS = [['in-right', '위쪽 좌경첩 → 아래'], ['in-left', '위쪽 우경첩 → 아래'], ['out-right', '아래 좌경첩 → 위'], ['out-left', '아래 우경첩 → 위']];
const PROVENANCE = ['사용자 입력', '사용자 실측', '도면 참고 샘플', '자동 배치 · 위치 실측 미확인'];
export const STATE_NAMES = Object.freeze({ empty: '빈 랙', low: '여유', mid: '보통', high: '적재 주의', over: '허용량 초과', unknown: '정보 없음' });
/** 이 칸들은 기하를 바꾸지 않는다(기준본 commit spatial:false 목록). */
export const NON_SPATIAL_FIELDS = new Set(['capacity', 'quantity', 'unit', 'note', 'code', 'block', 'type', 'provenance']);

/**
 * @param {HTMLElement} root
 * @param {{ objects: object[], settings: object, locked: boolean, onChange: (id: string, field: string, raw: string, isNumber: boolean) => void, onLock?: (id: string, value: boolean) => void }} opt
 */
export function renderInspector(root, { objects, settings, locked, onChange, onLock }) {
  if (!objects.length) {
    root.innerHTML = '';
    return;
  }
  // 기준본은 랙을 2개 이상 고르면 그룹 편집 패널을 보인다(다음 단계). 그 전까지는 칸을 보이지 않는다.
  if (objects.filter((o) => o.kind === 'rack').length > 1) {
    root.innerHTML = '<p class="muted">랙 여러 개 선택 · 이동·회전·복제·삭제를 함께 적용합니다. 그룹 정렬·간격 편집은 다음 단계입니다.</p>';
    return;
  }
  const o = objects[0], ro = locked ? 'disabled' : '';
  const inp = (k, text, type = 'text', extra = '') => `<label>${text}<input data-field="${k}" type="${type}" value="${esc(o[k] ?? '')}" ${ro} ${extra}></label>`;
  const select = (k, text, options) => `<label class="full">${text}<select data-field="${k}" ${ro}>${options.map(([v, t]) => `<option value="${esc(v)}" ${o[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const pairs = (list) => list.map((v) => [v, v]);
  let s = `<p><span class="badge">${OBJECT_TYPES[o.kind]}</span> <span class="muted">${objects.length > 1 ? '첫 객체를 수정합니다' : ''}</span></p><p class="muted" style="overflow-wrap:anywhere">ID ${esc(o.id)}</p>`;
  if (locked) s += '<p class="warnbox">BEFORE 원본 잠금 상태입니다. 잠금 해제 후 수정하세요.</p>';
  if (o.kind === 'rack') {
    const r = ratio(o);
    s += `<p class="info-line" data-testid="rack-load">${r === null ? '계산 불가' : fmt(r, 1) + '%'} · ${STATE_NAMES[loadState(o, settings)]}</p>`;
  }
  s += '<div class="fields">';
  s += inp('code', '번호 / 이름') + inp('block', '블록');
  if (o.kind === 'rack') s += select('type', '랙 종류', pairs(RACK_TYPES.includes(o.type) ? RACK_TYPES : [o.type, ...RACK_TYPES]));
  s += inp('x', 'X (m)', 'number', 'step="0.001"') + inp('y', 'Y (m)', 'number', 'step="0.001"');
  s += inp('width', '폭 (m)', 'number', 'min="0.01" step="0.001"') + inp('depth', '깊이 (m)', 'number', 'min="0.01" step="0.001"');
  s += inp('height', '높이 (m)', 'number', 'min="0.01" step="0.001"') + inp('rotation', '회전 (°)', 'number', 'step="1"');
  if (o.kind === 'rack') s += inp('capacity', '최대 수량', 'number', 'min="0" step="any" placeholder="미설정"') + inp('quantity', '현재 수량', 'number', 'min="0" step="any" placeholder="미입력"') + inp('unit', '적재 단위');
  if (o.kind === 'aisle') s += inp('minWidth', '최소 확보 폭 (m)', 'number', 'min="0" step="0.1"') + inp('targetWidth', '목표 폭 (m)', 'number', 'min="0" step="0.1"') + select('aisleType', '통로 종류', pairs(AISLE_TYPES));
  if (o.kind === 'door') s += select('swing', '열림 방향', SWINGS) + '<p class="muted full">폭×깊이 전체를 문 개방 안전 구역으로 검사합니다.</p>';
  s += select('provenance', '치수·위치 근거', pairs(PROVENANCE.includes(o.provenance) ? PROVENANCE : [o.provenance, ...PROVENANCE]));
  s += `<label class="full">비고<textarea data-field="note" rows="2" ${ro}>${esc(o.note)}</textarea></label></div>`;
  if (o.kind === 'rack' && o.placementMeta) s += `<label class="check"><input type="checkbox" data-lock data-testid="position-lock" ${o.placementMeta.positionLocked ? 'checked' : ''} ${ro}> 위치 잠금(자동 배치·이동에서 보호)</label>`;
  s += '<p class="muted">X → 오른쪽 / Y ↓ 아래 · 중심 회전 · 좌표 직접 입력은 스냅 제외(0.001m 단위)</p>';
  root.innerHTML = s;
  root.querySelector('[data-lock]')?.addEventListener('change', (e) => onLock?.(o.id, e.target.checked));
  root.querySelectorAll('[data-field]').forEach((el) => {
    el.addEventListener('change', () => onChange(o.id, el.dataset.field, el.value, el.type === 'number'));
  });
}
