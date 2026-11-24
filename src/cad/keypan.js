// 방향키 이동 계산(DOM 없음). held = 눌려 있는 방향키 이름의 Set.
const DIR = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
export const PAN_SPEED = 600; // px/s
export const PAN_FAST = 3; // Shift 배율(1800px/s)

export const isArrow = (key) => key in DIR;

/** 눌린 방향키의 합 벡터(성분 -1·0·1). 반대 방향키는 상쇄된다. */
export function heldVector(held) {
  let x = 0, y = 0;
  for (const k of held) if (DIR[k]) { x += DIR[k][0]; y += DIR[k][1]; }
  return [Math.sign(x), Math.sign(y)];
}

/** dt초 동안의 화면 이동량(px). 대각선도 속력은 같다. 줌과 무관. */
export function panDelta(held, shift, dt) {
  const [x, y] = heldVector(held), n = Math.hypot(x, y);
  if (!n) return { dx: 0, dy: 0 };
  const d = (PAN_SPEED * (shift ? PAN_FAST : 1) * dt) / n;
  return { dx: x * d, dy: y * d };
}
