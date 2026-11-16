// 창고 치수·참고 도면 칸(기준본 01 프로젝트·공간, 04 참고 도면 배경). 계산은 warehouse/room.js, 변경은 main이 준 콜백(실행취소 기록).
import { roomApplyReason, deriveRoom } from '../warehouse/room.js';
import { formatNumber as fmt } from '../core/format.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** 파일 → 배경 data URL. 오류는 기준본 문구로 던진다. */
export async function readBackgroundFile(f) {
  if (f.size > 12e6) throw new Error('12MB 이하 파일만 지원합니다.');
  if (!IMAGE_TYPES.includes(f.type)) throw new Error('PNG/JPEG/WebP 이미지만 지원합니다.');
  if (f.size > 4e6) throw new Error('배경 이미지는 4MB 이하를 권장·지원합니다.');
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

/**
 * @param {{ room: HTMLElement, ref: HTMLElement }} bodies
 * @param {{ getProject, isHistory: () => boolean, applyRoom: (room) => Promise<any>, setBackground: (label: string, mutate: (bg, warehouse) => void) => Promise<any>, startCalibration: () => void, toast: (t: string) => void }} cb
 * @returns {{ sync: () => void, calibrationLength: () => number }}
 */
export function createRoomPanel({ room, ref }, { getProject, isHistory, applyRoom, setBackground, useReference, startCalibration, toast }) {
  room.innerHTML = `<div class="fields">
    <label>가로 X (m)<input id="roomWidth" data-testid="room-width" type="number" min="1" max="500" step="0.1"></label>
    <label>세로 Y (m)<input id="roomHeight" data-testid="room-height" type="number" min="1" max="500" step="0.1"></label>
    <label>천장 높이 (m)<input id="ceiling" data-testid="room-ceiling" type="number" min="0.1" step="0.1" placeholder="선택"></label>
    <label>계산 면적 (㎡)<input id="roomArea" data-testid="room-area" readonly></label></div>
    <button type="button" id="applyRoom" class="fullbtn" aria-describedby="roomApplyReason" data-testid="room-apply">치수 적용</button>
    <p id="roomApplyReason" class="muted" data-testid="room-reason" role="status" aria-live="polite"></p>
    <details style="margin:10px 0 0;padding-bottom:0;border:0"><summary class="muted">면적에서 치수 계산</summary><div class="fields">
    <label>목표 면적 (㎡)<input id="areaInput" data-testid="room-area-in" type="number" min="1" value="240"></label>
    <label>알려진 가로 (m)<input id="knownWidth" data-testid="room-known" type="number" min="1" value="20"></label></div>
    <button type="button" id="deriveRoom" data-testid="room-derive">가로 기준 세로 계산</button>
    <p class="muted">면적만으로 두 변을 결정하지 않습니다.</p></details>`;
  ref.innerHTML = `<label class="filebtn">이미지 불러오기<input id="imageIn" data-testid="bg-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
    <button type="button" id="referenceImage" data-testid="bg-reference">첨부 도면 사용</button>
    <label class="check"><input id="bgOn" data-testid="bg-show" type="checkbox">배경 표시</label>
    <label>투명도<input id="bgOpacity" data-testid="bg-opacity" type="range" min="0" max="1" step="0.05" value="0.25"></label>
    <p class="muted">전체 창고 범위에 맞춰 늘려 표시합니다. 아래 보정은 균일 축척만 조정합니다.</p>
    <div class="fields">
    <label>배경 X (m)<input id="bgX" data-testid="bg-x" type="number" value="0" step="0.1"></label>
    <label>배경 Y (m)<input id="bgY" data-testid="bg-y" type="number" value="0" step="0.1"></label>
    <label>배경 폭 (m)<input id="bgW" data-testid="bg-width" type="number" min="0.1" step="0.1"></label>
    <label>배경 높이 (m)<input id="bgH" data-testid="bg-height" type="number" min="0.1" step="0.1"></label>
    <label class="full">보정할 두 점 사이 실측 거리 (m)<input id="calibrationLength" data-testid="bg-length" type="number" min="0.01" value="5" step="0.1"></label></div>
    <button type="button" id="calibrate" data-testid="bg-calibrate">도면 위 두 점으로 축척 보정</button>
    <button type="button" id="clearBg" data-testid="bg-clear">배경 제거</button>`;
  const q = (root, id) => root.querySelector(`[data-testid="${id}"]`);
  const w = q(room, 'room-width'), h = q(room, 'room-height'), c = q(room, 'room-ceiling'), area = q(room, 'room-area');
  const apply = q(room, 'room-apply'), reason = q(room, 'room-reason');
  const bg = { file: q(ref, 'bg-file'), show: q(ref, 'bg-show'), opacity: q(ref, 'bg-opacity'), x: q(ref, 'bg-x'), y: q(ref, 'bg-y'), width: q(ref, 'bg-width'), height: q(ref, 'bg-height') };
  let applying = false, synced = '';

  const showArea = () => { area.value = fmt(Number(w.value) * Number(h.value)); };
  function updateState() {
    const p = getProject();
    const locked = !!p && p.settings.scenario === 'before' && !!p.scenarioMeta?.before?.locked;
    const msg = roomApplyReason({ width: w.value, height: h.value }, { locked, history: isHistory(), busy: applying });
    apply.disabled = !!msg;
    reason.textContent = msg;
    return !msg;
  }
  /** 프로젝트의 값을 칸에 맞춘다. 창고 치수가 바뀐 때만 입력 중인 치수를 덮는다. */
  function sync() {
    const p = getProject();
    if (!p) return;
    const wh = p.scenarios[p.settings.scenario].warehouse, key = JSON.stringify([p.settings.scenario, wh]);
    if (key !== synced) {
      synced = key;
      w.value = wh.width;
      h.value = wh.height;
      c.value = wh.ceiling ?? '';
      showArea();
    }
    const b = p.settings.background;
    bg.show.checked = b.show;
    bg.opacity.value = b.opacity;
    for (const k of ['x', 'y', 'width', 'height']) if (document.activeElement !== bg[k]) bg[k].value = b[k];
    updateState();
  }

  for (const el of [w, h]) for (const ev of ['input', 'change']) el.addEventListener(ev, () => { if (ev === 'input') showArea(); updateState(); });
  apply.addEventListener('click', async () => {
    if (!updateState()) return;
    applying = true;
    updateState();
    try {
      await applyRoom({ width: w.value, height: h.value, ceiling: c.value });
    } finally {
      applying = false;
      updateState();
    }
  });
  q(room, 'room-derive').addEventListener('click', () => {
    const d = deriveRoom(q(room, 'room-area-in').value, q(room, 'room-known').value, { width: w.value, height: h.value });
    [w.value, h.value, area.value] = d.inputs;
    toast(d.message);
    updateState();
  });

  const edit = (label, mutate) => setBackground(label, mutate).finally(() => sync());
  bg.file.addEventListener('change', async () => {
    const f = bg.file.files[0];
    if (!f) return;
    bg.file.value = '';
    try {
      const data = await readBackgroundFile(f);
      await edit('참고 도면 불러오기', (b, wh) => Object.assign(b, { data, show: true, width: wh.width, height: wh.height, x: 0, y: 0 }));
    } catch (e) {
      toast('파일 처리 실패: ' + e.message);
    }
  });
  bg.show.addEventListener('change', () => edit('참고 도면 표시', (b) => { b.show = bg.show.checked; }));
  bg.opacity.addEventListener('change', () => edit('참고 도면 투명도', (b) => { b.opacity = Number(bg.opacity.value); }));
  for (const k of ['x', 'y', 'width', 'height']) bg[k].addEventListener('change', () => edit('참고 도면 위치·크기', (b) => { b[k] = Number(bg[k].value); }));
  q(ref, 'bg-reference').addEventListener('click', () => useReference().finally(() => sync()));
  q(ref, 'bg-clear').addEventListener('click', () => edit('참고 도면 제거', (b) => { b.data = ''; b.show = false; }));
  q(ref, 'bg-calibrate').addEventListener('click', () => {
    const b = getProject().settings.background;
    if (!b.data || !b.show) return toast('배경 이미지를 먼저 표시하세요.');
    startCalibration();
  });

  return { sync, calibrationLength: () => Number(q(ref, 'bg-length').value), updateState };
}
