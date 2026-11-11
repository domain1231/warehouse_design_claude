import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdGenerator } from '../../src/core/ids.js';

test('같은 시드는 같은 ID 순서를 만든다', () => {
  const a = createIdGenerator({ seed: 'gm' });
  const b = createIdGenerator({ seed: 'gm' });
  const seqA = [a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b()]);
  assert.equal(new Set(seqA).size, 3);
  assert.equal(seqA[0], 't-gm-000001');
});

test('다른 시드는 겹치지 않는 ID를 만든다', () => {
  assert.notEqual(createIdGenerator({ seed: 'x' })(), createIdGenerator({ seed: 'y' })());
});

test('시드가 없으면 실행마다 고유한 ID를 만든다', () => {
  const next = createIdGenerator();
  const ids = new Set(Array.from({ length: 1000 }, () => next()));
  assert.equal(ids.size, 1000);
});

test('잘못된 시드는 거부한다', () => {
  for (const seed of ['', 'a b', 'x'.repeat(33), 7]) {
    assert.throws(() => createIdGenerator({ seed }), TypeError);
  }
});
