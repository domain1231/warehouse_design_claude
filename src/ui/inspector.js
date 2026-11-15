// 선택 정보 패널(기준본 20 renderInspector + 40·50·60·65·70·75·80·90 래퍼가 만든 #inspector 전체, D-032).
// 값 변환·적용은 main.js가 넘기는 on.* 콜백(commands.*)이 하고, 이 파일은 DOM을 그리고 이벤트를 연결한다.
import { esc, loadState, OBJECT_COLORS, nearest } from '../cad/scene.js';
import { rackLabelParts } from '../cad/labels.js';
import { OBJECT_TYPES, AISLE_TYPES } from '../core/project.js';
import { ratio, excessText } from '../warehouse/constraints.js';
import { aisleClearance } from '../geometry/clearance.js';
import { groupStats, GROUP_BUTTONS, recentCommands } from '../warehouse/group-panel.js';
import { dimsText, placementLines, aisleInfoLines, scopeText } from '../warehouse/inspector-info.js';
import { specWarning } from '../warehouse/rackinfo.js';
import { formatNumber as fmt } from '../core/format.js';

const RACK_TYPES = ['경량랙', '중량랙', '팔레트랙', '일반 선반', '사용자 지정 랙'];
const SWINGS = [['in-right', '위쪽 좌경첩 → 아래'], ['in-left', '위쪽 우경첩 → 아래'], ['out-right', '아래 좌경첩 → 위'], ['out-left', '아래 우경첩 → 위']];
const PROVENANCE = ['사용자 입력', '사용자 실측', '도면 참고 샘플', '자동 배치 · 위치 실측 미확인'];
const MM_TITLE = '0.001m 단위 입력 · 직접 좌표는 스냅/가이드로 변경하지 않습니다.';
export const STATE_NAMES = Object.freeze({ empty: '빈 랙', low: '여유', mid: '보통', high: '적재 주의', over: '허용량 초과', unknown: '정보 없음' });
/** 이 칸들은 기하를 바꾸지 않는다(기준본 commit spatial:false 목록). */
export const NON_SPATIAL_FIELDS = new Set(['capacity', 'quantity', 'unit', 'note', 'code', 'block', 'type', 'provenance']);

const wBox = (o, row, reviewing, history) => {
  const [a, b, c] = placementLines(o, row, reviewing, excessText);
  return `<div class="w-box"><h4>위치·배치 검사</h4><p>${esc(a)}</p><p>${esc(b)}</p><p>${esc(c)}</p><label class="check"><input type="checkbox" id="wPositionLock" data-testid="position-lock" ${o.placementMeta?.positionLocked ? 'checked' : ''} ${history ? 'disabled' : ''}>랙 위치 잠금</label><button type="button" id="wReview" ${history ? 'disabled' : ''}>${reviewing ? '검토 중 표시 해제' : '검토 중으로 표시'}</button></div>`;
};

function groupPanel(racks, c) {
  const s = groupStats(racks, c.warnings, c.selected), dis = c.history ? 'disabled' : '';
  const hist = recentCommands(c.project.commandHistory).map((h) => `<div class="m-command">${esc(h.type)} · ${h.targetIds.length}개 · ${h.success ? '성공' : '취소'}<br>${esc(h.time)}${h.reason ? '<br>' + esc(h.reason) : ''}</div>`).join('');
  return `<h3>다중 랙 편집 패널</h3><div class="info">선택 ${s.count}개 · 외곽 ${fmt(s.width)} × ${fmt(s.depth)}m<br>랙 면적 합계 ${fmt(s.area, 3)}㎡<br>공간 경고 ${s.spaceWarnings}건 / 통로 위반 ${s.aisleWarnings}건<br>${s.units.map((u) => `최대 ${fmt(u.capacity)} ${esc(u.unit)} (${u.known}/${u.total}랙 확인)`).join('<br>')}</div><p class="m-group-list">${racks.map((o) => esc(o.code)).join(', ')}</p><div class="m-group-grid">${GROUP_BUTTONS.map(([k, t]) => `<button data-group-action="${k}" ${dis}>${t}</button>`).join('')}<button id="mGroupDuplicate" ${dis}>그룹 복제</button><button id="mGroupDelete" ${dis}>그룹 삭제</button><button id="mGroupUndo">실행 취소</button><button id="mGroupCheck">공간 검토</button><button id="mGroupCompare">Before/After 비교</button><button id="mGroupExport">현재 좌표 CSV</button></div><p class="muted">정렬·간격은 회전 외접 경계 기준이며 적용 전 미리보기합니다. Ctrl+클릭 토글, Shift+클릭 추가. 로케이션·선반·자재 정보는 변경하지 않습니다.</p><details><summary>최근 편집 명령</summary>${hist}</details>`;
}

function objectPanel(o, n, c) {
  const { project, layout, history } = c, ro = history || c.locked ? 'disabled' : '', single = n === 1;
  const inp = (k, text, type = 'text', extra = '') => `<label>${text}<input data-field="${k}" type="${type}" value="${esc(o[k] ?? '')}" ${ro} ${extra}></label>`;
  const mm = (k, text, extra) => inp(k, text, 'number', single ? `${extra} inputmode="decimal" title="${MM_TITLE}"`.replace('step="0.01"', 'step=".001"') : extra);
  const sel = (k, text, list, cur = o[k]) => `<label class="full">${text}<select data-field="${k}" ${ro}>${list.map(([v, t]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const pairs = (list) => list.map((v) => [v, v]);
  let s = `<div><span class="badge">${OBJECT_TYPES[o.kind]}</span> <span class="muted">${n > 1 ? '첫 객체를 수정합니다' : ''}</span><p class="muted" style="overflow-wrap:anywhere">ID ${esc(o.id)}</p><label class="check"><input id="multiSelect" type="checkbox" ${c.multiTouch ? 'checked' : ''}>다중 선택 유지 (터치용)</label>`;
  if (o.kind === 'rack') {
    const r = ratio(o);
    s += `<div class="info"><span class="progress" data-testid="rack-load">${r === null ? '계산 불가' : fmt(r, 1) + '%'}</span> · ${STATE_NAMES[loadState(o, project.settings)]}<br>${history ? (o.hasRecord ? '출처: ' + esc(o.source) : '해당 날짜 기록 없음') : '최대/현재 수량을 입력하세요.'}</div>`;
  }
  s += `<div class="fields">${inp('code', '번호 / 이름')}${inp('block', '블록')}`;
  if (o.kind === 'rack') s += sel('type', '랙 종류', pairs(RACK_TYPES.includes(o.type) ? RACK_TYPES : [o.type, ...RACK_TYPES]));
  s += mm('x', 'X (m)', 'step="0.01"') + mm('y', 'Y (m)', 'step="0.01"') + mm('width', '폭 (m)', 'min="0.01" step="0.01"') + mm('depth', '깊이 (m)', 'min="0.01" step="0.01"');
  s += inp('height', '높이 (m)', 'number', 'min="0.01" step="0.01"') + inp('rotation', '회전 (°)', 'number', 'step="1"');
  if (o.kind === 'rack') s += inp('capacity', '최대 수량', 'number', 'min="0" step="any" placeholder="미설정"') + inp('quantity', '현재 수량', 'number', 'min="0" step="any" placeholder="미입력"') + inp('unit', '적재 단위');
  if (o.kind === 'aisle') s += inp('minWidth', '최소 확보 폭 (m)', 'number', 'min="0" step="0.1"') + inp('targetWidth', '목표 폭 (m)', 'number', 'min="0" step="0.1"') + sel('aisleType', '통로 종류', pairs(AISLE_TYPES));
  if (o.kind === 'door') s += sel('swing', '열림 방향', SWINGS) + '<p class="note full">폭×깊이 전체를 문 개방 안전 구역으로 검사합니다.</p>';
  s += sel('provenance', '치수·위치 근거', pairs(PROVENANCE.includes(o.provenance) ? PROVENANCE : [o.provenance, ...PROVENANCE]));
  s += `<label class="full">비고<textarea data-field="note" rows="2" ${ro}>${esc(o.note)}</textarea></label></div></div>`;
  s += `<div>${c.selWarnings.length ? '<div class="warnbox" data-testid="selection-warnings">' + c.selWarnings.map((w) => esc(w.text)).join('<br>') + '</div>' : '<div class="info" data-testid="selection-warnings">선택 객체에 공간 경고가 없습니다.</div>'}<p class="muted">X → 오른쪽 / Y ↓ 아래<br>중심 회전 · 정확한 좌표 입력은 스냅 제외</p></div>`;
  if (o.kind === 'aisle') {
    const a = aisleClearance(o, layout), dh = history ? 'disabled' : '';
    s += `<div><h3>유효 통로 폭</h3><div class="info">${aisleInfoLines(a).join('<br>')}</div><label>폭을 측정할 로컬 축<select id="mAisleAxis" ${dh}><option value="auto">짧은 변 기준 자동</option><option value="x">로컬 X 방향 폭</option><option value="y">로컬 Y 방향 폭</option></select></label><label class="check"><input id="mAisleEnabled" type="checkbox" ${a.enabled ? 'checked' : ''} ${dh}>이 통로 경고 사용</label><label>검사할 랙 번호 (비우면 전체)<input id="mAisleScope" value="${esc(scopeText(o, layout.objects))}" ${dh}></label><label>연결할 출입문<select id="mLinkedDoor" ${dh}><option value="">미지정 / 연결성 미검증</option>${layout.objects.filter((d) => d.kind === 'door').map((d) => `<option value="${esc(d.id)}">${esc(d.code)}</option>`).join('')}</select></label><p class="note">단면별 최대 연속 여유 폭의 최솟값입니다. 전체 경로 연결을 증명하지 않습니다. 회전 시 로컬 단면 축도 함께 회전합니다.</p></div>`;
  }
  if (single) {
    const k = o.resizeConstraints, rd = ro;
    s += `<section class="s-spec" id="sSpec"><h4>설계 치수 · 폭 / 깊이 / 높이</h4><div>${esc(dimsText({ width: o.width, depth: o.depth, height: o.height ?? null }))}</div>`;
    if (o.kind === 'rack') {
      s += `<p class="s-mini">원본: ${esc(dimsText(o.originalSpec))}<br>${esc(o.originalSpec?.source ?? '미확인')} · 기준일 ${esc(o.originalSpec?.asOf || '미확인')}</p>${o.specificationChanged ? `<p class="s-diff">${esc(specWarning(o))}</p>` : ''}<p class="s-mini">실제 설비 변경: ${o.physicalConfirmation ? '사용자 확인 ' + esc(o.physicalConfirmation.time) : '미확인'}</p><button id="sOpenInfo" data-testid="open-detail">선반별 자재 상세</button> <button id="sPhysical" ${rd}>실제 설비 변경 확인 기록</button>`;
    }
    s += `<div class="s-controls">${[['minWidth', '최소 폭 m'], ['minDepth', '최소 깊이 m'], ['maxWidth', '최대 폭 m'], ['maxDepth', '최대 깊이 m']].map(([key, t]) => `<label>${t}<input data-limit="${key}" type="number" min="0.01" step="0.01" value="${k[key]}" ${rd}></label>`).join('')}</div><label class="check"><input id="sAspect" type="checkbox" ${k.aspectLocked ? 'checked' : ''} ${rd}>폭·깊이 비율 잠금</label><p class="s-mini">폭·깊이: 도면의 8개 핸들 또는 위 숫자 입력. 높이: 위 숫자 입력. 다각형은 외접 상자 크기를 조절하며 꼭짓점의 상대 좌표를 유지합니다. 제한값은 제조사 안전 규격이 아닙니다.</p>`;
    const hs = project.specificationHistory.filter((h) => h.rackId === o.id && h.scenario === project.settings.scenario).slice(-10).reverse();
    if (hs.length) s += `<details id="sSpecHistory"><summary>규격 변경 이력 · 최근 ${hs.length}건</summary>${hs.map((h) => `<p class="s-mini">${esc(h.time)}<br>${h.type === 'physical-confirmed' ? '실제 설비 변경 사용자 확인' : '설계만 변경'} · ${[h.before?.width, h.before?.depth, h.before?.height].map((v) => (v === null || v === undefined ? '미확인' : fmt(v, 3))).join(' × ')} → ${[h.after?.width, h.after?.depth, h.after?.height].map((v) => (v === null || v === undefined ? '미확인' : fmt(v, 3))).join(' × ')}m</p>`).join('')}</details>`;
    s += '</section>';
    const color = project.theme.objectColors[project.settings.scenario][o.id] || OBJECT_COLORS[o.kind] || project.settings.colors.unknown;
    s += `<section class="s-spec"><h4>이 객체의 표시 색상</h4><label>사용자 지정색<input id="vObjectColor" data-testid="object-color" type="color" value="${esc(color)}"></label><button id="vObjectColorApply" data-testid="object-color-apply">지정색 적용</button> <button id="vObjectColorClear" data-testid="object-color-clear">지정색 해제</button><p class="muted">현재 배치의 색상 설정만 변경합니다. 선택은 테두리, 충돌은 경고 테두리·아이콘으로 유지됩니다.</p></section>`;
    const d = project.precision.displayDecimals, near = nearest(layout, c.selected, 1)[0];
    s += `<section class="q-measure"><h4>정밀 좌표 · 표시 ${d}자리</h4><div id="qCoordinateReadout">X ${fmt(o.x, d)} / Y ${fmt(o.y, d)}m<br>원점: 창고 좌상단 · 직접 입력은 스냅 제외</div><div id="qDistanceReadout">${near ? '외곽 간격 ' + fmt(near.distance, 3) + 'm · ' + esc(near.target.code) : '인접 객체 없음'}<br>회전 후 실제 다각형 외곽 기준</div>`;
    if (o.kind === 'rack') {
      const z = rackLabelParts(o, project, project.settings.scenario);
      s += `<h4>ZONE 표시 이름</h4><div>원본 ZONE ${esc(z.rawZone)} · 랙 ${esc(z.number)}<br>전체 랙 로케이션 ${esc(z.location)}</div><label>현재 배치의 표시 이름<input id="qZoneName" data-testid="zone-name" maxlength="80" value="${esc(z.zone)}"></label><button id="qZoneApply" data-testid="zone-apply">ZONE 이름 적용</button> <button id="qZoneReset" data-testid="zone-reset">원본 이름 표시</button><p class="muted">같은 배치·건물·층의 동일 ZONE에 적용합니다. Excel 식별자·로케이션은 변경하지 않습니다.</p>`;
    }
    s += '</section>';
  }
  return s;
}

/**
 * @param {HTMLElement} root #inspector
 * @param {{ objects: object[], layout: object, project: object, selected: Set<string>, history: boolean, locked: boolean, multiTouch: boolean,
 *   warnings: {text: string, key: string, ids: string[]}[], scan: object|null, on: Record<string, Function> }} c
 * on: change(id, field, raw, isNumber) limit(id, key, raw) aspect(id, v) lock(id, v) review(id, on) zone(name|null) color(hex|null) openInfo(id) physical(id)
 *     aisle(id, key, raw) multi(v) group(action) duplicate() remove() undo() check() compare() exportCsv(racks)
 */
export function renderInspector(root, c) {
  const { objects, on } = c;
  if (!objects.length) {
    root.innerHTML = '<div class="empty">도면에서 객체를 선택하세요.<br>좌표는 회전 전 좌상단 기준입니다.</div>';
    return;
  }
  c.selWarnings = c.warnings.filter((w) => w.ids.some((id) => c.selected.has(id)));
  const racks = objects.filter((o) => o.kind === 'rack');
  const o = objects[0];
  let s = racks.length > 1 ? groupPanel(racks, c) : objectPanel(o, objects.length, c);
  const first = racks[0], row = first && c.scan?.rows.find((r) => r.id === first.id);
  const reviewing = first && c.project.autoPlacement.reviewNotes[c.project.settings.scenario][first.id] === 'review';
  if (first && row) s += wBox(first, row, reviewing, c.history);
  root.innerHTML = s;

  const $ = (id) => root.querySelector('#' + id);
  const click = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  const change = (id, fn) => { const e = $(id); if (e) e.onchange = fn; };
  change('multiSelect', (e) => on.multi(e.target.checked));
  root.querySelectorAll('[data-field]').forEach((el) => el.addEventListener('change', () => on.change(o.id, el.dataset.field, el.value, el.type === 'number')));
  root.querySelectorAll('[data-limit]').forEach((el) => el.addEventListener('change', () => on.limit(o.id, el.dataset.limit, el.value)));
  change('sAspect', (e) => on.aspect(o.id, e.target.checked));
  click('sOpenInfo', () => on.openInfo(o.id));
  click('sPhysical', () => on.physical(o.id));
  click('vObjectColorApply', () => on.color($('vObjectColor').value));
  click('vObjectColorClear', () => on.color(null));
  click('qZoneApply', () => on.zone($('qZoneName').value.trim()));
  click('qZoneReset', () => on.zone(null));
  if (first) {
    change('wPositionLock', (e) => on.lock(first.id, e.target.checked));
    click('wReview', () => on.review(first.id, !reviewing));
  }
  if ($('mAisleAxis')) {
    $('mAisleAxis').value = o.clearanceAxis || 'auto';
    $('mLinkedDoor').value = o.linkedDoorId || '';
    $('mAisleAxis').onchange = (e) => on.aisle(o.id, 'clearanceAxis', e.target.value);
    $('mAisleEnabled').onchange = (e) => on.aisle(o.id, 'warningsEnabled', e.target.checked);
    $('mLinkedDoor').onchange = (e) => on.aisle(o.id, 'linkedDoorId', e.target.value || null);
    $('mAisleScope').onchange = (e) => on.aisle(o.id, 'scopeIds', e.target.value);
  }
  root.querySelectorAll('[data-group-action]').forEach((b) => { b.onclick = () => on.group(b.dataset.groupAction); });
  click('mGroupDuplicate', () => on.duplicate());
  click('mGroupDelete', () => on.remove());
  click('mGroupUndo', () => on.undo());
  click('mGroupCheck', () => on.check());
  click('mGroupCompare', () => on.compare());
  click('mGroupExport', () => on.exportCsv(racks));
}
