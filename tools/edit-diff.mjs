// 편집 명령 대조 자료 생성: tests/golden/edit-cases.js의 사례를 기준본 v2.4.1 일반본에서 실제 편집 함수
// (addAt, 삭제·복제·회전 버튼, Q.nudge, 속성 칸 onchange, 이동 제스처 + M.finish)로 실행하고,
// 바뀐 객체·명령 기록·규격 이력을 하네스 방식으로 정규화해 fixtures/legacy/edit-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/edit-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { editCases } from '../tests/golden/edit-cases.js';
import { normalizeEditResult } from '../tests/golden/edit-normalize.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const raw = await page.evaluate(({ text, cases }) => cases.map((c) => {
  P = JSON.parse(text);
  M.ensure(P);
  W.ensure(P);
  validateProject(P);
  if (c.setup?.scenario) P.settings.scenario = c.setup.scenario;
  if (c.setup?.allowWarnings !== undefined) P.editing.allowWarnings = c.setup.allowWarnings;
  if (c.setup?.snap !== undefined) P.settings.snap = c.setup.snap;
  P.settings.policy = P.editing.allowWarnings ? 'warn' : 'block';
  const racks = active().objects.filter((o) => o.kind === 'rack');
  if (c.setup?.lockFirst) racks[c.select[0]].placementMeta.positionLocked = true;
  if (c.setup?.aspect) racks[c.select[0]].resizeConstraints.aspectLocked = true;
  setTool('select');
  renderAll(); // 새 P를 화면 상태로 받아들인다(이후 renderAll이 저장된 선택으로 되돌리지 않게)
  selected = new Set(c.select.map((i) => racks[i].id));
  save(); // 실제 사용처럼 선택을 프로젝트에 기록(editing.selectedRackIds)
  renderAll();
  // 대화상자 값은 페이지에 남으므로 사례마다 처음 값으로 되돌린다(shell.html 기본값)
  for (const [id, v] of Object.entries({ mAlignRef: 'group', mReferenceLine: '0', mSpaceMode: 'fixed', mCustomOrder: '', mMoveX: '0', mMoveY: '0', mRotateAngle: '90' })) $(id).value = v;
  $('mReverse').checked = false;
  const initial = JSON.parse(JSON.stringify(P));
  for (const s of c.steps) {
    const step = typeof s === 'string' ? { op: s } : s;
    if (step.op === 'add') {
      setTool(step.kind);
      addAt(step.kind, step.point);
      setTool('select');
    } else if (step.op === 'delete') $('delete').click();
    else if (step.op === 'duplicate') $('duplicate').click();
    else if (step.op === 'rotate') $('rotate').click();
    else if (step.op === 'nudge') Q.nudge(step.dx, step.dy, step.fast);
    else if (step.op === 'field' || step.op === 'dimension') {
      renderInspector();
      const input = $('inspector').querySelector(`[data-field="${step.field}"]`);
      input.value = step.raw;
      input.onchange();
    } else if (step.op === 'move') {
      const original = JSON.parse(JSON.stringify(active().objects.filter((o) => selected.has(o.id))));
      M.gesture = { kind: 'move', pointer: 1, start: { x: 0, y: 0 }, original, before: JSON.stringify(P), scenario: P.settings.scenario, moved: false };
      const lead = original[0];
      let dx = snapped(lead.x + step.dx) - lead.x, dy = snapped(lead.y + step.dy) - lead.y;
      ({ dx, dy } = Q.dragDelta(M.gesture, dx, dy));
      if (!(Math.abs(dx) + Math.abs(dy) < EPS)) {
        M.gesture.moved = true;
        for (const o of original) {
          const t = active().objects.find((a) => a.id === o.id);
          t.x = Q.add(o.x, dx);
          t.y = Q.add(o.y, dy);
        }
      }
      M.finish({ pointerId: 1 }, !!step.cancel);
    } else if (step.op === 'resize') {
      const o = active().objects.find((x) => selected.has(x.id));
      const [sx, sy] = S.handleDirections[step.handle];
      S.resizeSession = { object: JSON.parse(JSON.stringify(o)), before: JSON.stringify(P), scenario: P.settings.scenario, handle: step.handle };
      M.gesture = { kind: 'resize', pointer: 1, start: { x: 0, y: 0 }, sx, sy, moved: true };
      Object.assign(o, S.resized(S.resizeSession.object, sx, sy, step.dx, step.dy));
      M.finish({ pointerId: 1 }, false);
    } else if (step.op === 'group') {
      M.open(step.action);
      for (const [id, v] of Object.entries(step.fields ?? {})) {
        const value = v === '#CODES' ? active().objects.filter((o) => selected.has(o.id)).map((o) => o.code).reverse().join(',') : v;
        if ($(id).type === 'checkbox') $(id).checked = value;
        else $(id).value = value;
      }
      M.previewEdit();
      if (step.allow !== undefined) $('mPreviewAllow').checked = step.allow;
      M.applyEdit();
      if ($('mEditDialog').open) $('mEditDialog').close();
    }
  }
  return { initial, final: JSON.parse(JSON.stringify(P)), selected: [...selected] };
}), { text: projectText, cases: editCases });
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
const results = raw.map((r, i) => normalizeEditResult(editCases[i].name, r.initial, r.final, r.selected));
fs.writeFileSync(new URL('../fixtures/legacy/edit-cases.json', import.meta.url), JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/edit-diff.mjs when cases change', results }, null, 1) + '\n');
console.log(results.map((r) => `${r.name}: changed ${r.changed.length}, removed ${r.removed.length}, log ${r.commands.map((x) => (x.success ? '✔' : '✖') + x.type).join(',')}`).join('\n'));
