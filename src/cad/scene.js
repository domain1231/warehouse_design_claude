// 도면 SVG 내용 생성(DOM 없음, 문자열). 기준본 20-renderer scene + 50-editor M.objectSvg·M.overlay + 75 V.fill을 옮겼다.
// 카메라(viewBox)는 여기서 다루지 않는다. 화면은 배치·선택이 바뀔 때만 내용을 다시 만들고, 확대·이동은 viewBox만 바꾼다.
//
// 랙·ZONE 라벨(V.labels, F-019)은 labels.js. 랙 전체 이름 툴팁(V.fullLabel)은 labels.js rackFullLabel(화면 연결은 후속).
// 아직 옮기지 않은 것(후속 단계): 참고 도면 이미지(F-012), 측정점.
import { warnings as spatialWarnings, ratio } from '../warehouse/constraints.js';
import { aisleClearance } from '../geometry/clearance.js';
import { HANDLE_DIRECTIONS, handlePoint } from '../warehouse/commands.js';
import { matchRack } from '../warehouse/racklist.js';
import { bounds, triangles } from '../geometry/polygons.js';
import { OBJECT_TYPES } from '../core/project.js';
import { formatNumber as fmt } from '../core/format.js';
import { rackLabelsSvg } from './labels.js';
import { rackColor, customColor } from '../warehouse/appearance.js';

/** 기준본 V.objectDefault: 랙 외 객체 기본 색. */
export const OBJECT_COLORS = Object.freeze({ wall: '#9aaec7', column: '#b1c2d5', aisle: '#19423d', work: '#364663', blocked: '#665041', door: '#374b67' });
/** 기준본 V.themeDefault 중 도면에 쓰는 값. */
export const THEME_DEFAULT = Object.freeze({ floor: '#152231', selected: '#c4ddff' });
/** 그리기 순서: 바닥 구역 → 구조물 → 랙. */
const ORDER = { aisle: 0, work: 1, blocked: 2, wall: 3, column: 4, door: 5, rack: 6 };
const DASHED = new Set(['aisle', 'blocked', 'work', 'door']);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 적재 상태(기준본 loadState). 기준값은 settings.low / settings.high(%). */
export function loadState(o, settings) {
  const r = ratio(o);
  return r === null ? 'unknown' : r === 0 ? 'empty' : r < settings.low ? 'low' : r < settings.high ? 'mid' : r <= 100 ? 'high' : 'over';
}

/** 선택된 객체들의 외곽 상자(기준본 M.box). */
export function selectionBox(objects) {
  if (!objects.length) return null;
  const bs = objects.map(bounds);
  const minX = Math.min(...bs.map((b) => b.minX)), maxX = Math.max(...bs.map((b) => b.maxX));
  const minY = Math.min(...bs.map((b) => b.minY)), maxY = Math.max(...bs.map((b) => b.maxY));
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function objectShape(o, fill, stroke, sel, aisle, custom) {
  if (o.kind === 'aisle' && aisle) {
    fill = aisle.severity === 'bad' ? '#8d3543' : aisle.severity === 'target' ? '#98612e' : '#24615b';
    stroke = aisle.severity === 'bad' ? '#ff7c8b' : aisle.severity === 'target' ? '#ffc078' : sel ? '#c4ddff' : '#64b9b1';
  }
  if (custom && o.kind !== 'rack') fill = custom; // 기준본 M.objectSvg: 통로 상태 색 뒤에 지정 색 적용
  const props = `fill="${fill}" fill-opacity="${o.kind === 'rack' ? 1 : 0.4}" stroke="${stroke}" stroke-width="${sel ? 0.075 : 0.035}" ${DASHED.has(o.kind) ? 'stroke-dasharray=".13 .08"' : ''}`;
  if (o.vertices) {
    const raw = o.vertices.map(([u, v]) => [o.x + u * o.width, o.y + v * o.depth]);
    const tri = triangles(raw)[0];
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    return `<polygon points="${raw.map((p) => p.join(',')).join(' ')}" ${props}/><text x="${cx}" y="${cy}" font-size=".2" fill="#d7e9ee" text-anchor="middle">${esc(o.code)}</text>`;
  }
  return `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.depth}" rx="${o.kind === 'rack' ? 0.055 : 0}" ${props}/>`;
}

/**
 * 배치 하나의 SVG 내용.
 * @param {object} layout  project.scenarios[scope]
 * @param {object} project 설정·테마·간격 기준
 * @param {{ scope?: 'before'|'after', selected?: Set<string>, tool?: string, marquee?: {a,b}|null, warnings?: object[], guides?: object[], pixelsPerMeter?: number }} opt
 *   guides: 드래그 중 정렬 가이드(commands.alignmentGuides). 선 굵기·글자 크기는 화면 px 기준이라 pixelsPerMeter가 필요하다.
 *   filter: project.panels.view — 검색·필터에 맞지 않는 랙을 흐리게(기준본 match, 불투명도 0.2).
 *   resize: { live: boolean, invalidText?: string } — 객체 1개를 선택 도구로 골랐을 때 8방향 크기 조절 핸들(기준본 65)을 그린다.
 *   report / mini: 보고서·미니맵용(라벨 배율·최소 모드 처리가 다르다).
 * @returns {{ svg: string, warnings: object[], labelHidden: number }}
 */
export function buildScene(layout, project, { scope = project.settings.scenario, selected = new Set(), tool = 'select', marquee = null, warnings, guides = [], pixelsPerMeter = 20, resize = null, filter = null, report = false, mini = false } = {}) {
  const W = layout.warehouse, st = project.settings;
  const ws = warnings ?? spatialWarnings(layout, project);
  const bad = new Set(ws.flatMap((w) => w.ids));
  const aisles = new Map(layout.objects.filter((o) => o.kind === 'aisle').map((o) => [o.id, aisleClearance(o, layout)]));
  const selColor = project.theme?.customColors?.selected || THEME_DEFAULT.selected;
  let s = `<defs><pattern id="pgrid" width="${st.grid}" height="${st.grid}" patternUnits="userSpaceOnUse"><path d="M ${st.grid} 0 L 0 0 0 ${st.grid}" fill="none" stroke="#2a3c51" stroke-width=".012"/></pattern></defs>`;
  s += `<rect x="0" y="0" width="${W.width}" height="${W.height}" fill="${project.theme?.customColors?.floor || THEME_DEFAULT.floor}"/>`;
  if (st.gridOn) s += `<rect width="${W.width}" height="${W.height}" fill="url(#pgrid)" pointer-events="none"/>`;
  s += `<rect width="${W.width}" height="${W.height}" fill="none" stroke="#9fb4cc" stroke-width=".1"/>`;
  s += `<text x="${W.width / 2}" y="-.45" text-anchor="middle" font-size=".3" fill="#a7bfdc">${fmt(W.width)} m</text>`;
  s += `<text x="-.5" y="${W.height / 2}" text-anchor="middle" transform="rotate(-90 -.5 ${W.height / 2})" font-size=".3" fill="#a7bfdc">${fmt(W.height)} m</text>`;
  const cursor = tool === 'select' ? 'grab' : 'crosshair';
  for (const o of [...layout.objects].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) {
    const sel = selected.has(o.id), cx = o.x + o.width / 2, cy = o.y + o.depth / 2, isRack = o.kind === 'rack';
    const fill = isRack ? rackColor(o, project, scope) : OBJECT_COLORS[o.kind];
    const stroke = bad.has(o.id) ? '#ff7885' : sel ? selColor : isRack ? '#a4c7ed' : '#627d97';
    s += `<g data-id="${esc(o.id)}" opacity="${filter && !matchRack(o, filter) ? 0.2 : 1}" transform="rotate(${o.rotation} ${cx} ${cy})" style="cursor:${cursor}"><title>${esc(o.code + ' · ' + OBJECT_TYPES[o.kind])}</title>${objectShape(o, fill, stroke, sel, aisles.get(o.id), customColor(project, scope, o))}`;
    if (isRack) {
      s += `<path d="M ${o.x + 0.05} ${o.y + 0.12} H ${o.x + o.width - 0.05}" stroke="#d9e8ff" stroke-opacity=".35" stroke-width=".025"/>`;
      if (bad.has(o.id)) s += `<g transform="rotate(${-o.rotation} ${cx} ${cy})" pointer-events="none"><text x="${cx}" y="${cy - 0.12}" fill="#ff7885" font-size=".18">⚠</text></g>`;
    } else if (o.kind === 'door') {
      const right = o.swing.endsWith('right'), out = o.swing.startsWith('out'), r = Math.min(o.width, o.depth);
      const hx = right ? o.x : o.x + o.width, hy = out ? o.y + o.depth : o.y, dx = right ? r : -r, dy = out ? -r : r;
      s += `<path d="M ${hx} ${hy} l ${dx} 0 A ${r} ${r} 0 0 ${right === out ? 0 : 1} ${hx} ${hy + dy} Z" fill="#7ea6d0" fill-opacity=".12" stroke="#b3cae4" stroke-width=".025"/>`;
    }
    if (!isRack && !o.vertices) s += `<g transform="rotate(${-o.rotation} ${cx} ${cy})"><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#c7d9ed" font-size="${Math.min(0.22, o.width / (Math.max(o.code.length, 4) * 0.7))}">${esc(o.code)}</text></g>`;
    s += '</g>';
  }
  const labels = rackLabelsSvg(layout, project, { scope, selected, pixelsPerMeter, report, mini, fillOf: (o) => rackColor(o, project, scope) });
  s += labels.svg;
  // 겹침 표시(기준본 M.overlay): 통로 최소 유효 폭 선, 다중 선택 상자, 영역 선택 사각형.
  for (const r of aisles.values()) {
    if (!r.line || !r.enabled) continue;
    const [a, b] = r.line, c = r.severity === 'bad' ? '#ff8290' : r.severity === 'target' ? '#ffd08b' : '#8ee8cb';
    s += `<g class="m-overlay" pointer-events="none"><path d="M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}" fill="none" stroke="${c}" stroke-width=".055"/><text x="${(a[0] + b[0]) / 2 + 0.04}" y="${(a[1] + b[1]) / 2 - 0.1}" font-size=".2" fill="${c}">${r.severity === 'bad' ? '⚠ ' : ''}${fmt(r.width, 2)}m / 최소 ${fmt(r.min)}m</text></g>`;
  }
  const racks = layout.objects.filter((o) => o.kind === 'rack' && selected.has(o.id));
  const box = selectionBox(racks);
  if (racks.length > 1 && box) {
    const warn = ws.some((w) => w.spatial && w.ids.some((id) => selected.has(id)));
    const c = warn ? '#ff7885' : '#91c9ff';
    s += `<g class="m-overlay" pointer-events="none"><rect x="${box.minX - 0.08}" y="${box.minY - 0.08}" width="${box.width + 0.16}" height="${box.depth + 0.16}" fill="none" stroke="${c}" stroke-width=".04" stroke-dasharray=".17 .1"/><text x="${box.minX}" y="${box.minY - 0.16}" font-size=".25" fill="${c}">${racks.length}개 랙 · 면적 ${fmt(racks.reduce((n, o) => n + o.width * o.depth, 0), 3)}㎡</text></g>`;
  }
  if (marquee) {
    const { a, b } = marquee;
    s += `<rect id="mSelectionBox" class="m-overlay" pointer-events="none" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(a.x - b.x)}" height="${Math.abs(a.y - b.y)}" fill="#80b3f1" fill-opacity=".15" stroke="#a8d2ff" stroke-width=".035" stroke-dasharray=".1 .06"/>`;
  }
  if (guides.length && project.precision?.guides) s += guideSvg(guides, pixelsPerMeter);
  if (resize && selected.size === 1 && tool === 'select') {
    const o = layout.objects.find((x) => selected.has(x.id));
    if (o) s += handleSvg(o, pixelsPerMeter, resize);
  }
  return { svg: s, warnings: ws, labelHidden: labels.hidden };
}

/** 정렬 가이드(기준본 Q.guideSvg 중 가이드 부분). 가까운 랙 거리 표시(Q.nearest)는 아직 옮기지 않았다. */
function guideSvg(guides, pixelsPerMeter) {
  const u = Math.max(0.01, pixelsPerMeter), font = 11 / u;
  let out = '<g class="q-guide" pointer-events="none">';
  for (const g of guides) {
    if (g.type === 'x' || g.type === 'y') {
      const x = g.type === 'x' ? g.value : g.from, y = g.type === 'x' ? g.from : g.value;
      out += `<path data-guide="${g.type}" d="${g.type === 'x' ? `M ${g.value} ${g.from} V ${g.to}` : `M ${g.from} ${g.value} H ${g.to}`}" stroke="#75f0d4" stroke-width="${1.2 / u}" stroke-dasharray="${5 / u} ${3 / u}" fill="none"/><text x="${x + 4 / u}" y="${y - 4 / u}" fill="#b3fbea" font-size="${font}">${esc(g.label)} · 차이 ${fmt(Math.abs(g.delta), 3)}m</text>`;
    } else {
      const b = g.bounds;
      out += `<text data-guide="${g.type}" x="${b.cx}" y="${b.maxY + 0.25}" text-anchor="middle" fill="#a9f2dc" font-size="${font}">${esc(g.label)} · 차이 ${fmt(Math.abs(g.delta) * 2, 3)}m</text>`;
    }
  }
  return out + '</g>';
}

/** 8방향 크기 조절 핸들과 조절 중 크기·경고 표시(기준본 65 scene 래퍼). 핸들 크기는 화면 px 고정. */
function handleSvg(o, pixelsPerMeter, { live = false, invalidText = '' } = {}) {
  const u = Math.max(0.01, pixelsPerMeter), r = 5 / u, hit = 12 / u;
  let out = '';
  for (const [key, [sx, sy]] of Object.entries(HANDLE_DIRECTIONS)) {
    const p = handlePoint(o, sx, sy);
    out += `<g class="s-handle" data-resize="${key}" data-object="${esc(o.id)}" style="cursor:${key.length === 2 ? (key === 'nw' || key === 'se' ? 'nwse' : 'nesw') : key === 'n' || key === 's' ? 'ns' : 'ew'}-resize"><title>${key} · 크기 조절</title><rect x="${p.x - hit}" y="${p.y - hit}" width="${2 * hit}" height="${2 * hit}" fill="transparent"/><rect x="${p.x - r}" y="${p.y - r}" width="${2 * r}" height="${2 * r}" fill="#daeaff" stroke="#277acc" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/></g>`;
  }
  if (live) {
    const b = bounds(o);
    out += `<text class="s-live" data-testid="resize-live" x="${b.minX}" y="${b.minY - 0.12}" fill="${invalidText ? '#ff9aa5' : '#d9efff'}" font-size="${14 / u}">${fmt(o.width, 3)} × ${fmt(o.depth, 3)}m${invalidText ? ' · ' + esc(invalidText) : ''}</text>`;
  }
  return out;
}
