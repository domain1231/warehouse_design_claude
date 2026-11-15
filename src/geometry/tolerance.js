// 허용오차의 단일 정의.
// 기준본은 파일마다 1e-6 ~ 1e-12의 서로 다른 상수를 사용했다(분석 보고서 3.2).
// 재구축에서는 목적별로 세 가지를 구분하고 이 파일에서만 정의한다.
//
// 1) 입력 양자화: 사용자 입력·스냅 이동의 최소 단위(1mm)
// 2) 기하 판정: 부동소수점 잡음 흡수용. 기준본 v2.4.1의 EPS(1e-8)와 같은 값을 쓴다
//    (Golden Master G1·G2 일치 목적, D-004). 입력 단위(1mm)보다 10만 배 작으므로
//    이 값 이하의 부족분은 실제 이격 부족이 아니라 계산 잡음이다.
//    이 값을 키워서 실제 충돌·이격 부족을 정상으로 판정하는 데 쓰지 않는다.
//    SAT 분리 판정은 기준본과 같이 정규화하지 않은 변 법선 위에서 이 값을 쓴다.
// 3) 연산 잡음 정리: 덧셈 결과의 0.30000000000000004 같은 잡음만 제거(1nm).
//    기존 JSON의 유효한 소수 좌표를 mm로 반올림하지 않는다(명세 6.5).

export const INPUT_STEP_M = 0.001;
export const GEOMETRY_EPS_M = 1e-8;
const NOISE_SCALE = 1e9;

export const SNAP_STEPS_M = Object.freeze([0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]);

function assertFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name}은(는) 유한한 숫자여야 합니다.`);
  }
}

/** 덧셈·이동 결과의 부동소수점 잡음만 제거한다. 1nm보다 큰 자릿수는 보존한다. */
export function addPrecise(a, b) {
  assertFinite(a, 'a');
  assertFinite(b, 'b');
  return Math.round((a + b) * NOISE_SCALE) / NOISE_SCALE;
}

/** 사용자 입력값을 1mm 단위로 양자화한다. 저장된 기존 좌표에는 사용하지 않는다. */
export function quantizeInput(value) {
  assertFinite(value, 'value');
  return Math.round(value / INPUT_STEP_M) / 1000;
}

/** 스냅 간격에 맞춰 값을 정렬한다. step은 SNAP_STEPS_M 중 하나여야 한다. */
export function snapTo(value, step) {
  assertFinite(value, 'value');
  if (!SNAP_STEPS_M.includes(step)) throw new RangeError(`지원하지 않는 스냅 간격입니다: ${step}`);
  const stepMm = Math.round(step * 1000);
  return (Math.round(Math.round(value * 1000) / stepMm) * stepMm) / 1000;
}

/** 실제 거리가 요구 거리를 충족하는지 판정한다. 부족분이 GEOMETRY_EPS_M 이하면 계산 잡음으로 본다. */
export function meetsClearance(actual, required) {
  assertFinite(actual, 'actual');
  assertFinite(required, 'required');
  return actual + GEOMETRY_EPS_M >= required;
}

/** 부족 거리(m). 충족하면 0. 표시용 값이며 판정은 meetsClearance로 한다. */
export function clearanceShortfall(actual, required) {
  return meetsClearance(actual, required) ? 0 : addPrecise(required, -actual);
}

// ── 기준본 v2.4.1 정밀 편집(80 Q.add, snapped)과 같은 결과를 내는 연산 ──
// 편집 결과가 기준본과 바이트 단위로 같아야 하므로(이동·스냅 후 저장 JSON) 위 snapTo/addPrecise와 따로 둔다.

/** mm 정렬 판정 허용(mm 단위 1e-6). */
const MM_ALIGN_EPS = 1e-6;

/** 좌표 + 이동량. 둘 다 1mm 단위면 정수 mm로 더해 잡음 없이, 아니면 소수 12자리로 정리한다(기존 소수 좌표 보존). */
export function addMm(n, delta) {
  const a = n * 1e3, b = delta * 1e3;
  return Math.abs(a - Math.round(a)) < MM_ALIGN_EPS && Math.abs(b - Math.round(b)) < MM_ALIGN_EPS ? (Math.round(a) + Math.round(b)) / 1e3 : Number((n + delta).toFixed(12));
}

/** mm 반올림(기준본 Q.roundMm). 스냅을 끈 드래그 종료 위치에만 쓴다. */
export const roundMm = (n) => Math.round(n * 1e3) / 1e3;

/** 스냅 간격(m, 1mm 단위)에 맞춘다(기준본 snapped). */
export function snapToStep(n, step) {
  const mm = Math.round(step * 1e3);
  return (Math.round((n * 1e3) / mm) * mm) / 1e3;
}
