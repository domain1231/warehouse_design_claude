// D-049: 로케이션 형식 확장(숫자로 시작하는 열, 로마 숫자 랙).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocationCode, romanToNumber, legacyColumn } from '../../src/core/location.js';
import { parseLocation } from '../../src/core/project.js';
import { parseExcelLocation } from '../../src/excel/analyze.js';

test('기존 형식 결과는 그대로', () => {
  const r = parseLocationCode('7F-C-5-3-1');
  assert.deepEqual([r.key, r.shelfKey, r.location, r.rackNumber], ['7F-C-5', '7F-C-5-3', '7F-C-5-3-1', 5]);
  assert.deepEqual(parseLocation(' 7f-c-5-3-1 '), r);
  assert.deepEqual(parseExcelLocation('7F-C-5-3-1'), r);
  for (const bad of ['', '7F-C-0-1-1', '7F-C-5-3', 'Buffer Rack', '7F--5-1-1']) assert.equal(parseLocationCode(bad), null, bad);
});

test('로마 숫자 랙은 같은 번호로 읽는다(II = 2)', () => {
  assert.equal(parseLocationCode('2F-F-II-1-1').key, '2F-F-2');
  assert.equal(parseLocationCode('2F-O-VIII-2-3').location, '2F-O-8-2-3');
  assert.equal(romanToNumber('IV'), 4);
  assert.equal(romanToNumber('IIII'), null); // 표준 표기만
  assert.equal(parseLocationCode('2F-F-IIII-1-1'), null);
});

test('숫자로 시작하는 열 이름(2A)', () => {
  const r = parseLocationCode('7F-2A-3-2-10');
  assert.deepEqual([r.column, r.key, r.position], ['2A', '7F-2A-3', 10]);
  assert.equal(legacyColumn('2A'), false);
  assert.equal(legacyColumn('AB'), true);
});
