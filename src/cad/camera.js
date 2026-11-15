// 도면 카메라: 기준본 50-editor(M.fitView, viewBox, zoom, focusSelection, M.center, 팬·핀치, 휠)의 계산을 DOM 없이 옮긴다.
// 좌표는 모두 미터(월드). 화면 크기(size)는 도면 영역 픽셀. viewport는 프로젝트에 저장되는 { zoom, panX, panY, centerLocked, fitScale }.
// fitScale(배율 1일 때 1m당 픽셀)은 기준본 65-panels-details 래퍼처럼 한 번 정하면 유지한다. 그래서 패널을 접거나 창 크기가
// 바뀌어도 도면 축척은 그대로이고, '전체 보기'·50%·200%(중심 맞춤 reset)에서만 다시 계산한다.
// 카메라 조작은 배치 좌표를 바꾸지 않는다(F-011 좌표 불변).

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 30;
/** 도면 여백(m): 창고 둘레에 1.2m씩. 기준본 fitView의 +2.4. */
export const FIT_MARGIN_M = 2.4;

export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

const sizeOf = (size) => ({ w: Math.max(1, size.w), h: Math.max(1, size.h) });

/** 창고 전체 + 여백이 화면에 맞는 1m당 픽셀(기준본 S.fitScale). */
export function fitScaleFor(warehouse, size) {
  const s = sizeOf(size);
  return Math.max(1e-3, Math.min(s.w / (warehouse.width + FIT_MARGIN_M), s.h / (warehouse.height + FIT_MARGIN_M)));
}

const hasFitScale = (v) => Number.isFinite(v.fitScale) && v.fitScale > 0;

/** fitScale이 없으면 현재 화면으로 정해 넣는다(기준본 M.fitView가 처음 호출될 때 하는 일). */
export const withFitScale = (viewport, warehouse, size) => (hasFitScale(viewport) ? viewport : { ...viewport, fitScale: fitScaleFor(warehouse, size) });

/** 확대 1배일 때 보이는 월드 크기. */
export function fitView(viewport, warehouse, size) {
  const s = sizeOf(size);
  const scale = hasFitScale(viewport) ? viewport.fitScale : fitScaleFor(warehouse, size);
  return { w: s.w / scale, h: s.h / scale };
}

/** 현재 보이는 월드 영역 { x, y, w, h } (SVG viewBox). 중심 고정이면 pan을 무시한다. */
export function viewBox(viewport, warehouse, size) {
  const f = fitView(viewport, warehouse, size);
  const cx = warehouse.width / 2 + (viewport.centerLocked ? 0 : viewport.panX);
  const cy = warehouse.height / 2 + (viewport.centerLocked ? 0 : viewport.panY);
  const w = f.w / viewport.zoom;
  const h = f.h / viewport.zoom;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 화면 좌표(도면 영역 기준 픽셀) → 월드 좌표. viewBox와 화면의 가로세로 비가 같다(fitView). */
export function screenToWorld(viewport, warehouse, size, px, py) {
  const v = viewBox(viewport, warehouse, size);
  const s = sizeOf(size);
  return { x: v.x + (px / s.w) * v.w, y: v.y + (py / s.h) * v.h };
}

/** 월드 1m가 몇 픽셀인지. */
export const pixelsPerMeter = (viewport, warehouse, size) => sizeOf(size).w / viewBox(viewport, warehouse, size).w;

/**
 * 기준본 zoom(f, anchor): f < 1이면 확대, f > 1이면 축소(확대 버튼 0.8, 축소 1.25).
 * 중심 고정이 아니고 anchor(월드 좌표)가 있으면 anchor가 화면의 같은 자리에 남도록 pan을 조정한다.
 */
export function zoomBy(viewport, f, anchor, warehouse, size) {
  const old = viewBox(viewport, warehouse, size);
  const next = clampZoom(viewport.zoom / f);
  const v = { ...viewport, zoom: next };
  if (!viewport.centerLocked && anchor) {
    const scale = viewport.zoom / next;
    v.panX = anchor.x + (old.x + old.w / 2 - anchor.x) * scale - warehouse.width / 2;
    v.panY = anchor.y + (old.y + old.h / 2 - anchor.y) * scale - warehouse.height / 2;
  }
  return v;
}

/** 팬: 시작 시점 viewport에서 월드 이동량만큼 반대로 움직인다. 팬하면 중심 고정이 풀린다. */
export function panFrom(start, dxWorld, dyWorld) {
  return { ...start, panX: start.panX - dxWorld, panY: start.panY - dyWorld, centerLocked: false };
}

/**
 * 두 손가락 확대. gesture = { zoom, distance, viewport, view, anchor }는 시작 시점 값.
 * distance: 현재 두 점 거리(px), dxWorld/dyWorld: 두 점 중점의 이동량(시작 시점 변환으로 계산한 월드 m).
 */
export function pinchFrom(gesture, distance, dxWorld, dyWorld, warehouse) {
  const zoom = clampZoom((gesture.zoom * Math.max(1, distance)) / gesture.distance);
  const v = { ...gesture.viewport, zoom };
  if (!gesture.viewport.centerLocked) {
    const scale = gesture.zoom / zoom, g = gesture.view, a = gesture.anchor;
    v.panX = a.x + (g.x + g.w / 2 - a.x) * scale - dxWorld * scale - warehouse.width / 2;
    v.panY = a.y + (g.y + g.h / 2 - a.y) * scale - dyWorld * scale - warehouse.height / 2;
  }
  return v;
}

/** 중심 맞춤(기준본 M.center). reset이면 100%로 되돌리고 fitScale을 현재 화면에 맞춰 다시 정한다. */
export function centerView(viewport, reset, warehouse, size) {
  const v = { ...viewport, zoom: reset ? 1 : viewport.zoom, panX: 0, panY: 0, centerLocked: true };
  if (reset) v.fitScale = fitScaleFor(warehouse, size);
  return v;
}

/** 선택 영역 보기(기준본 focusSelection). box = { width, depth, cx, cy }. */
export function focusBox(viewport, box, warehouse, size) {
  const base = withFitScale(viewport, warehouse, size);
  const f = fitView(base, warehouse, size);
  return {
    zoom: clampZoom(Math.min(f.w / (box.width + 1.2), f.h / (box.depth + 1.2))),
    panX: box.cx - warehouse.width / 2,
    panY: box.cy - warehouse.height / 2,
    centerLocked: false,
    fitScale: base.fitScale,
  };
}

// ── 휠 ────────────────────────────────────────────────────────────────

/** 감도별 이득(1픽셀당 지수). 기준본 M.wheelGains. 기본은 low. */
export const WHEEL_GAINS = Object.freeze({ low: 35e-5, medium: 55e-5, high: 75e-5 });
export const WHEEL_DEFAULT = 'low';
/** 같은 휠 동작으로 보는 간격(ms). 기준본 M.observeWheel의 350. */
export const WHEEL_GESTURE_GAP_MS = 350;

/** 휠 이벤트 → 픽셀 이동량(±500으로 제한). deltaMode 1(줄)·2(페이지)는 lineHeight·pageHeight로 환산한다. */
export function wheelPixels({ deltaY, deltaMode }, { lineHeight = 16, pageHeight = 1 } = {}) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  let unit = 1;
  if (deltaMode === 1) unit = lineHeight;
  else if (deltaMode === 2) unit = Math.max(1, pageHeight);
  else if (deltaMode !== 0) return 0;
  const d = deltaY * unit;
  return Number.isFinite(d) ? Math.max(-500, Math.min(500, d)) : 0;
}

/** 한 프레임에 모인 휠 이동량 → 확대 배율 f(zoomBy 인자). 한 프레임 변화는 e^±0.1로 제한. 0이면 변화 없음. */
export function wheelFactor(delta, mode = WHEEL_DEFAULT) {
  const gain = WHEEL_GAINS[mode] ?? WHEEL_GAINS[WHEEL_DEFAULT];
  const exponent = Math.max(-0.1, Math.min(0.1, delta * gain));
  return exponent ? Math.exp(exponent) : 1;
}

/**
 * 휠 시작 영역 추적(기준본 M.observeWheel). 패널을 스크롤하다 도면 위로 지나가도 도면이 확대되지 않게 한다.
 * observe(area, now, momentum)는 이 휠을 도면 확대에 써도 되는지 돌려준다.
 * area: 'CANVAS' | 'LEFT_PANEL' | 'RIGHT_PANEL' | 'BOTTOM_PANEL' | 'MODAL' | 'OTHER'
 */
export function createWheelTracker() {
  let origin = 'OTHER';
  let last = -Infinity;
  return {
    observe(area, now, momentum = false) {
      if ((now - last > WHEEL_GESTURE_GAP_MS && momentum !== true) || (origin === 'CANVAS' && area !== 'CANVAS')) origin = area;
      last = now;
      return area === 'CANVAS' && origin === 'CANVAS';
    },
    /** 포인터 조작·중심 맞춤 뒤에는 다음 휠을 새 동작으로 본다. */
    reset() {
      last = -Infinity;
    },
    get origin() {
      return origin;
    },
  };
}
