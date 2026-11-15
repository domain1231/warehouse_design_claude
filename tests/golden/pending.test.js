// 아직 재구축되지 않은 Golden Master 시나리오. 구현되면 해당 항목을 별도 테스트 파일로 옮긴다.
import { test } from 'node:test';
import { loadScenario } from './compare.js';

const pending = {
  G2: 'Phase 2 — 공간 경고·W.scan (geometry/clearance, warehouse/constraints)',
  G3: 'Phase 5 — Excel 분석 (excel/*)',
  G4: 'Phase 6 — 자동 배치 (placement/*)',
};

for (const [id, phase] of Object.entries(pending)) {
  const scenario = loadScenario(id);
  test(`${id} ${scenario.title}`, { todo: phase }, () => {});
}
