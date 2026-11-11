// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/legacy-compat.mjs
// Reverse compatibility: a value packed by the rebuild must be readable by baseline v2.4.1 (normal build),
// both via V.unpack and via a real page reload from localStorage (bootstrap path).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { packProject } from '../src/persistence/zip.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const { stem } = require(baseline + '/tools/version.cjs');
const text = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const packed = await packProject(text);

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const url = pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href;
await page.goto(url);
await page.waitForSelector('#vStorage', { state: 'visible' });
const unpack = await page.evaluate((raw) => {
  const t = V.unpack(raw);
  const p = validateProject(JSON.parse(t));
  return { same: t, name: p.metadata.name, objects: p.scenarios.after.objects.length };
}, packed);
const unpackSame = unpack.same === text;
await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: 'warehouse-studio-v1', raw: packed });
await page.reload();
await page.waitForSelector('#vStorage', { state: 'visible' });
const boot = await page.evaluate(() => ({ name: P.metadata.name, objects: P.scenarios.after.objects.length, protectedRaw: V.protectedRaw, state: V.state }));
await browser.close();
const result = { unpackSame, unpackName: unpack.name, unpackObjects: unpack.objects, boot, errors };
console.log(JSON.stringify(result));
process.exit(unpackSame && boot.name === 'SYNTHETIC legacy fixture' && !boot.protectedRaw && errors.length === 0 ? 0 : 1);
