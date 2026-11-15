// 내보내기 원본(기준본 30 rackRows·historyRows·CSV 양식·reportSvg). DOM 없음. SVG·PNG·인쇄는 reportSvg 한 곳을 공유한다.
import { buildScene, esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { metrics } from '../warehouse/metrics.js';
import { legend } from '../warehouse/racklist.js';
import { ratio } from '../warehouse/constraints.js';

const NS = 'http://www.w3.org/2000/svg';
const RACK_HEADER = ['id', 'code', 'block', 'type', 'x', 'y', 'width', 'depth', 'height', 'rotation', 'capacity', 'quantity', 'unit', 'loadPercent', 'note', 'provenance'];
const HISTORY_HEADER = ['date', 'rackId', 'capacity', 'quantity', 'unit', 'source'];

export const rackCsvRows = (layout) => [RACK_HEADER, ...layout.objects.filter((o) => o.kind === 'rack').map((o) => [o.id, o.code, o.block, o.type, o.x, o.y, o.width, o.depth, o.height, o.rotation, o.capacity, o.quantity, o.unit, ratio(o), o.note, o.provenance])];

/** 기준본 70의 실효 정의: 배치(scenario) 열 포함. */
export const historyCsvRows = (project) => [['scenario', ...HISTORY_HEADER], ...project.inventoryHistory.map((o) => [o.scenario, o.date, o.rackId, o.capacity, o.quantity, o.unit, o.source])];

export const templateCsvRows = (layout, today) => [HISTORY_HEADER, ...layout.objects.filter((o) => o.kind === 'rack').map((o) => [today, o.id, '', '', o.unit, '사용자 입력'])];

export function reportSvg(project, { layout, historyDate = '', today }) {
  const W = layout.warehouse, m = metrics(layout, project), lg = legend(project.settings), width = 1500;
  const unitText = Object.entries(m.units).map(([u, t]) => u + ' ' + (t.known ? fmt(t.validQuantity / t.validCapacity * 100, 1) + '%' : '미확인') + ' (' + t.known + '/' + t.total + '랙)').join(' / ');
  const mapHeight = Math.max(340, Math.min(1900, (W.height + 2.4) / (W.width + 2.4) * 1440)), height = mapHeight + 300;
  const items = lg.items.map((k, i) => `<rect x="${30 + (i % 2) * 735}" y="${height - 100 + Math.floor(i / 2) * 28}" width="14" height="14" fill="${k.color}"/><text x="${51 + (i % 2) * 735}" y="${height - 88 + Math.floor(i / 2) * 28}" fill="#c8d8ec" font-size="14">${esc(k.text)}</text>`).join('');
  const mode = historyDate ? '재고 조회 ' + historyDate + ' / ' + (layout.layoutRecorded ? '기록 배치' : '현재 배치') : '현재 편집';
  return `<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#111821"/><g font-family="Segoe UI,Malgun Gothic,sans-serif"><text x="30" y="38" fill="#e5edf6" font-size="25" font-weight="600">${esc(project.metadata.name)}</text><text x="30" y="66" fill="#91a6be" font-size="15">작성 ${today} · 색상 ${esc(lg.title)} · ${mode} · ${project.settings.scenario.toUpperCase()} · ${W.width} × ${W.height}m · ${fmt(m.area)}㎡</text><text x="30" y="92" fill="#b9d5f5" font-size="15">랙 ${m.racks}개 / 점유율 ${fmt(m.footprint, 1)}% / 잔여 ${fmt(m.remaining)}㎡ / 경고 ${m.warnings.length}건 · ${esc(unitText)}</text><svg x="30" y="112" width="1440" height="${mapHeight}" viewBox="-1.2 -1.2 ${W.width + 2.4} ${W.height + 2.4}">${buildScene(layout, project, { report: true }).svg}</svg>${items}<text x="30" y="${height - 20}" fill="#bca989" font-size="13">${project.metadata.sample ? '샘플 치수·위치 / 실측 아님 · ' : ''}공간 검토는 사용자 지정 기준이며 하중·법규·피난 검증을 대체하지 않습니다.</text></g></svg>`;
}
