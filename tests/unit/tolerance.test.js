import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEOMETRY_EPS_M,
  INPUT_STEP_M,
  addPrecise,
  clearanceShortfall,
  meetsClearance,
  quantizeInput,
  snapTo,
} from '../../src/geometry/tolerance.js';

test('기하 허용오차는 입력 단위보다 1000배 이상 작다', () => {
  assert.ok(GEOMETRY_EPS_M * 1000 <= INPUT_STEP_M);
});

test('addPrecise는 부동소수점 잡음을 제거한다', () => {
  assert.equal(addPrecise(0.1, 0.2), 0.3);
  assert.equal(addPrecise(12.345, 0.001), 12.346);
});

test('addPrecise는 기존 소수 좌표를 mm로 반올림하지 않는다', () => {
  assert.equal(addPrecise(1.23456789, 0), 1.23456789);
});

test('1mm 이동 1000회 누적 후에도 정확히 1m 이동한다', () => {
  let x = 5.25;
  for (let i = 0; i < 1000; i++) x = addPrecise(x, 0.001);
  assert.equal(x, 6.25);
});

test('quantizeInput은 사용자 입력을 1mm 단위로 맞춘다', () => {
  assert.equal(quantizeInput(1.23456), 1.235);
  assert.equal(quantizeInput(-0.0004), -0);
});

test('snapTo는 지원 간격에만 동작한다', () => {
  assert.equal(snapTo(1.37, 0.25), 1.25);
  assert.equal(snapTo(1.38, 0.25), 1.5);
  assert.equal(snapTo(0.0124, 0.005), 0.01);
  assert.throws(() => snapTo(1, 0.3), RangeError);
});

test('정확히 같은 거리는 이격 충족', () => {
  assert.equal(meetsClearance(0.3, 0.3), true);
  assert.equal(meetsClearance(0.1 + 0.2, 0.3), true);
});

test('1mm 부족은 반드시 이격 부족으로 판정한다', () => {
  assert.equal(meetsClearance(0.299, 0.3), false);
  assert.equal(clearanceShortfall(0.299, 0.3), 0.001);
});

test('허용오차를 넘는 미세 부족도 위반이다', () => {
  assert.equal(meetsClearance(0.3 - 2 * GEOMETRY_EPS_M, 0.3), false);
});

test('숫자가 아닌 값은 거부한다', () => {
  assert.throws(() => meetsClearance(NaN, 0.3), TypeError);
  assert.throws(() => addPrecise(1, Infinity), TypeError);
});
