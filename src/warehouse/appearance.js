// 색 표시 모드·임계값/색·사용자 지정 색·기본 색 복원(기준본 40 EX.height/value/state/color, 75 V.fill·applyColors·resetColors·객체 색). DOM 없음.
import { ratio } from './constraints.js';
import { COLORS_DEFAULT } from '../core/project.js';

/** 기준본 EX.height: 선반별 자재 높이/선반 높이. 한 선반의 높이가 섞이거나 값이 없으면 null. */
export function heightUtilization(o, policy) {
  const e = o?.excel;
  if (!e?.shelves?.length) return null;
  const valid = e.shelves.map((s) => {
    const v = s.items.filter((i) => i.shelfHeight > 0 && i.materialHeight !== null && Number.isFinite(i.materialHeight)).map((i) => ({ r: (i.materialHeight / i.shelfHeight) * 100, h: i.shelfHeight, p: i.materialHeight }));
    if (!v.length) return null;
    const hs = [...new Set(v.map((x) => x.h))];
    return hs.length !== 1 ? null : { r: Math.max(...v.map((x) => x.r)), h: hs[0], p: Math.max(...v.map((x) => x.p)) };
  });
  if (valid.some((v) => v === null)) return null;
  return policy === 'max' ? Math.max(...valid.map((v) => v.r)) : policy === 'meanMax' ? valid.reduce((a, v) => a + v.r, 0) / valid.length : (valid.reduce((a, v) => a + v.p, 0) / valid.reduce((a, v) => a + v.h, 0)) * 100;
}

/** 기준본 V.fill: 사용자 지정 색 모드에서 객체별 지정 색이 있으면 우선. */
export const customColor = (project, scope, o) => (project.theme?.colorMode === 'custom' && project.theme.objectColors?.[scope]?.[o.id]) || null;

/** 기준본 EX.color + V.fill 래퍼: 표시 모드별 데이터 색, 사용자 지정 색 우선. */
export function rackColor(o, project, scope = project.settings.scenario) {
  const st = project.settings, c = { ...COLORS_DEFAULT, ...st.colors }, mode = st.vizMode ?? 'inventory';
  let data;
  if (mode === 'registered') data = c[o.excel?.shelves.some((s) => s.items.length) ? 'low' : 'unknown'];
  else if (mode === 'management') data = c[o.excel ? 'mid' : 'unknown'];
  else {
    const r = mode === 'height' ? heightUtilization(o, st.heightPolicy ?? 'weightedMax') : ratio(o);
    data = c[r === null ? 'unknown' : r === 0 ? 'empty' : r < st.low ? 'low' : r < st.high ? 'mid' : r <= 100 ? 'high' : 'over'];
  }
  return customColor(project, scope, o) || data;
}

/** 기준본 applyColors. 범위·형식 검증은 validateProject가 한다. */
export function applyThresholdColors(draft, { low, high, colors }) {
  draft.settings.low = Number(low);
  draft.settings.high = Number(high);
  for (const k of Object.keys(COLORS_DEFAULT)) draft.settings.colors[k] = colors[k];
}

/** 기준본 지정색 적용(color)/해제(null). 적용하면 사용자 지정 색 모드가 된다. */
export function setObjectColor(draft, id, color) {
  const map = draft.theme.objectColors[draft.settings.scenario];
  if (color === null) delete map[id];
  else {
    map[id] = color;
    draft.theme.colorMode = 'custom';
  }
}

export function setColorMode(draft, mode) {
  draft.theme.colorMode = mode;
}

/** 기준본 V.resetColors의 변경 부분. scope: 'ui' | 'occupancy' | 'all'. */
export function resetColors(draft, scope) {
  if (scope === 'ui' || scope === 'all') {
    draft.theme.customColors = {};
    draft.theme.presetId = 'original';
  }
  if (scope === 'occupancy' || scope === 'all') {
    draft.settings.colors = { ...COLORS_DEFAULT };
    draft.settings.low = 50;
    draft.settings.high = 90;
  }
  if (scope === 'all') {
    draft.theme.objectColors = { before: {}, after: {} };
    draft.theme.colorMode = 'data';
  }
}
