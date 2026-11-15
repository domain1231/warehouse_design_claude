// 편집 대조 결과 요약·정규화(기준본 도구와 재구축 검사가 같이 쓴다).
// 시작 상태 대비 바뀐 객체, 지운 객체, 새 명령 기록, 새 규격 이력, 경고 허용 정책, 선택을 비교 대상으로 남긴다.
import { normalizeLikeHarness } from './compare.js';

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|t-[A-Za-z0-9_-]+-[0-9a-z]{6}/;

export function normalizeEditResult(name, initial, final, selected) {
  const k = final.settings.scenario;
  const before = new Map(initial.scenarios[k].objects.map((o) => [o.id, JSON.stringify(o)]));
  const now = final.scenarios[k].objects;
  const ids = new Set(now.map((o) => o.id));
  const out = {
    name,
    changed: now.filter((o) => before.get(o.id) !== JSON.stringify(o)),
    removed: initial.scenarios[k].objects.filter((o) => !ids.has(o.id)).map((o) => o.id),
    commands: final.commandHistory.slice(initial.commandHistory.length),
    specifications: final.specificationHistory.slice(initial.specificationHistory.length),
    policy: final.settings.policy,
    allowWarnings: final.editing.allowWarnings,
    selected: [...selected].sort(),
    backups: (final.layoutBackups ?? []).length - (initial.layoutBackups ?? []).length,
    snapshots: final.layoutSnapshots.slice(initial.layoutSnapshots.length).map((s) => ({ ...s, layout: { objects: s.layout.objects.length } })),
    snapshotCount: final.layoutSnapshots.length,
    camera: { zoom: final.viewport.zoom, panX: final.viewport.panX, panY: final.viewport.panY, centerLocked: final.viewport.centerLocked },
  };
  return normalizeLikeHarness(out, { idPattern: ID });
}
