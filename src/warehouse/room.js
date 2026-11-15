// 창고 치수 적용·면적 역산(기준본 R.updateRoomApplyState, 30 applyRoom/deriveRoom). DOM 없음.
import { applyCommand, COMMAND_DEFAULT } from './commands.js';
import { formatNumber as fmt } from '../core/format.js';

const range = (v) => Number.isFinite(v) && v >= 1 && v <= 500;
/** 최솟값 1에서 0.1m 간격의 배수인지(HTML step 검사와 같은 기준). */
const onStep = (v) => Math.abs((v - 1) * 10 - Math.round((v - 1) * 10)) <= 1e-6;

/** 치수 적용 불가 사유. 빈 문자열이면 적용할 수 있다. width·height는 입력 칸의 문자열. */
export function roomApplyReason({ width, height }, { locked = false, history = false, busy = false } = {}) {
  const raw = [width, height], v = raw.map((s) => Number(s));
  if (locked) return 'BEFORE 원본 잠금 상태입니다. 잠금 해제 후 수정하세요.';
  if (history) return '과거 조회 중입니다. 현재 편집으로 돌아온 뒤 적용하세요.';
  if (busy) return '처리 중입니다. 완료 후 치수를 적용하세요.';
  if (raw.some((s, i) => !String(s).trim() || !range(v[i]))) return '가로와 세로에 1~500m의 숫자를 입력하세요.';
  if (!v.every(onStep)) return '가로와 세로는 0.1m 단위로 입력하세요.';
  return '';
}

/** 창고 가로·세로·천장 높이만 바꾼다(랙은 그대로). 공간 경고 정책·화면 초기화는 applyCommand를 따른다. */
export function applyRoom(project, { width, height, ceiling }, { nextId, now }) {
  return applyCommand(project, (draft, layout) => {
    const w = layout.warehouse;
    w.width = Number(width);
    w.height = Number(height);
    w.ceiling = ceiling === '' || ceiling == null ? null : Number(ceiling);
  }, { command: COMMAND_DEFAULT, nextId, now, resetCamera: true });
}

/** 면적과 알려진 가로로 세로를 계산한다. 오류면 현재 입력값을 그대로 돌려준다. inputs = [가로, 세로, 면적]. */
export function deriveRoom(area, known, current) {
  const a = Number(area), w = Number(known);
  if (!(a > 0 && w > 0)) return { ok: false, inputs: [String(current.width), String(current.height), fmt(Number(current.width) * Number(current.height))], message: '면적과 알려진 가로를 양수로 입력하세요.' };
  return { ok: true, inputs: [String(w), String(a / w), fmt(a)], message: '치수를 계산했습니다. 치수 적용을 누르면 반영됩니다.' };
}
