// V1: 검증 규칙 대조. 같은 변형 입력에 대해 재구축본 validateProject가 기준본 v2.4.1과
// 수락/거부, 오류 메시지, 수락 시 보정 결과(sha256)까지 같은지 검사한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { cases } from './validation-cases.js';
import { validateProject } from '../../src/core/project.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8'));
const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/validation-cases.json', import.meta.url), 'utf8')).results;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

test('V1 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.map((r) => r.name), cases.map(([name]) => name));
});

for (const [name, mutate] of cases) {
  test(`V1 ${name}`, () => {
    const want = expected.find((r) => r.name === name);
    const input = structuredClone(fixture);
    mutate(input);
    let got;
    try {
      const out = validateProject(JSON.parse(JSON.stringify(input)));
      got = { accepted: true, outputSha256: sha(stable(JSON.parse(JSON.stringify(out)))) };
    } catch (e) {
      got = { accepted: false, message: String(e?.message || e) };
    }
    const { name: _name, ...verdict } = want;
    assert.deepEqual(got, verdict);
  });
}

test('V1 기준본 저장본은 검증 후에도 바이트 동일하다(멱등)', () => {
  const out = validateProject(structuredClone(fixture));
  assert.equal(stable(out), stable(fixture));
});
