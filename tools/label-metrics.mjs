// 라벨 글자 폭 표 생성(Phase 5c). 기준본은 브라우저 canvas measureText로 폭을 재지만, Node(단위·Golden 검사)에는 canvas가 없다.
// 그래서 같은 글꼴 지정('600 Npx "Segoe UI","Malgun Gothic",sans-serif')의 폭을 Chrome에서 한 번 재어 tests/golden/label-metrics.js에 기록한다.
// 브라우저 실행 시에는 실제 canvas 측정을 쓰고, 이 표는 canvas가 없을 때의 결정적 대체값이다.
// 사용: WAREHOUSE_BROWSER_PATH=<chrome> node tools/label-metrics.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const page = await browser.newPage();
const data = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d');
  const m = (t, f) => { c.font = `600 ${f}px "Segoe UI","Malgun Gothic",sans-serif`; return c.measureText(t).width; };
  const U = 2048, chars = [...Array(95).keys()].map((i) => String.fromCharCode(32 + i)).concat(['×', '·', '…', '—']);
  const adv = {}, kern = {};
  for (const a of chars) adv[a] = Math.round(m(a, U));
  for (const a of chars.slice(0, 95)) for (const b of chars.slice(0, 95)) {
    const k = Math.round(m(a + b, U) - m(a, U) - m(b, U));
    if (k) kern[a + b] = k;
  }
  const hangul = {};
  for (let f = 7; f <= 14; f++) hangul[f] = m('가', f);
  return { adv, kern, hangul };
});
await browser.close();
const out = `// 자동 생성: tools/label-metrics.mjs (Chrome 측정). 직접 수정하지 않는다.
// adv: 글자별 폭(1/2048 em), kern: 글자 쌍 보정(1/2048 em), hangul: 한글 음절 폭(px, 글자 크기 7~14).
export const LABEL_METRICS = ${JSON.stringify(data)};
`;
fs.writeFileSync(new URL('../tests/golden/label-metrics.js', import.meta.url), out);
console.log(Object.keys(data.kern).length, 'kern pairs;', out.length, 'bytes');
