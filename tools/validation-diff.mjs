// 검증 규칙 대조 자료 생성: tests/golden/validation-cases.js의 변형 사례를 기준본 v2.4.1 validateProject에 넣고
// 수락/거부, 오류 메시지, 수락 시 보정 결과의 sha256을 fixtures/legacy/validation-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/validation-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cases } from '../tests/golden/validation-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const results = [];
for (const [name, mutate] of cases) {
  const input = structuredClone(fixture);
  mutate(input);
  const r = await page.evaluate((json) => {
    try {
      const out = validateProject(JSON.parse(json));
      return { accepted: true, output: JSON.stringify(out) };
    } catch (e) {
      return { accepted: false, message: String(e?.message || e) };
    }
  }, JSON.stringify(input));
  results.push(r.accepted ? { name, accepted: true, outputSha256: sha(stable(JSON.parse(r.output))) } : { name, accepted: false, message: r.message });
}
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
const out = new URL('../fixtures/legacy/validation-cases.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/validation-diff.mjs when cases change', results }, null, 1) + '\n');
console.log(`cases ${results.length}, accepted ${results.filter((r) => r.accepted).length}, rejected ${results.filter((r) => !r.accepted).length}`);
