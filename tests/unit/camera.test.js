import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewBox, zoomBy, panFrom, pinchFrom, centerView, withFitScale, fitScaleFor, screenToWorld, wheelPixels, wheelFactor, createWheelTracker, WHEEL_GAINS } from '../../src/cad/camera.js';

const W = { width: 24, height: 12.9 };
const size = { w: 1000, h: 600 };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
/** 월드 점이 화면에서 어디에 보이는지(px). */
const toScreen = (v, p) => {
  const b = viewBox(v, W, size);
  return { x: ((p.x - b.x) / b.w) * size.w, y: ((p.y - b.y) / b.h) * size.h };
};

test('배율 1·중심 고정: 창고 중심이 화면 중심, 창고 전체+여백이 들어간다', () => {
  const v = withFitScale({ zoom: 1, panX: 0, panY: 0, centerLocked: true }, W, size);
  const b = viewBox(v, W, size);
  close(b.x + b.w / 2, W.width / 2);
  close(b.y + b.h / 2, W.height / 2);
  assert.ok(b.w >= W.width + 2.4 - 1e-9 && b.h >= W.height + 2.4 - 1e-9);
  close(b.w / b.h, size.w / size.h);
});

test('자유 화면 확대: 기준점이 화면의 같은 자리에 남는다(좌표 불변)', () => {
  let v = withFitScale({ zoom: 1.3, panX: 2, panY: -1, centerLocked: false }, W, size);
  for (const [f, anchor] of [[0.8, { x: 3, y: 4 }], [Math.exp(0.1), { x: 20.25, y: 1.5 }], [Math.exp(-0.1), { x: 0, y: 12.9 }]]) {
    const before = toScreen(v, anchor);
    v = zoomBy(v, f, anchor, W, size);
    const after = toScreen(v, anchor);
    close(after.x, before.x, 1e-7);
    close(after.y, before.y, 1e-7);
  }
});

test('중심 고정이면 기준점이 있어도 pan이 바뀌지 않고, 배율은 0.05–30으로 제한된다', () => {
  const v = withFitScale({ zoom: 1, panX: 0, panY: 0, centerLocked: true }, W, size);
  const z = zoomBy(v, 0.8, { x: 1, y: 1 }, W, size);
  assert.deepEqual([z.panX, z.panY, z.zoom], [0, 0, 1.25]);
  assert.equal(zoomBy(v, 1e-6, null, W, size).zoom, 30);
  assert.equal(zoomBy(v, 1e6, null, W, size).zoom, 0.05);
});

test('창 크기가 바뀌어도 fitScale이 있으면 축척(1m당 px)은 그대로, 전체 보기에서만 다시 계산', () => {
  const v = withFitScale({ zoom: 1, panX: 0, panY: 0, centerLocked: true }, W, size);
  const small = { w: 700, h: 600 };
  close(small.w / viewBox(v, W, small).w, size.w / viewBox(v, W, size).w);
  const reset = centerView({ ...v, zoom: 3, panX: 4, centerLocked: false }, true, W, small);
  assert.deepEqual(reset, { zoom: 1, panX: 0, panY: 0, centerLocked: true, fitScale: fitScaleFor(W, small) });
  assert.equal(centerView({ ...v, zoom: 3 }, false, W, small).zoom, 3);
});

test('팬: 시작 viewport 기준으로 월드 이동량만큼 반대로, 중심 고정 해제', () => {
  const start = { zoom: 2, panX: 1, panY: 1, centerLocked: true, fitScale: 30 };
  assert.deepEqual(panFrom(start, 0.5, -2), { zoom: 2, panX: 0.5, panY: 3, centerLocked: false, fitScale: 30 });
});

test('두 손가락 확대: 거리 2배면 배율 2배, 중점이 움직이지 않으면 중점 아래 월드 점 고정', () => {
  const v = withFitScale({ zoom: 1, panX: 0.5, panY: 0, centerLocked: false }, W, size);
  const mid = { x: 400, y: 250 };
  const anchor = screenToWorld(v, W, size, mid.x, mid.y);
  const g = { zoom: v.zoom, distance: 100, viewport: v, view: viewBox(v, W, size), anchor };
  const next = pinchFrom(g, 200, 0, 0, W);
  close(next.zoom, 2);
  const s = toScreen(next, anchor);
  close(s.x, mid.x, 1e-7);
  close(s.y, mid.y, 1e-7);
});

test('휠 픽셀 환산: 줄·페이지 단위, ±500 제한, 알 수 없는 단위·0은 무시', () => {
  assert.equal(wheelPixels({ deltaY: 100, deltaMode: 0 }), 100);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }, { lineHeight: 20 }), 60);
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }, { pageHeight: 800 }), 500);
  assert.equal(wheelPixels({ deltaY: -9000, deltaMode: 0 }), -500);
  assert.equal(wheelPixels({ deltaY: 5, deltaMode: 7 }), 0);
  assert.equal(wheelPixels({ deltaY: 0, deltaMode: 0 }), 0);
  assert.equal(wheelPixels({ deltaY: NaN, deltaMode: 0 }), 0);
});

test('휠 배율: 아래로(+)는 축소(f>1), 감도별 이득, 한 프레임 e^±0.1 제한', () => {
  close(wheelFactor(100, 'low'), Math.exp(100 * WHEEL_GAINS.low));
  close(wheelFactor(-100, 'high'), Math.exp(-100 * WHEEL_GAINS.high));
  close(wheelFactor(5000, 'low'), Math.exp(0.1));
  assert.equal(wheelFactor(0), 1);
  close(wheelFactor(100, '잘못된 값'), Math.exp(100 * WHEEL_GAINS.low));
});

test('휠 시작 영역: 패널에서 시작한 휠은 도면 위로 지나가도 확대하지 않는다', () => {
  const t = createWheelTracker();
  assert.equal(t.observe('RIGHT_PANEL', 0), false);
  assert.equal(t.observe('CANVAS', 100), false); // 같은 동작(350ms 이내)
  assert.equal(t.observe('CANVAS', 200, true), false); // 관성 스크롤도 같은 동작
  assert.equal(t.observe('CANVAS', 700), true); // 새 동작
  assert.equal(t.observe('LEFT_PANEL', 750), false); // 도면에서 벗어나면 즉시 전환
  t.reset();
  assert.equal(t.observe('CANVAS', 760), true); // 포인터 조작 뒤에는 새 동작
});
