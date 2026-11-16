// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/golden-refresh.mjs
// 기준본 대조 자료(fixtures/legacy)를 모두 다시 생성하고 Golden Master를 재검증한 뒤 fixtures 변경분을 보여준다.
// 기본은 확인 모드: 대조 검사가 통과하면 다시 만든 자료를 원래대로 되돌린다(기준본이 매번 새 UUID·시각을 내므로 무의미한 변경 방지).
// 기준본이 바뀌어 자료를 새로 기록하려면 --write를 붙인다.
import { spawnSync } from 'node:child_process';

if (!process.env.BASELINE_REPO) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const write = process.argv.includes('--write');
// 확인 모드는 끝에 fixtures/legacy를 되돌리므로, 커밋하지 않은 자료 변경이 있으면 지우지 않도록 시작 전에 멈춘다.
const dirty = spawnSync('git', ['status', '--porcelain', 'fixtures/legacy'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => /\.json$/.test(l)).join('\n').trim();
if (!write && dirty) {
  console.error('fixtures/legacy에 커밋하지 않은 변경이 있습니다. 먼저 커밋하거나 --write로 실행하세요.\n' + dirty);
  process.exit(2);
}
const names = ['plan', 'edit', 'excel', 'spatial', 'validation', 'label', 'color', 'scenario', 'history', 'export', 'room', 'guide'];
const steps = names.map((n) => ({ name: `${n}-diff`, args: [`tools/${n}-diff.mjs`] }));
steps.push({ name: 'v2.4.1 JSON', args: ['tools/legacy-json-compat.mjs'] });
steps.push({ name: 'golden tests', args: ['--test', 'tests/golden/*.test.js'] });

const rows = [];
for (const s of steps) {
  console.log(`\n=== ${s.name} ===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, s.args, { stdio: 'inherit' });
  rows.push({ name: s.name, code: r.status ?? 1, sec: ((Date.now() - t) / 1000).toFixed(1) });
}
console.log('\n=== 요약 ===');
for (const r of rows) console.log(`${r.name.padEnd(14)} exit ${r.code}  ${r.sec}s${r.name === 'golden tests' ? (r.code ? '  FAIL' : '  PASS') : ''}`);
console.log('\n=== git diff --stat fixtures/ ===');
spawnSync('git', ['diff', '--stat', 'fixtures/'], { stdio: 'inherit' });
const golden = rows.at(-1);
if (!write && golden.code === 0) {
  spawnSync('git', ['checkout', '--', 'fixtures/legacy/*.json'], { stdio: 'inherit' });
  console.log('확인 모드: 대조 검사 통과 → 다시 만든 자료는 원래대로 되돌렸습니다(UUID·시각 차이만 있었던 것으로 판정). 새로 기록하려면 --write.');
} else if (!write) console.log('대조 검사 실패: 다시 만든 자료를 그대로 두었습니다. 차이를 확인하세요.');
process.exit(rows.some((r) => r.code) ? 1 : 0);
