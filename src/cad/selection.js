// 선택 규칙(기준본 50-editor 선택 도구). 선택은 화면 상태지만 기준본처럼 프로젝트 editing.selectedRackIds에 저장된다.
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { polygon } from '../geometry/polygons.js';
import { overlaps } from '../geometry/collision.js';

/**
 * 객체 클릭. Ctrl/⌘(또는 터치 다중 선택 유지)는 토글, Shift는 추가, 그 외에는 이미 선택된 객체면 유지하고 아니면 단독 선택.
 * @returns {Set<string>} 새 선택(입력은 바꾸지 않는다)
 */
export function clickSelect(selected, id, { toggle = false, add = false } = {}) {
  const next = new Set(selected);
  if (toggle) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  if (add) return next.add(id);
  return next.has(id) ? next : new Set([id]);
}

/**
 * 영역 선택: 두 점(월드 m) 사각형과 랙을 비교한다. rule 'intersect'는 겹치면, 'contain'은 꼭짓점이 모두 안에 있으면 포함. '-all' 접미 규칙은 랙 외 모든 객체도 대상.
 * 폭·깊이가 허용오차 이하인 사각형(클릭)은 아무것도 고르지 않는다. add면 이전 선택에 더한다.
 */
export function marqueeSelect(objects, a, b, { rule = 'intersect', previous = [], add = false } = {}) {
  const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), depth: Math.abs(a.y - b.y), rotation: 0 };
  const ids = [], all = rule.endsWith('-all'), contain = rule.startsWith('contain');
  if (rect.width > EPS && rect.depth > EPS) {
    for (const o of objects) {
      if (!all && o.kind !== 'rack') continue;
      const inside = contain
        ? polygon(o).every(([x, y]) => x >= rect.x - EPS && x <= rect.x + rect.width + EPS && y >= rect.y - EPS && y <= rect.y + rect.depth + EPS)
        : overlaps(rect, o);
      if (inside) ids.push(o.id);
    }
  }
  return new Set([...(add ? previous : []), ...ids]);
}

/** 저장된 선택을 현재 배치에 맞춘다(없는 ID 제거, 다른 배치에서 저장된 선택은 버림). 기준본 save/renderAll 래퍼. */
export function restoreSelection(project) {
  const e = project.editing;
  if (e.selectionScenario !== project.settings.scenario) return new Set();
  const ids = new Set(project.scenarios[project.settings.scenario].objects.map((o) => o.id));
  return new Set(e.selectedRackIds.filter((id) => ids.has(id)));
}
