// 랙·ZONE 라벨(F-019). 기준본 80 Q.parts·V.fullLabel·V.labels, 75 V.textColor·V.measure·기본 V.fullLabel을 옮겼다. DOM 없음(문자열).
// 글자 폭: 브라우저는 기준본처럼 canvas measureText. canvas가 없으면(Node) setFallbackMeasure로 주입한 함수를 쓴다
// (기준본 대조 검사는 tests/golden/label-metrics.js의 Chrome 측정 표를 주입한다. 배포본에는 표를 넣지 않는다).
import { bounds } from '../geometry/polygons.js';
import { ratio } from '../warehouse/constraints.js';
import { formatNumber as fmt } from '../core/format.js';
import { esc } from './scene.js';

/** 기준본 Q.parts: 랙의 ZONE·번호·로케이션(표시 이름 반영). */
export function rackLabelParts(o, project, scope = project.settings.scenario) {
  const match = /^(.*?)[-\s]+(\d+)$/.exec(o.code);
  const rawZone = o.excel?.column || o.block || match?.[1] || o.code;
  const rawNumber = o.excel?.rackNumber ?? (match ? Number(match[2]) : null);
  const key = o.excel ? [o.excel.building, o.excel.floor, rawZone].join('|') : 'block|' + rawZone;
  const names = project.rackLabels.zoneNames[scope];
  const zone = Object.hasOwn(names, key) ? names[key] : rawZone;
  const number = rawNumber === null ? '' : String(rawNumber).padStart(project.rackLabels.numberPadding, '0');
  return { zone, rawZone, number, key, scope, code: o.code, location: o.excel?.key || o.code };
}

/** 기준본 75 V.fullLabel(기본형). */
const baseFullLabel = (o) => [o.code, o.excel?.key, ratio(o) === null ? '실제 적재율 미확인' : '실제 적재율 ' + fmt(ratio(o), 1) + '%', fmt(o.width, 3) + ' × ' + fmt(o.depth, 3) + 'm'].filter(Boolean).join(' · ');

/** 기준본 80 V.fullLabel: 도면 툴팁용 전체 이름. */
export function rackFullLabel(o, project, scope = project.settings.scenario) {
  const p = rackLabelParts(o, project, scope);
  return 'ZONE ' + p.zone + ' (원본 ' + p.rawZone + ') · 랙 ' + p.number + ' · ' + baseFullLabel(o);
}

/** 기준본 V.textColor: 배경색 대비가 큰 글자색. */
export function textColor(hex) {
  const rgb = hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
}

let canvasContext;
let fallbackMeasure = (text, font) => [...text].length * font * 0.6;
/** canvas가 없는 환경(Node 검사)의 글자 폭 함수를 바꾼다. */
export function setFallbackMeasure(fn) {
  fallbackMeasure = fn;
}
/** 기준본 V.measure. */
export function measureText(text, font) {
  if (canvasContext === undefined) canvasContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (canvasContext) {
    canvasContext.font = '600 ' + font + 'px "Segoe UI","Malgun Gothic",sans-serif';
    return canvasContext.measureText(text).width;
  }
  return fallbackMeasure(text, font);
}

/** 라벨 상태 문구(기준본 vLabelStatus). hidden: 공간이 없어 표식으로 대체된 랙 수. */
export const labelStatusText = (hidden) => (hidden ? '공간 부족 ' + hidden + '개 · 확대/선택 정보에서 전체 ZONE·번호 확인' : 'ZONE·번호 수평 표시 · 자동 크기/겹침 검토');

/**
 * 기준본 V.labels. 배치의 랙 라벨 SVG와 표식으로 대체된 개수.
 * @param {{ scope?: string, selected?: Set<string>, pixelsPerMeter: number, report?: boolean, mini?: boolean, fillOf: (o: object) => string, measure?: Function }} opt
 *   fillOf: 랙 본체 색(기준본 EX.color). pixelsPerMeter: 화면 확대율(기준본 M.size().w / viewBox().w).
 */
export function rackLabelsSvg(layout, project, { scope = project.settings.scenario, selected = new Set(), pixelsPerMeter, report = false, mini = false, fillOf, measure: measureFn = measureText }) {
  const W = layout.warehouse;
  const racks = layout.objects.filter((o) => o.kind === 'rack').sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  const mode = project.rackLabels.displayMode, mlayout = project.rackLabels.layoutMode;
  const u = report ? Math.min(1400 / (W.width + 2.4), 900 / (W.height + 2.4)) : mini ? Math.min(400 / (W.width + 2.4), 250 / (W.height + 2.4)) : pixelsPerMeter;
  const min = mini ? 7 : 10, max = mini ? 9 : 14, placed = [], waiting = [];
  const obstacles = layout.objects.filter((o) => !['aisle', 'work'].includes(o.kind)).map(bounds);
  let out = '', hidden = 0;
  const intersects = (a, b) => a.x < b.x + b.w + 0.02 && a.x + a.w + 0.02 > b.x && a.y < b.y + b.h + 0.02 && a.y + a.h + 0.02 > b.y;
  const box = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
  const size = (lines, font) => ({ w: (Math.max(...lines.map((t) => measureFn(t, font))) + 8) / u, h: (lines.length * font * 1.22 + 5) / u });
  const fits = (o, b) => {
    const a = -o.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = o.x + o.width / 2, cy = o.y + o.depth / 2;
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([x, y]) => Math.abs((x - cx) * c - (y - cy) * s) <= o.width / 2 - 0.02 && Math.abs((x - cx) * s + (y - cy) * c) <= o.depth / 2 - 0.02);
  };
  const draw = (o, part, lines, font, cx, cy, b, external, style) => {
    placed.push(b);
    const fill = external ? '#111821' : fillOf(o), color = textColor(fill);
    return `<g class="v-labels" data-label-for="${esc(o.id)}" data-zone="${esc(part.zone)}" data-rack-number="${esc(part.number)}" data-label-layout="${style}" data-label-fallback="${external ? 'external' : 'internal'}" data-label-cx="${cx}" data-label-cy="${cy}">${external ? `<path d="M ${o.x + o.width / 2} ${o.y + o.depth / 2} L ${cx} ${cy}" stroke="#b9cce3" stroke-width="${1 / u}"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${3 / u}" fill="${fill}" stroke="#8ba3bf" stroke-width="${1 / u}"/>` : ''}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-family="Segoe UI,Malgun Gothic,sans-serif" font-weight="600" font-size="${font / u}">${lines.map((t, i) => `<tspan x="${cx}" dy="${i ? font * 1.22 / u : -(lines.length - 1) * font * 0.61 / u}" data-line="${i}">${esc(t)}</tspan>`).join('')}</text></g>`;
  };
  for (const o of racks) {
    if ((mlayout === 'minimal' || mode === 'minimal') && (!selected.has(o.id) || report || mini)) continue;
    const p = rackLabelParts(o, project, scope), cx = o.x + o.width / 2, cy = o.y + o.depth / 2, b = bounds(o), narrow = b.maxX - b.minX < b.maxY - b.minY;
    const stacked = p.number ? [p.zone, p.number] : [p.zone], inline = [p.number ? p.zone + '-' + p.number : p.zone];
    const basis = mlayout === 'stacked' || (mlayout === 'auto' && narrow) ? [[stacked, 'stacked'], [inline, 'inline']] : [[inline, 'inline'], [stacked, 'stacked']];
    const ratioText = ratio(o) === null ? '재고 미확인' : fmt(ratio(o), 1) + '%';
    const tail = mode === 'occupancy' ? [ratioText] : mode === 'detail' ? [p.location, ratioText, fmt(o.width, 3) + ' × ' + fmt(o.depth, 3) + 'm'] : [];
    let drawn = false;
    const variants = mlayout === 'stacked' ? [[stacked, 'stacked']] : mlayout === 'inline' ? [[inline, 'inline']] : basis;
    for (const [head, style] of variants) {
      for (const lines of [[...head, ...tail], head]) {
        for (let font = max; font >= min; font--) {
          const sz = size(lines, font), bx = box(cx, cy, sz.w, sz.h);
          if (fits(o, bx) && !placed.some((r) => intersects(bx, r))) { out += draw(o, p, lines, font, cx, cy, bx, false, style); drawn = true; break; }
        }
        if (drawn) break;
      }
      if (drawn) break;
    }
    if (!drawn && p.zone.length > 6) {
      const brief = [p.zone.slice(0, 5) + '…', p.number].filter(Boolean);
      for (let font = max; font >= min; font--) {
        const sz = size(brief, font), bx = box(cx, cy, sz.w, sz.h);
        if (fits(o, bx) && !placed.some((r) => intersects(bx, r))) { out += draw(o, p, brief, font, cx, cy, bx, false, 'abbreviated'); drawn = true; break; }
      }
    }
    if (!drawn) waiting.push({ o, p, cx, cy, b });
  }
  for (const { o, p, cx, cy, b } of waiting) {
    const shortZone = p.zone.length > 18 ? p.zone.slice(0, 17) + '…' : p.zone;
    const lines = mlayout === 'inline' ? [p.number ? shortZone + '-' + p.number : shortZone] : [shortZone, p.number].filter(Boolean);
    const font = min + 1, sz = size(lines, font), w = sz.w, h = sz.h;
    const candidates = [[cx, b.minY - h / 2 - 0.06], [cx, b.maxY + h / 2 + 0.06], [b.maxX + w / 2 + 0.06, cy], [b.minX - w / 2 - 0.06, cy]];
    for (let ring = 1; ring <= 3; ring++) for (let side = 0; side < 8; side++) { const a = side * Math.PI / 4; candidates.push([cx + Math.cos(a) * (w + 0.1) * ring, cy + Math.sin(a) * (h + 0.1) * ring]); }
    let found = false;
    for (const [x, y] of candidates) {
      const bx = box(x, y, w, h);
      if (Math.hypot((x - cx) * u, (y - cy) * u) > 80 || bx.x < -0.85 || bx.y < -0.85 || bx.x + w > W.width + 0.85 || bx.y + h > W.height + 0.85 || placed.some((r) => intersects(bx, r)) || obstacles.some((r) => intersects(bx, { x: r.minX, y: r.minY, w: r.maxX - r.minX, h: r.maxY - r.minY }))) continue;
      out += draw(o, p, lines, font, x, y, bx, true, mlayout === 'inline' ? 'inline' : 'stacked');
      found = true;
      break;
    }
    if (!found) {
      hidden++;
      out += `<g class="v-labels" data-label-for="${esc(o.id)}" data-zone="${esc(p.zone)}" data-rack-number="${esc(p.number)}" data-label-layout="tooltip" data-label-fallback="tooltip"><circle cx="${cx}" cy="${cy}" r="${2 / u}" fill="${textColor(fillOf(o))}"/></g>`;
    }
  }
  return { svg: out, hidden };
}
