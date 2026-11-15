// S2: BEFORE→AFTER 복제·백업 복원·비교표·랙 변경 행을 기준본 v2.4.1 결과(fixtures/legacy/scenario-cases.json, tools/scenario-diff.mjs)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scenarioCases } from './scenario-cases.js';
import { diff, formatDiff, normalizeLikeHarness } from './compare.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { cloneBeforeToAfter, restoreBackup, compareRows, diffRows, rackDiff } from '../../src/warehouse/scenarios.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/scenario-cases.json', import.meta.url), 'utf8')).cases;
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|t-[A-Za-z0-9_-]+-[0-9a-z]{6}/;
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const dropTime = (v) => JSON.parse(JSON.stringify(v, (k, x) => (['time', 'createdAt', 'editedAt', 'recordedAt', 'importedAt'].includes(k) ? undefined : x)));

test('S2 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), scenarioCases.map((c) => c.name));
});

for (const c of scenarioCases) {
  test(`S2 ${c.name}`, () => {
    const nextId = createIdGenerator({ seed: 'scenario' }), now = () => '2026-11-15T00:00:00.000Z';
    let p = validateProject(JSON.parse(projectText));
    let undo = 0;
    const out = [];
    const racks = (k) => p.scenarios[k].objects.filter((o) => o.kind === 'rack');
    for (const s of c.steps) {
      if (s === 'snapshot') {
        const { scenarios, scenarioMeta, layoutBackups, layoutRevisions, excelSnapshots, layoutSnapshots, inventoryHistory, settings, editing, theme, rackLabels, autoPlacement } = structuredClone(p);
        out.push({ compare: compareRows(p).map((r) => r.map(String)), diffRows: diffRows(rackDiff(p.scenarios.before, p.scenarios.after)), project: { scenarios, scenarioMeta, layoutBackups, layoutRevisions, excelSnapshots, layoutSnapshots, inventoryHistory, scenario: settings.scenario, selection: editing.selectedRackIds, objectColors: theme.objectColors, zoneNames: rackLabels.zoneNames, autoSettings: autoPlacement.settings, reviewNotes: autoPlacement.reviewNotes }, undo });
      } else if (s.edit) {
        const a = racks('after');
        if (s.edit === 'move') a[0].x += 0.5;
        else if (s.edit === 'rotate') a[1].rotation = (a[1].rotation + 90) % 360;
        else if (s.edit === 'resize') a[2].width += 0.1;
        else if (s.edit === 'delete') p.scenarios.after.objects = p.scenarios.after.objects.filter((o) => o.id !== a[3].id);
        else if (s.edit === 'add') p.scenarios.after.objects.push({ ...structuredClone(a[4]), id: 'added-rack-0001', code: 'NEW-1', lineageId: 'added-rack-0001', x: 1, y: 1 });
        else if (s.edit === 'origSpec') a[5].originalSpec = { ...a[5].originalSpec, width: a[5].originalSpec.width + 0.05 };
        else if (s.edit === 'clearBefore') p.scenarios.before.objects = p.scenarios.before.objects.filter((o) => o.kind !== 'rack');
        p = validateProject(p);
      } else {
        const r = s.clone ? cloneBeforeToAfter(p, { version: s.clone === 'version', nextId, now }) : restoreBackup(p, p.layoutBackups.at(s.restore).id, { nextId, now });
        assert.ok(r.ok, r.reason);
        p = r.project;
        undo++;
      }
    }
    const exp = normalizeLikeHarness(dropTime(expected.find((x) => x.name === c.name).steps), { idPattern: ID });
    const got = normalizeLikeHarness(dropTime(out), { idPattern: ID });
    const d = diff(exp, got);
    assert.equal(d.length, 0, formatDiff(d));
  });
}
