// 다중 랙 편집 패널의 계산(기준본 50 M.groupPanel). DOM 없음.
import { selectionBox } from '../cad/scene.js';
import { unitTotals } from './metrics.js';

/** 12개 그룹 동작 단추(기준본 순서·문구). 키는 commands.GROUP_ACTIONS와 같다. */
export const GROUP_BUTTONS = Object.freeze([
  ['move', '그룹 이동'], ['rotate', '그룹 중심 회전'], ['left', '왼쪽 정렬'], ['right', '오른쪽 정렬'], ['top', '위쪽 정렬'], ['bottom', '아래쪽 정렬'],
  ['centerX', '가로 가운데'], ['centerY', '세로 가운데'], ['lineX', '가로 일렬'], ['lineY', '세로 일렬'], ['spaceX', '가로 간격'], ['spaceY', '세로 간격'],
]);

/**
 * 선택 랙 요약. warnings는 현재 배치의 전체 공간 경고({ key, ids }), selected는 선택 ID 집합.
 * 외곽 = 회전한 각 랙의 외접 경계를 합친 상자.
 * @returns {{ count: number, width: number, depth: number, area: number, spaceWarnings: number, aisleWarnings: number, units: { unit: string, capacity: number, known: number, total: number }[] }}
 */
export function groupStats(racks, warnings, selected) {
  const box = selectionBox(racks);
  const mine = warnings.filter((w) => w.ids.some((id) => selected.has(id)));
  return {
    count: racks.length,
    width: box.width,
    depth: box.depth,
    area: racks.reduce((n, o) => n + o.width * o.depth, 0),
    spaceWarnings: mine.length,
    aisleWarnings: mine.filter((w) => w.key.startsWith('aisle-')).length,
    units: Object.entries(unitTotals(racks)).map(([unit, t]) => ({ unit, capacity: t.capacity, known: t.capacityKnown, total: t.total })),
  };
}

/** 현재 좌표 CSV 행(selected_rack_positions.csv, 기준본 mGroupExport). 좌표는 저장값 그대로. */
export const selectedCsvRows = (racks) => [['id', 'code', 'x', 'y', 'rotation', 'width', 'depth', 'height'], ...racks.map((o) => [o.id, o.code, o.x, o.y, o.rotation, o.width, o.depth, o.height])];
export const SELECTED_CSV_NAME = 'selected_rack_positions.csv';

/** 최근 편집 명령 n개(최신 먼저). */
export const recentCommands = (history, n = 8) => history.slice(-n).reverse();
