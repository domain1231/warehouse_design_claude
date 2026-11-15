// 창고 치수 적용·참고 도면 대조 자료 생성(Phase 9a): 기준본 v2.4.1에서 실제 입력·버튼으로 실행해 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/room-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { roomCases } from '../tests/golden/room-cases.js';

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
for (const c of roomCases) {
  cases.push(await page.evaluate(({ text, c }) => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    P.settings.scenario = c.scenario || 'after';
    P.settings.policy = c.policy || 'warn';
    P.editing.allowWarnings = P.settings.policy === 'warn';
    if (c.locked) P.scenarioMeta.before.locked = true;
    if (c.background) P.settings.background = c.background;
    validateProject(P);
    undoStack.length = 0;
    renderAll();
    const toast = document.querySelector('#toast');
    if (toast) toast.textContent = '';
    const out = { name: c.name };
    if (c.room) {
      $('roomWidth').value = c.room.width;
      $('roomHeight').value = c.room.height;
      $('ceiling').value = c.room.ceiling;
      out.reason = (R.updateRoomApplyState(), $('roomApplyReason').textContent);
      out.disabled = $('applyRoom').disabled;
      if (!out.disabled) $('applyRoom').onclick();
      out.warehouse = JSON.parse(JSON.stringify(P.scenarios[P.settings.scenario].warehouse));
      out.undo = undoStack.length;
      out.toast = toast?.textContent || '';
      out.commands = JSON.parse(JSON.stringify((P.commandHistory || []).slice(-1).map(({ time, ...r }) => r)));
    }
    if (c.derive) {
      $('areaInput').value = c.derive.area;
      $('knownWidth').value = c.derive.known;
      $('deriveRoom').onclick();
      out.inputs = [$('roomWidth').value, $('roomHeight').value, $('roomArea').textContent || $('roomArea').value];
      out.toast = toast?.textContent || '';
    }
    if (c.background) {
      const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.innerHTML = scene(display());
      const img = host.querySelector('image');
      out.image = img ? img.outerHTML : null;
      out.order = [...host.children].slice(0, 5).map((e) => e.tagName + (e.getAttribute('class') ? '.' + e.getAttribute('class') : ''));
    }
    return out;
  }, { text: projectText, c }));
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/room-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/room-diff.mjs', cases }, null, 1) + '\n');
for (const c of cases) console.log(c.name, '|', c.reason ?? '', c.disabled ?? '', c.warehouse ? `${c.warehouse.width}×${c.warehouse.height}` : '', c.undo ?? '', (c.toast || '').slice(0, 60), c.inputs ?? '', c.image ? 'image' : '', (c.order || []).join(','));
