// 비교 화면 E2E 공용: 가상 GT-EMPTY 배치(tests/unit/helpers/space-synthetic.js)를 상태에 넣고 비교 화면을 연다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { syntheticEmpty } from '../unit/helpers/space-synthetic.js';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
export const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;
export const syntheticObjects = () => {
  const lay = ({ racks }) => racks.map((r, i) => ({ id: `R-${r.col}${r.no}`, kind: 'rack', code: `${r.col}-${r.no}`, x: 0.5 + (i % 10) * 1.9, y: 0.5 + Math.floor(i / 10) * 2.2, width: r.w / 1000, depth: r.d / 1000, rotation: 0, height: 2, excel: { key: `7F-${r.col}-${r.no}`, shelves: [{ level: 1, items: r.rows }] } }));
  return { before: lay(syntheticEmpty({ before: true })), after: lay(syntheticEmpty()) };
};
/** 샘플 도면을 열고 BEFORE/AFTER 랙을 가상 GT-EMPTY 배치로 바꾼 뒤 비교 화면을 연다. */
export async function openSyntheticCompare(page) {
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate((objs) => {
    const p = window.__warehouseSession.state.project, tpl = p.scenarios.before.objects.find((o) => o.kind === 'rack');
    for (const k of ['before', 'after']) p.scenarios[k].objects = objs[k].map((o) => ({ ...structuredClone(tpl), ...o }));
  }, syntheticObjects());
  await page.locator('[data-testid=scenario-compare]').click();
}

