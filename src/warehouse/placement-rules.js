// D-054·D-057: 배치 후 자동 배치 기준(열·랙 간격, 벽 이격, 통로 목표) 편집용 순수 함수.
export const RULE_KEYS = ['columnGap', 'rackGap', 'wallGap', 'aisleTarget'];

const safe = (v) => (Number.isFinite(v) && v >= 0 && v <= 50 ? v : 0);

/** Excel 불러오기 입력값. 시나리오별 기록을 먼저, 없으면 프로젝트 기록. */
export const excelRuleSource = (project, key) => project.scenarioMeta?.[key]?.locationLayout ?? project.locationLayout ?? null;

/**
 * 현재 배치의 자동 배치 기준.
 * - 배치에 기록(autoPlacementRules)이 있으면 { applied: true, values }
 * - 없고 Excel 입력값이 있으면 그 값을 { applied: false, values }로(아직 검사에 쓰이지 않음, 벽 이격은 기존 검사와 같은 값)
 * - 둘 다 없거나 Excel 불러오기 이력이 없으면 null
 */
export function effectiveRules(project, layout, key) {
  if (!layout) return null;
  if (layout.autoPlacementRules) return { applied: true, values: layout.autoPlacementRules };
  // 모든 프로젝트에 기본 Excel 입력값이 있으므로, 실제 Excel 불러오기 이력이 있을 때만 그 값을 쓴다(샘플·직접 작성 배치는 비활성).
  const ll = project.importHistory?.length ? excelRuleSource(project, key) : null;
  if (!ll) return null;
  return { applied: false, values: { columnGap: safe(ll.columnGap), rackGap: safe(ll.rackGap), wallGap: safe(layout.wallGap ?? ll.wallGap), aisleTarget: safe(ll.aisleTarget) } };
}

/** 초안 프로젝트의 key 시나리오에 기준 하나를 기록한다. 기록이 없으면 Excel 입력값으로 먼저 만든다. */
export function setPlacementRule(project, key, rule, value) {
  if (!RULE_KEYS.includes(rule)) throw new Error('알 수 없는 기준');
  const l = project.scenarios[key];
  if (!l.autoPlacementRules) {
    const e = effectiveRules(project, l, key);
    if (!e) throw new Error('Excel 불러오기 후에 수정할 수 있습니다.');
    l.autoPlacementRules = { mode: 'order', ...e.values };
  }
  l.autoPlacementRules[rule] = value;
  if (rule === 'wallGap') l.wallGap = value;
}
