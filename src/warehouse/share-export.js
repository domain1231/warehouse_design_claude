// E8(D-095): 공유용 JSON(이력 제외). DOM 없음.
// 남기는 것: 현재 BEFORE·AFTER 배치와 배치 정보(Excel 출처·기준일·면적 기준), 각 배치의 최신 Excel 기준일 스냅샷, 설정·보기·범례 등 이력이 아닌 값.
// 빼는 것: 배치 백업, 자동 배치 확인 이력, 명령 이력, 가져오기 기록, 재고 이력, 규격 변경 이력, 배치 개정 기록, 그 밖 기준일 스냅샷.
// 비교 화면 지표는 현재 배치·Excel 행으로 계산하므로(이력을 쓰지 않음) 결론 문장이 원본과 같다.

export const SHARE_DROPS = Object.freeze(['layoutBackups', 'commandHistory', 'importHistory', 'inventoryHistory', 'specificationHistory', 'layoutRevisions']);
const SCENARIOS = ['before', 'after'];

/** 배치별로 남길 기준일: 최신 Excel 기준일(sourceInfo.asOf), 없으면 가장 최근 스냅샷 기준일. */
function shareDate(p, k) {
  const asOf = p.scenarioMeta?.[k]?.sourceInfo?.asOf;
  if (typeof asOf === 'string') return asOf;
  const dates = [...(p.layoutSnapshots ?? []), ...(p.excelSnapshots ?? [])].filter((s) => s?.scenario === k && typeof s.date === 'string').map((s) => s.date).sort();
  return dates.at(-1) ?? null;
}

/** 공유용 사본(입력은 바꾸지 않는다). removed: 항목별로 뺀 개수. */
export function shareProject(project) {
  const p = structuredClone(project);
  const removed = {};
  const keepDate = Object.fromEntries(SCENARIOS.map((k) => [k, shareDate(p, k)]));
  for (const kind of ['layoutSnapshots', 'excelSnapshots']) {
    const list = Array.isArray(p[kind]) ? p[kind] : [];
    const next = list.filter((s) => SCENARIOS.includes(s?.scenario) && s.date === keepDate[s.scenario]);
    removed[kind] = list.length - next.length;
    p[kind] = next;
  }
  for (const key of SHARE_DROPS) {
    removed[key] = Array.isArray(p[key]) ? p[key].length : 0;
    p[key] = [];
  }
  if (Array.isArray(p.autoPlacement?.history)) {
    removed.autoPlacementHistory = p.autoPlacement.history.length;
    p.autoPlacement.history = [];
  }
  return { project: p, removed, keepDate };
}
