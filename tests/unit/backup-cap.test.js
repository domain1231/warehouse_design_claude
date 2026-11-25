// D-092: 배치 백업 합계 3.2MB 한도는 실제 저장 크기(백업 안 스냅샷 참조, D-089)로 잰다 — 이력이 쌓여도 Excel 가져오기가 막히지 않음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyProject } from './size-fixture.js';
import { backupTarget } from '../../src/excel/apply.js';
import { packBackupRefs } from '../../src/core/backup-refs.js';
import { createIdGenerator } from '../../src/core/ids.js';

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const opts = () => ({ nextId: createIdGenerator({ seed: 'cap' }), now: () => '2026-11-25T00:00:00.000Z' });

test('스냅샷이 펼친 크기로 3.2MB를 넘게 쌓여도 백업은 실패하지 않고 6개까지 보관(저장 크기 3.2MB 이하)', () => {
  const { p } = historyProject({ racks: 400, imports: 12 }); // 펼친 백업 1개가 3.2MB를 넘는 규모
  const fullOne = bytes(p.layoutBackups.at(-1));
  assert.ok(fullOne > 3.2e6, `펼친 백업 1개 ${fullOne}`);
  assert.equal(p.layoutBackups.length, 6);
  assert.ok(bytes(packBackupRefs(p).layoutBackups) <= 3.2e6);
});

test('참조할 수 없는(최상위에 없는) 스냅샷은 펼친 크기로 세어 오래된 백업부터 정리(한도 유지)', () => {
  const { p } = historyProject({ racks: 400, imports: 12 });
  p.layoutSnapshots = []; // 최상위 배치 스냅샷이 모두 지워진 상태 → 백업 안 복사본은 참조 불가
  p.excelSnapshots = [];
  backupTarget(p, 'before', '가상 시험', opts());
  assert.ok(p.layoutBackups.length < 6, `오래된 백업부터 정리: ${p.layoutBackups.length}개`);
  assert.ok(bytes(packBackupRefs(p).layoutBackups) <= 3.2e6);
});
