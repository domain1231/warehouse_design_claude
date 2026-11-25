// 전체 프로젝트 백업 링(기준본 75 V.checkpoint·V.backups·V.decodeBackups·V.restore 영수증). DOM 없음.
// 주요 작업(대량 객체 삭제·BEFORE 변경·배치 복원·JSON 전체 교체) 직전 상태를 최신 3개 / 압축 합계 3.2MB까지 보관한다.
// 저장은 압축(warehouse-backup-zip-v1) → 쓰기 → 다시 읽어 풀어서 비교 → 실패 시 이전 원문으로 되돌린다.
// 키는 재구축 접두사를 쓴다(D-006: 기준본 키에 쓰지 않음).
import { packProject, unpackStored } from './zip.js';
import { packBackupRefs } from '../core/backup-refs.js';
import { StoreError, DEFAULT_PREFIX } from './storage.js';

export const BACKUP_LIMIT = 3;
export const BACKUP_BYTES = 3200000;
export const BACKUP_TARGET = 'BEFORE + AFTER';
export const REASONS = Object.freeze({ bulkDelete: '대량 객체 삭제 전', before: 'BEFORE 변경 전', restore: '배치 복원 전' });
const bytes = (s) => new TextEncoder().encode(String(s)).length;
const isQuota = (e) => e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014;

/**
 * 프로젝트 변경이 백업 대상인지(기준본 75 commit 래퍼 조건): 대상 배치에서 객체 2개 이상 삭제, BEFORE 변경, '복원' 명령.
 * @returns 사유 문자열 또는 null
 */
export function checkpointReason(before, after, command = '') {
  const target = before.settings.scenario;
  const ids = new Set(after.scenarios[target].objects.map((o) => o.id));
  const removed = before.scenarios[target].objects.filter((o) => !ids.has(o.id)).length;
  if (removed >= 2) return REASONS.bulkDelete;
  if (target === 'before' && JSON.stringify(before.scenarios.before) !== JSON.stringify(after.scenarios.before)) return REASONS.before;
  if (/복원/.test(command)) return REASONS.restore;
  return null;
}

/**
 * @param {{ storage: Storage, prefix?: string, validate: (p) => object, fingerprint: (p) => string, nextId: () => string, now?: () => string, maxBytes?: number }} opts (maxBytes는 검사용)
 */
// E5(D-089): 링 안 프로젝트도 백업 안 스냅샷을 참조로 줄여 쓴다(읽을 때 validate가 펼침).
const ringText = (rows) => JSON.stringify(rows.map((r) => (r?.project ? { ...r, project: packBackupRefs(r.project) } : r)));

export function createBackupRing({ storage, prefix = DEFAULT_PREFIX, validate, fingerprint, nextId, now = () => new Date().toISOString(), maxBytes = BACKUP_BYTES }) {
  const key = `${prefix}:project-backups`;
  const op = (stage, fn) => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof StoreError) throw e;
      throw new StoreError(isQuota(e) ? '저장 공간이 부족해 프로젝트 백업을 저장하지 못했습니다.' : `프로젝트 백업 작업 실패: ${e?.message || e}`, { code: isQuota(e) ? 'QUOTA' : 'STORAGE', stage, cause: e });
    }
  };
  async function decode(raw) {
    try {
      const rows = JSON.parse(await unpackStored(raw));
      if (!Array.isArray(rows)) throw new Error('목록 형식 오류');
      return rows;
    } catch (e) {
      throw new StoreError(`프로젝트 백업을 읽을 수 없습니다: ${e?.message || e}`, { code: 'CORRUPT', stage: 'backup-decode', cause: e });
    }
  }
  const raw = () => op('backup-read', () => storage.getItem(key));
  /** 백업 목록(오래된 것부터). 없으면 []. */
  async function list() {
    const r = raw();
    return r === null ? [] : decode(r);
  }
  /** 쓰기 후 읽기 검증. 실패하면 이전 원문으로 되돌리고 오류. */
  async function write(text, previous) {
    const packed = await packProject(text);
    if (bytes(packed) > maxBytes) return { packed, over: true };
    op('backup-write', () => storage.setItem(key, packed));
    try {
      const back = raw();
      if (back !== packed || (await unpackStored(back)) !== text) throw new Error('프로젝트 백업 압축 복원 불일치');
    } catch (e) {
      op('backup-rollback', () => (previous === null ? storage.removeItem(key) : storage.setItem(key, previous)));
      throw e instanceof StoreError ? e : new StoreError(e.message, { code: 'VERIFY', stage: 'backup-verify', cause: e });
    }
    return { packed, over: false };
  }
  /**
   * 기준본 V.checkpoint: 프로젝트를 검증해 링에 넣는다. 직전 백업과 사유·내용이 같으면 그 ID를 돌려준다.
   * @returns {{ id, receipt }} receipt.previous로 rollback(receipt)하면 이 백업 전 원문이 복구된다.
   */
  async function checkpoint(project, reason) {
    const p = validate(structuredClone(project));
    let previous = raw();
    let rows = [];
    let last;
    if (previous !== null) {
      try {
        rows = await decode(previous);
        last = rows.at(-1);
        if (last && last.reason === reason && fingerprint(validate(structuredClone(last.project))) === fingerprint(p)) return { id: last.id, receipt: null };
      } catch {
        // 손상·검증 실패 링은 삭제하지 않고 격리 키로 옮긴 뒤 새 링으로 시작한다(영구 백업 실패 방지).
        op('backup-quarantine', () => storage.setItem(`${key}:quarantine`, previous));
        if (op('backup-quarantine-read', () => storage.getItem(`${key}:quarantine`)) !== previous) throw new StoreError('손상된 백업 링 격리 확인 실패', { code: 'VERIFY', stage: 'backup-quarantine' });
        rows = [];
        previous = null;
      }
    }
    const b = { id: nextId(), time: now(), name: p.metadata.name, version: p.version, target: BACKUP_TARGET, reason, project: p };
    const next = rows.concat(b);
    while (next.length > BACKUP_LIMIT) next.shift();
    let r = await write(ringText(next), previous);
    while (r.over && next.length > 1) {
      next.shift();
      r = await write(ringText(next), previous);
    }
    if (r.over) throw new StoreError('백업 용량 한도 초과: 프로젝트 백업 3개 / 압축 합계 3.2MB', { code: 'BACKUP_LIMIT', stage: 'backup-limit' });
    return { id: b.id, receipt: { previous, written: r.packed } };
  }
  /** 기준본 V.restore(영수증): 저장 실패 시 백업 링을 checkpoint 전 원문으로 되돌린다. */
  function rollback(receipt) {
    if (!receipt) return;
    if (receipt.written !== undefined && raw() !== receipt.written) return; // 그 사이 다른 체크포인트가 링을 바꿨다면 되돌리지 않는다(여분의 백업은 무해)
    op('backup-rollback', () => (receipt.previous === null ? storage.removeItem(key) : storage.setItem(key, receipt.previous)));
  }
  return { key, list, checkpoint, rollback, raw };
}
