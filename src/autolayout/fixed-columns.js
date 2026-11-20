// D-041 로케이션 열 고정 배치.
// 열 순서·열 안 번호 순서를 바꾸지 않고, 창고 치수와 열 두께(랙 깊이)로 열 사이 간격을 계산한다.
//   열 두께 tᵢ  = 열 진행 방향(E)으로 잰 열의 폭(가장 깊은 랙)
//   열 길이 Lᵢ  = 열 방향(S)으로 잰 길이(랙 폭 합 + 랙 사이 간격)
//   길이 조건   max Lᵢ ≤ S 방향 창고 길이 − 2·벽 이격
//   모든 열 사이 통로   a_max = (E 방향 창고 길이 − 2·벽 이격 − Σt) / (n − 1)
//   등 맞댐 쌍         a_max = (E 방향 창고 길이 − 2·벽 이격 − Σt − 쌍 수·등 간격) / (묶음 수 − 1)
// 랙을 옮기거나 빼서 맞추지 않는다. 들어가지 않으면 부족한 길이를 그대로 알린다.
import { polygon } from '../geometry/polygons.js';

export const BACK_GAP = 0.1; // 등 맞댐 쌍 안쪽 간격(m)

const floorMm = (v) => Math.floor(v * 1000 + 1e-6) / 1000;
const dot = (p, u) => p[0] * u[0] + p[1] * u[1];

/** generateRacks와 같은 축: E = 열 진행 방향, S = 북→남. */
export function axesOf(northRotation, columnDirection) {
  const angle = (northRotation * Math.PI) / 180, sgn = columnDirection === 'east' ? 1 : -1;
  return { E: [Math.cos(angle) * sgn, Math.sin(angle) * sgn], S: [-Math.sin(angle), Math.cos(angle)] };
}

/** 북쪽 방향이 0·90·180·270°(±0.001°)일 때만 창고 변과 축이 나란하다. */
export function isAxisAligned(northRotation) {
  const r = ((northRotation % 90) + 90) % 90;
  return r < 1e-3 || 90 - r < 1e-3;
}

/** 창고 직사각형을 축에 투영한 범위. */
export function spans(width, depth, { E, S }) {
  const pts = [[0, 0], [width, 0], [width, depth], [0, depth]];
  const range = (u) => { const v = pts.map((p) => dot(p, u)); return [Math.min(...v), Math.max(...v)]; };
  return { E: range(E), S: range(S) };
}

/** 생성 순서대로 열별 두께·길이. racks는 excel.column을 가진 랙 객체. */
export function columnProfile(racks, { E, S }) {
  const by = new Map();
  for (const o of racks) {
    const k = o.excel.column, p = polygon(o);
    const e = p.map((q) => dot(q, E)), s = p.map((q) => dot(q, S));
    const m = by.get(k) ?? { column: k, count: 0, e0: Infinity, e1: -Infinity, s0: Infinity, s1: -Infinity };
    m.count++;
    m.e0 = Math.min(m.e0, ...e); m.e1 = Math.max(m.e1, ...e);
    m.s0 = Math.min(m.s0, ...s); m.s1 = Math.max(m.s1, ...s);
    by.set(k, m);
  }
  return [...by.values()].map((m) => ({ column: m.column, count: m.count, thickness: m.e1 - m.e0, length: m.s1 - m.s0 }));
}

/** 묶음: 첫 열은 벽 쪽 단독, 이후 둘씩 등 맞댐, 하나 남으면 마지막도 단독. 값은 열 순번. */
export function pairUnits(n) {
  if (n <= 0) return [];
  const units = [[0]];
  for (let i = 1; i < n; i += 2) units.push(i + 1 < n ? [i, i + 1] : [i]);
  return units;
}

const m = (v) => (Number.isFinite(v) ? v.toFixed(2) : '제한 없음');

// ── 2단계: 배치 형태(축 · 한 줄 열 수 · 통로 방식), 지그재그, 자동 추천 ─────────────────────────
// 한 줄 = 열 방향(S)으로 이어 놓은 열 묶음(한 줄 1열 또는 2열, 로케이션 순서대로). 줄 안 열 사이·줄 사이 간격은 같은 통로 폭.
export const SHAPES = [
  { axis: 'column', perLine: 1, pairing: 'all' }, { axis: 'column', perLine: 1, pairing: 'pairs' },
  { axis: 'column', perLine: 2, pairing: 'all' }, { axis: 'column', perLine: 2, pairing: 'pairs' },
  { axis: 'row', perLine: 1, pairing: 'all' }, { axis: 'row', perLine: 1, pairing: 'pairs' },
  { axis: 'row', perLine: 2, pairing: 'all' }, { axis: 'row', perLine: 2, pairing: 'pairs' },
];

export function linesOf(profile, perLine) {
  const lines = [];
  for (let i = 0; i < profile.length; i += perLine) {
    const cols = profile.slice(i, i + perLine);
    lines.push({ cols, m: cols.length, thickness: Math.max(...cols.map((c) => c.thickness)), sumL: cols.reduce((s, c) => s + c.length, 0) });
  }
  return lines;
}

/** 한 배치 형태의 가능 범위. aMax = 줄 사이(E)와 줄 안 열 사이(S) 조건을 함께 만족하는 최대 통로 폭(mm 내림). */
export function evaluateShape(profile, { spanE, spanS, wallGap, aisleTarget, backGap = BACK_GAP, perLine = 1, pairing = 'all' }) {
  const EPS = 1e-9;
  const lines = linesOf(profile, perLine), availE = spanE - 2 * wallGap, availS = spanS - 2 * wallGap;
  const units = pairing === 'pairs' ? pairUnits(lines.length) : lines.map((_, i) => [i]);
  const pairs = units.filter((u) => u.length === 2).length, sumT = lines.reduce((s, l) => s + l.thickness, 0);
  const roomE = availE - sumT - pairs * backGap, slotsE = units.length - 1;
  const aE = slotsE > 0 ? roomE / slotsE : roomE >= -EPS ? Infinity : -Infinity;
  const multi = lines.filter((l) => l.m > 1);
  const aS = multi.length ? Math.min(...multi.map((l) => (availS - l.sumL) / (l.m - 1))) : Infinity;
  const tooLong = lines.filter((l) => l.sumL > availS + EPS).flatMap((l) => l.cols.map((c) => c.column));
  const lengthOK = tooLong.length === 0, fits = roomE >= -EPS && lengthOK;
  const raw = Math.min(aE, aS), aMax = Number.isFinite(raw) ? floorMm(raw) : raw;
  const meetsTarget = fits && raw + EPS >= aisleTarget;
  const shortE = slotsE > 0 ? Math.max(0, aisleTarget * slotsE - roomE) : Math.max(0, -roomE);
  const shortS = Math.max(0, ...lines.map((l) => l.sumL + aisleTarget * (l.m - 1) - availS));
  return { perLine, pairing, lines, units, availE, availS, sumT, lengthOK, tooLong, fits, aMax, meetsTarget, shortE, shortS, longestLine: Math.max(...lines.map((l) => l.sumL)) };
}

/** 적용 통로 폭. 'max'는 남는 폭을 고르게 나누되 통로 최대 폭(cap, D-050)을 넘지 않는다(남는 공간은 끝 벽 쪽 여유). */
export const chooseAisle = (ev, target, spacing, cap = Infinity) => (spacing === 'target' || !ev.fits || !Number.isFinite(ev.aMax) ? target : Math.min(ev.aMax, cap));
/** 추천 비교용 통로 폭: 상한을 넘는 폭은 같은 값으로 본다. */
export const effectiveAisle = (ev, cap = Infinity) => Math.min(ev.aMax, cap);

/** 자동 추천: 목표 충족 형태 중 최대 통로(상한 적용) → 없으면 들어가는 형태 중 최대 통로 → 없으면 첫 형태. 동점은 SHAPES 순서. */
export function recommend(shapes, cap = Infinity) {
  const best = (list) => list.reduce((b, s) => (b === null || effectiveAisle(s.ev, cap) > effectiveAisle(b.ev, cap) + 1e-9 ? s : b), null);
  return best(shapes.filter((s) => s.ev.meetsTarget)) ?? best(shapes.filter((s) => s.ev.fits)) ?? shapes[0];
}

/**
 * 열별 목표 위치(진행 축 E의 시작 끝 e, 첫 랙 쪽 끝 sMin/sMax). lineFirst(k)는 줄 k의 첫 랙 방향('north'|'south').
 * 줄 안에서는 열을 순서대로 첫 랙 방향으로 이어 놓는다.
 */
export function targetsFor(ev, { aisle, backGap = BACK_GAP, wallGap, loE, loS, hiS, lineFirst }) {
  const second = new Set(ev.units.filter((u) => u.length === 2).map((u) => u[1]));
  const targets = {};
  let e = loE + wallGap;
  ev.lines.forEach((line, k) => {
    if (k > 0) e += ev.lines[k - 1].thickness + (second.has(k) ? backGap : aisle);
    const first = lineFirst(k), sign = first === 'north' ? 1 : -1;
    let cur = first === 'north' ? loS + wallGap : hiS - wallGap;
    for (const c of line.cols) {
      targets[c.column] = first === 'north' ? { first, e, sMin: cur } : { first, e, sMax: cur };
      cur += sign * (c.length + aisle);
    }
  });
  return targets;
}

const SHAPE_NAMES = { column: '열 배치(세로)', row: '행 배치(가로)', all: '모든 줄 사이 통로', pairs: '등 맞댐 쌍' };
export const shapeName = (s) => `${SHAPE_NAMES[s.axis]} · 한 줄 ${s.perLine}열 · ${SHAPE_NAMES[s.pairing]}`;

/** 진단 문구(2단계). info = buildFixedCandidates의 fixed. */
export function fixedText(info) {
  const { shapes, chosen, aisle, target, spacing, start, auto } = info;
  const ev0 = shapes[0].ev;
  const lines = [`열 ${ev0.lines.reduce((s, l) => s + l.m, 0)}개 · 열 두께 합 ${m(ev0.sumT)}m · 통로 목표 ${m(target)}m`, '형태별 최대 통로 (✔ 목표 충족 · ✖ 목표 미달 · 불가):'];
  for (const s of shapes) {
    const ev = s.ev, mark = s === chosen ? '▶ ' : '  ';
    let t;
    if (!ev.lengthOK) t = `불가 (가장 긴 줄 ${m(ev.longestLine)}m > ${m(ev.availS)}m)`;
    else if (!ev.fits) t = `불가 (폭 ${m(ev.shortE)}m 부족)`;
    else if (ev.meetsTarget) t = `${m(ev.aMax)}m ✔`;
    else t = `${m(ev.aMax)}m ✖ (목표까지 ${ev.shortE > ev.shortS ? '폭' : '길이'} ${m(Math.max(ev.shortE, ev.shortS))}m 부족)`;
    const tr = info.trials?.find((x) => x.axis === s.axis && x.perLine === s.perLine && x.pairing === s.pairing);
    lines.push(`${mark}${shapeName(s)}: ${t}${tr ? ` · 구조물 반영 실제 배치 ${tr.valid}/${tr.total}` : ''}`);
  }
  const ev = chosen.ev;
  const capped = spacing === 'max' && ev0 && chosen.ev.fits && Number.isFinite(chosen.ev.aMax) && info.maxAisle !== undefined && chosen.ev.aMax > info.maxAisle + 1e-9;
  if (capped) lines.push(`통로 최대 폭 ${m(info.maxAisle)}m 적용: 계산상 ${m(chosen.ev.aMax)}m까지 넓힐 수 있지만 상한을 넘는 남는 공간은 끝 벽 쪽 여유로 둡니다.`);
  lines.push(`적용: ${shapeName(chosen)}${auto ? ' (자동 추천)' : ''} · 통로 ${m(aisle)}m${spacing === 'max' && ev.fits && Number.isFinite(ev.aMax) ? ' (남는 폭을 고르게 나눔)' : ''} · 시작 ${start === 'zigzag' ? '지그재그' : '설정대로'}${ev.fits ? '' : ' · 창고 밖으로 나가는 랙이 있습니다'}`);
  if (info.trials) lines.push('자동 추천: 구조물이 있어 들어가는 형태를 모두 실제로 배치해 보고 창고 안 정상 랙이 가장 많은 형태를 골랐습니다.');
  if (info.obstacleCount) {
    const ob = info.obstacles ?? { moved: 0, columns: [] };
    lines.push(`구조물 ${info.obstacleCount}개 · ${ob.moved ? `장애물을 피해 ${ob.columns.join('·')}열 랙을 열 방향으로 밀었습니다(${ob.moved}회)` : '겹치는 랙 없음'} · 최대 통로 값은 구조물을 빼고 계산한 값입니다`);
  }
  if (info.missing?.length) lines.push(`누락 번호 ${info.missing.length}개: ${info.missing.slice(0, 20).join('·')}${info.missing.length > 20 ? ' …' : ''} → ${{ pack: '당겨 붙임(빈자리 없음)', keep: '빈자리 비워 둠', empty: '빈 랙 후보로 채움' }[info.gaps] ?? '당겨 붙임'}`);
  if (!shapes.some((s) => s.ev.fits)) lines.push('들어가는 형태가 없습니다. 창고 크기·통로 목표·랙 회전(북쪽 방향을 90°로 두면 회전도 함께 바꿔야 함)을 확인하세요.');
  if (chosen.axis === 'row') lines.push('행 배치: 진행·첫 랙 위치는 화면의 행 기준 이름(북→남/남→북, 서쪽 끝/동쪽 끝)대로 배치됩니다.');
  return lines;
}
