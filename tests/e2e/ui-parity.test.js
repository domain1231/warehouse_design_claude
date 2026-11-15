// UI 동일성 검사(Phase 9b-0, D-032): 재구축 화면의 컨트롤·섹션 제목을 기준본 v2.4.1 목록(fixtures/legacy/ui-inventory.json)과 대조한다.
// 차이 목록은 tests/e2e/ui-parity-gaps.json에 고정한다(래칫). 새 차이가 생기거나, 고친 차이를 목록에서 지우지 않으면 실패한다.
// 목록 갱신: UPDATE_UI_GAPS=1 pnpm test:e2e  (줄어드는 방향만 커밋한다. 늘어나면 사용자 승인과 DECISIONS 기록이 필요)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { collectUi, collectStates } from './ui-inventory.js';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/legacy/ui-inventory.json'), 'utf8'));
const gapsFile = path.join(import.meta.dirname, 'ui-parity-gaps.json');

/** 기준본 항목 중 재구축에서 키가 없거나(missing) 글자가 다른(text) 것. */
export function diffUi(base, actual) {
  const got = new Map(actual.map((r) => [r.key, r]));
  const out = [];
  for (const r of base) {
    const g = got.get(r.key);
    if (!g) out.push('missing ' + r.key);
    else if (g.text !== r.text || g.label !== r.label) out.push(`text ${r.key} = ${r.text || r.label}`);
  }
  const known = new Set(base.map((r) => r.key));
  for (const r of actual) if (!known.has(r.key)) out.push('extra ' + r.key);
  return out;
}

test('재구축 UI 목록이 기준본 v2.4.1과 같다(남은 차이는 고정 목록과 일치)', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
  try {
    const page = await (await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } })).newPage();
    await page.goto(pathToFileURL(path.join(root, 'dist', meta.file)).href);
    await page.waitForSelector('[data-testid=plan]');
    await page.waitForTimeout(500);
    const all = await page.evaluate(collectUi, true);
    const ids = await page.evaluate(() => {
      const p = window.__warehouseSession.state.project, l = p.scenarios[p.settings.scenario].objects, racks = l.filter((o) => o.kind === 'rack');
      return { rack1: [racks[0].id], rack2: [racks[0].id, racks[1].id], aisle: [l.find((o) => o.kind === 'aisle')?.id], column: [l.find((o) => o.kind === 'column')?.id] };
    });
    const clear = async (pg) => { await pg.keyboard.press('Escape'); };
    const select = async (pg, st) => {
      for (const [i, id] of ids[st].filter(Boolean).entries()) await pg.locator(`[data-testid=plan] g[data-id="${id}"]`).first().click({ force: true, modifiers: i ? ['Shift'] : [] });
    };
    const states = await collectStates(page, select, clear);
    const actual = [...diffUi(expected.all, all).map((d) => 'all ' + d)];
    for (const st of Object.keys(expected.states)) actual.push(...diffUi(expected.states[st], states[st]).map((d) => `${st} ${d}`));
    actual.sort();
    if (process.env.UPDATE_UI_GAPS) fs.writeFileSync(gapsFile, JSON.stringify(actual, null, 1) + '\n');
    const gaps = JSON.parse(fs.readFileSync(gapsFile, 'utf8'));
    const added = actual.filter((d) => !gaps.includes(d)), fixed = gaps.filter((d) => !actual.includes(d));
    assert.deepEqual({ added, fixed }, { added: [], fixed: [] }, `UI 차이 ${actual.length}건(고정 ${gaps.length}건). added=새 차이, fixed=고쳤으니 목록에서 지울 것`);
  } finally {
    await browser.close();
  }
});
