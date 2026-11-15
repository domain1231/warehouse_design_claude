// BEFORE/AFTER 시나리오 대조 자료 생성(Phase 7a): 기준본 v2.4.1에서 복제(rCloneApply)·백업 복원(R.restore)·
// 비교표(compareRows)·랙 변경 행(R.diffRows(R.diff()))을 실행해 fixtures/legacy/scenario-cases.json에 기록한다. 확인 창은 승인으로 대체.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/scenario-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scenarioCases } from '../tests/golden/scenario-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const page = await (await browser.newContext({ offline: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });
const cases = [];
for (const c of scenarioCases) {
  cases.push(await page.evaluate(({ text, c }) => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    validateProject(P);
    undoStack.length = 0;
    const out = [];
    const racks = (k) => P.scenarios[k].objects.filter((o) => o.kind === 'rack');
    for (const s of c.steps) {
      if (s === 'snapshot') {
        const pick = ({ scenarios, scenarioMeta, layoutBackups, layoutRevisions, excelSnapshots, layoutSnapshots, inventoryHistory, settings, editing, theme, rackLabels, autoPlacement }) => ({ scenarios, scenarioMeta, layoutBackups, layoutRevisions, excelSnapshots, layoutSnapshots, inventoryHistory, scenario: settings.scenario, selection: editing.selectedRackIds, objectColors: theme.objectColors, zoneNames: rackLabels.zoneNames, autoSettings: autoPlacement.settings, reviewNotes: autoPlacement.reviewNotes });
        out.push({ compare: compareRows().map((r) => r.map(String)), diffRows: R.diffRows(R.diff()), project: JSON.parse(JSON.stringify(pick(P))), undo: undoStack.length });
      } else if (s.edit) {
        const a = racks('after');
        if (s.edit === 'move') a[0].x += 0.5;
        else if (s.edit === 'rotate') a[1].rotation = (a[1].rotation + 90) % 360;
        else if (s.edit === 'resize') a[2].width += 0.1;
        else if (s.edit === 'delete') P.scenarios.after.objects = P.scenarios.after.objects.filter((o) => o.id !== a[3].id);
        else if (s.edit === 'add') P.scenarios.after.objects.push({ ...JSON.parse(JSON.stringify(a[4])), id: 'added-rack-0001', code: 'NEW-1', lineageId: 'added-rack-0001', x: 1, y: 1 });
        else if (s.edit === 'origSpec') a[5].originalSpec = { ...a[5].originalSpec, width: a[5].originalSpec.width + 0.05 };
        else if (s.edit === 'clearBefore') P.scenarios.before.objects = P.scenarios.before.objects.filter((o) => o.kind !== 'rack');
        validateProject(P);
      } else if (s.clone) {
        $('rCloneChoice').value = s.clone;
        $('rCloneApply').onclick();
      } else if (s.restore !== undefined) {
        const b = P.layoutBackups.at(s.restore);
        R.restore(b.id);
      }
    }
    return { name: c.name, steps: out };
  }, { text: projectText, c }));
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/scenario-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/scenario-diff.mjs', cases }, null, 1) + '\n');
for (const c of cases) { const s = c.steps.at(-1); console.log(`${c.name}: 비교 ${s.compare.length}행 · 변경 ${s.diffRows.length}행 · 백업 ${s.project.layoutBackups.length} · 이력 ${s.project.layoutRevisions.length} · undo ${s.undo}`); }
