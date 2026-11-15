// 저장소 화면(기준본 75 V.renderBackups·V.storageSnapshot·V.renderStorageSummary·V.confirmReplace·V.install·V.riskText, 30 readFile).
// 계산·저장은 session/store/backups가 한다. 이 파일은 대화상자와 수동 측정만 담당하며 paint 중에는 아무것도 측정하지 않는다.
import { esc } from '../cad/scene.js';
import { packProject } from '../persistence/zip.js';

const bytesOf = (s) => new TextEncoder().encode(String(s)).length;
const fmtBytes = (n) => (Number.isFinite(n) && n >= 0 ? n.toLocaleString('ko-KR') + ' bytes' : '미확인');
const fmtTime = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미확인');
const STATE_TEXT = { saved: '저장됨 (SAVED)', unsaved: '저장되지 않음 (UNSAVED)', saving: '저장 중', error: '저장 실패 (UNSAVED · 메모리에 유지)', loading: '불러오는 중' };

export const QUOTA_TEXT = '저장 공간이 부족하여 저장에 성공하지 못했습니다. 현재 작업은 메모리에 남아 있으며 저장되지 않았습니다 (UNSAVED). JSON 백업을 보관하고 브라우저 저장 공간을 확인하세요.';
const BACKUP_NOTE = '전체 프로젝트 백업은 최신 최대 3개 / 압축 합계 3.2MB로 순환 보관합니다. 정상 저장·검증 성공 시에만 한도에 맞춰 오래된 백업부터 교체합니다. 단일 백업도 한도를 넘거나 저장·검증에 실패하면 작업을 취소하고 기존 백업과 저장 바이트를 보존합니다. 날짜별 적용 스냅샷·재고 이력에는 이 순환 한도를 적용하지 않습니다.';

const dlg = (cls, testid, html) => {
  const d = document.createElement('dialog');
  d.className = cls;
  d.dataset.testid = testid;
  d.innerHTML = html;
  document.body.append(d);
  d.querySelector('[data-close]')?.addEventListener('click', () => d.close());
  return d;
};

/** @param {{ session, store, backups, storage: Storage, validate: Function, schemaVersion: string, today: () => string, toast: (t: string) => void, download: Function }} deps */
export function createStorageDialogs({ session, store, backups, storage, validate, schemaVersion, today, toast, download }) {
  const prefix = store.keys.pointer.replace(/:pointer$/, '');
  let quotaObserved = false;
  let lastFailure = null;

  /** 세션 상태를 받을 때마다 호출(측정 없음): 오류 기록과 QuotaExceededError 관측 표시. */
  function observe(s) {
    if (!s.error) return;
    if (!lastFailure || lastFailure.message !== s.error.message || lastFailure.code !== s.error.code) lastFailure = { ...s.error, time: new Date().toISOString() };
    if (s.error.code === 'QUOTA') quotaObserved = true;
  }
  const riskText = () => 'localStorage의 실제 남은 용량은 알 수 없습니다. 적용·교체 전 JSON 백업을 권장하며 저장 성공을 보장하지 않습니다.' + (quotaObserved ? ' 이전 저장에서 QuotaExceededError가 관측되었습니다.' : '');

  function exportCurrent() {
    try {
      const p = validate(structuredClone(session.state.project));
      download(`warehouse_project_v${schemaVersion.replaceAll('.', '_')}_${today()}.json`, JSON.stringify(p, null, 2), 'application/json');
      return true;
    } catch (e) {
      toast('현재 메모리 JSON 검증 실패: ' + e.message);
      return false;
    }
  }
  function exportRecovery() {
    const text = session.recoveryText();
    if (!text) {
      toast('검증된 적용 전 복구 JSON이 없습니다. 현재 프로젝트 JSON을 확인하세요.');
      return false;
    }
    download('warehouse_recovery_backup.json', text, 'application/json');
    return true;
  }

  // ── 교체 전 현재 작업 보호 ──
  const rd = dlg('storage-dialog', 'replace-dialog', '<div class="dialog-head"><h2>교체 전 현재 작업 보호</h2><span></span></div><p data-text></p><div class="row"><button type="button" data-save data-testid="replace-save">현재 프로젝트 저장 후 교체</button><button type="button" data-backup data-testid="replace-backup">현재 JSON 다운로드 후 교체</button><button type="button" data-cancel data-testid="replace-cancel">취소</button></div><p class="muted">다운로드는 브라우저에 요청합니다. 파일 보관 여부는 다운로드 목록에서 확인하세요.</p>');
  let replaceResolve = null;
  const resolveReplace = (v) => {
    const done = replaceResolve;
    replaceResolve = null;
    if (rd.open) rd.close();
    done?.(v);
  };
  rd.querySelector('[data-save]').addEventListener('click', async () => {
    await session.save();
    if (session.state.status === 'saved') resolveReplace(true);
  });
  rd.querySelector('[data-backup]').addEventListener('click', () => exportCurrent() && resolveReplace(true));
  rd.querySelector('[data-cancel]').addEventListener('click', () => resolveReplace(false));
  rd.addEventListener('cancel', () => resolveReplace(false));
  function confirmReplace(label) {
    if (session.state.status === 'saved') return confirm(label + '로 전체 프로젝트를 교체합니까? 현재 BEFORE·AFTER는 먼저 별도 백업합니다. ' + riskText());
    rd.querySelector('[data-text]').textContent = '저장되지 않은 변경사항이 있습니다. ' + label + '로 교체하기 전에 현재 작업을 저장하거나 JSON 백업하세요. ' + riskText();
    return new Promise((resolve) => {
      replaceResolve = resolve;
      rd.showModal();
    });
  }
  async function install(data, label) {
    const r = await session.replaceProject(data, label);
    toast(r.ok ? label + ' 복원 완료 · 저장 후 읽기 확인' : '전체 교체 취소: ' + r.reason + ' · 현재 프로젝트 유지. JSON 복구 백업을 사용할 수 있습니다.');
    return r.ok;
  }

  /** JSON 불러오기(기준본 30 readFile + 75 readFile jsonIn). */
  async function importFile(f) {
    try {
      if (f.size > 12e6) throw new Error('12MB 이하 파일만 지원합니다.');
      const data = validate(JSON.parse(await f.text()));
      const label = 'JSON ' + f.name;
      if (await confirmReplace(label)) await install(data, label);
    } catch (e) {
      toast('파일 처리 실패: ' + e.message);
    }
  }

  // ── 프로젝트 이전 버전·백업 ──
  const bd = dlg('storage-dialog', 'backup-dialog', `<div class="dialog-head"><h2>프로젝트 이전 버전·백업</h2><button type="button" data-close data-testid="backup-close">닫기 ×</button></div><p class="muted">이 PC·브라우저에만 보관됩니다. 직전 확인 저장 1개 + 주요 작업 전 전체 프로젝트 최신 최대 3개 / 압축 합계 3.2MB를 보관합니다. 정상 저장·검증 성공 시에만 한도에 맞춰 오래된 백업부터 교체합니다. 단일 백업도 한도를 넘거나 저장·검증에 실패하면 작업을 취소하고 기존 백업과 저장 바이트를 보존합니다. 날짜별 적용 스냅샷·재고 이력에는 이 순환 한도를 적용하지 않습니다. 필요한 프로젝트와 복구 자료를 JSON으로 보관하세요.</p><div data-rows data-testid="backup-list"></div>`);
  async function openBackups() {
    const box = bd.querySelector('[data-rows]');
    let choices = [];
    try {
      choices = (await backups.list()).reverse();
      const last = await store.lastGood().catch(() => null);
      if (last) choices.unshift({ id: 'last-good', reason: '직전 확인 저장', time: last.persistence?.lastSavedAt, name: last.metadata.name, project: last });
      box.innerHTML = choices.length
        ? choices.map((b, i) => `<div class="version-row" data-testid="backup-row"><b>${esc(b.reason)}</b> · ${esc(b.name)}<br>${esc(b.time || '원래 저장 시각 미기록')} · ${esc(b.target || 'BEFORE + AFTER')} · ${esc(b.project.version)}<br><button type="button" data-dl="${i}" data-testid="backup-download">이 버전 JSON</button><button type="button" data-restore="${i}" data-testid="backup-restore">현재 백업 후 복원</button></div>`).join('')
        : '<p>이전 프로젝트 백업 없음</p>';
    } catch (e) {
      box.textContent = '백업 조회 실패: ' + e.message;
    }
    for (const b of box.querySelectorAll('[data-dl]')) b.onclick = () => download('warehouse_previous_' + b.dataset.dl + '.json', JSON.stringify(choices[Number(b.dataset.dl)].project, null, 2), 'application/json');
    for (const b of box.querySelectorAll('[data-restore]')) {
      b.onclick = async () => {
        const chosen = structuredClone(choices[Number(b.dataset.restore)].project);
        if (!confirm('선택한 이전 버전으로 복원하면 현재 작업이 변경됩니다. 현재 상태를 먼저 백업하고 복원합니까?')) return;
        bd.close();
        await install(chosen, '프로젝트 이전 버전');
      };
    }
    if (!bd.open) bd.showModal();
  }

  // ── 저장소 관리(수동 측정) ──
  const sd = dlg('storage-dialog', 'storage-dialog', `<div class="dialog-head"><h2>저장소 관리</h2><button type="button" data-close data-testid="storage-close">닫기 ×</button></div><p data-state role="status" data-testid="storage-state"></p><p>현재 메모리와 디스크 저장 값을 구분한 수동 측정입니다. 숫자는 UTF8 bytes이며 UTF16은 문자열 기준 근삿값입니다. origin 합계는 모든 localStorage 키+값, 앱 합계는 앱 키 접두사 키+값입니다. 읽기 실패·불완전·알 수 없는 값은 미확인으로 표시하며 상세 진단에는 null 또는 errorType을 남깁니다. 아래 후보 크기는 저장 성공이나 실제 남은 용량을 보장하지 않습니다. 이력·규격·이미지는 프로젝트에 포함된 부분 크기로 서로 중복될 수 있어 합산하지 않습니다. UTF16과 API estimate는 추정치이며 localStorage 한도나 실제 남은 용량이 아닙니다.</p><p>${BACKUP_NOTE} 현재 작업 및 적용 전 복구 JSON을 보관하세요.</p><div class="row"><button type="button" data-refresh data-testid="storage-refresh">측정 새로고침</button><button type="button" data-download data-testid="storage-download">현재 메모리 JSON 다운로드</button><button type="button" data-recovery data-testid="storage-recovery">적용 전 복구 JSON 다운로드</button><button type="button" data-retry data-testid="storage-retry">현재 프로젝트 다시 저장</button></div><p data-estimate data-testid="storage-estimate"></p><div class="records-table" data-summary data-testid="storage-summary"></div><details><summary>상세 진단 JSON</summary><pre data-metrics data-testid="storage-metrics" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>`);
  const q = (s) => sd.querySelector(s);
  let request = 0;

  const readEntry = (key) => {
    try {
      const raw = storage.getItem(key);
      return { key, present: raw !== null, valueUTF8Bytes: raw === null ? 0 : bytesOf(raw), errorType: null };
    } catch (e) {
      return { key, present: null, valueUTF8Bytes: null, errorType: e?.name || 'Error' };
    }
  };
  function origin() {
    let utf8 = 0, utf16 = 0, app8 = 0, app16 = 0, count = 0, complete = true, errorType = null;
    try {
      const length = storage.length;
      for (let i = 0; i < length; i++) {
        const key = storage.key(i);
        const value = key === null ? null : storage.getItem(key);
        if (value === null) { complete = false; continue; }
        const n = bytesOf(key) + bytesOf(value), u = 2 * (key.length + value.length);
        utf8 += n; utf16 += u; count++;
        if (key.startsWith(prefix + ':')) { app8 += n; app16 += u; }
      }
      if (storage.length !== length) complete = false;
    } catch (e) {
      complete = false;
      errorType = e?.name || 'Error';
    }
    return { complete, errorType, readKeys: count, utf8Bytes: complete ? utf8 : null, approxUTF16Bytes: complete ? utf16 : null, appUTF8Bytes: complete ? app8 : null, appApproxUTF16Bytes: complete ? app16 : null };
  }
  async function snapshot() {
    const s = session.state;
    let active = null;
    try { active = JSON.parse(storage.getItem(store.keys.pointer))?.active; } catch { /* 포인터 없음·손상 */ }
    const slots = active === 'a' || active === 'b' ? { primary: store.keys[active], lastGood: store.keys[active === 'a' ? 'b' : 'a'] } : {};
    let backupRing;
    try { const raw = backups.raw(); backupRing = { key: backups.key, present: raw !== null, valueUTF8Bytes: raw === null ? 0 : bytesOf(raw), errorType: null }; } catch (e) { backupRing = { key: backups.key, present: null, valueUTF8Bytes: null, errorType: e?.code || e?.name || 'Error' }; }
    let memory, candidate;
    try {
      const text = JSON.stringify(s.project);
      memory = { valid: true, projectJSONUTF8Bytes: bytesOf(text), layoutRevisionsUTF8Bytes: bytesOf(JSON.stringify(s.project.layoutRevisions ?? null)) };
      candidate = { packedUTF8Bytes: bytesOf(await packProject(text)) };
    } catch (e) {
      memory ??= { valid: false, errorType: e?.name || 'Error' };
      candidate = { packedUTF8Bytes: null, errorType: e?.name || 'Error' };
    }
    return {
      snapshotTime: new Date().toISOString(),
      currentMemory: memory,
      packedCurrentCandidate: candidate,
      actualStoredEntries: { primary: slots.primary ? readEntry(slots.primary) : null, lastGood: slots.lastGood ? readEntry(slots.lastGood) : null, projectBackups: backupRing },
      wholeOriginAndApplication: origin(),
      lastConfirmedSave: s.project?.persistence?.lastSavedAt ?? null,
      status: s.status,
      lastFailure,
    };
  }
  function renderSummary(snap) {
    const stored = (e) => (e && !e.errorType && e.present !== null ? fmtBytes(e.valueUTF8Bytes) + (e.present === false ? ' (저장 항목 없음)' : '') : '미확인');
    const m = snap.currentMemory?.valid ? snap.currentMemory : null, o = snap.wholeOriginAndApplication, f = snap.lastFailure, e = snap.actualStoredEntries;
    const rows = [
      ['현재 메모리 JSON · UTF8', fmtBytes(m?.projectJSONUTF8Bytes)],
      ['압축 저장 후보 · UTF8', snap.packedCurrentCandidate?.errorType ? '미확인' : fmtBytes(snap.packedCurrentCandidate?.packedUTF8Bytes)],
      ['실제 저장 · 기본 프로젝트 · UTF8', stored(e?.primary)],
      ['실제 저장 · 직전 확인 저장 · UTF8', stored(e?.lastGood)],
      ['실제 저장 · 프로젝트 백업 · UTF8', stored(e?.projectBackups)],
      ['메모리 내부 · 레이아웃 변경 이력 · UTF8', fmtBytes(m?.layoutRevisionsUTF8Bytes)],
      ['전체 origin 키+값', 'UTF8: ' + fmtBytes(o?.utf8Bytes) + ' / 추정 UTF16: ' + fmtBytes(o?.approxUTF16Bytes)],
      ['앱 키+값', 'UTF8: ' + fmtBytes(o?.appUTF8Bytes) + ' / 추정 UTF16: ' + fmtBytes(o?.appApproxUTF16Bytes)],
      ['마지막 확인 저장 시각', fmtTime(snap.lastConfirmedSave)],
      ['현재 저장 상태', STATE_TEXT[snap.status] ?? '미확인'],
      ['마지막 실패', f ? (f.code || '미확인') + ' / 단계: ' + (f.stage || '미확인') + ' / ' + fmtTime(f.time) : '미확인 (기록 없음)'],
    ];
    const table = document.createElement('table');
    for (const [label, value] of rows) {
      const tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.scope = 'row';
      th.textContent = label;
      td.textContent = value;
      tr.append(th, td);
      table.append(tr);
    }
    q('[data-summary]').replaceChildren(table);
  }
  async function refresh() {
    const mine = ++request;
    const s = session.state;
    q('[data-state]').textContent = (STATE_TEXT[s.status] ?? s.status) + (s.error ? ' · ' + s.error.message : '') + (s.error?.code === 'QUOTA' ? ' · ' + riskText() : '');
    const est = q('[data-estimate]');
    est.textContent = 'origin API estimate 조회 중 · 정확한 localStorage quota/남은 용량이 아닙니다.';
    try {
      const snap = await snapshot();
      if (mine !== request) return;
      renderSummary(snap);
      q('[data-metrics]').textContent = JSON.stringify(snap, null, 2);
    } catch (e) {
      renderSummary({});
      q('[data-metrics]').textContent = '측정 불완전: ' + (e?.name || 'Error');
    }
    try {
      if (typeof navigator.storage?.estimate !== 'function') { est.textContent = 'origin API estimate 사용 불가 · 실제 localStorage 남은 용량은 알 수 없습니다.'; return; }
      const r = await navigator.storage.estimate();
      if (mine === request) est.textContent = 'origin API estimate (정확한 localStorage quota/남은 용량 아님): usage ' + (Number.isFinite(r.usage) ? r.usage : '미확인') + ' bytes / quota ' + (Number.isFinite(r.quota) ? r.quota : '미확인') + ' bytes.';
    } catch (e) {
      if (mine === request) est.textContent = 'origin API estimate 조회 실패: ' + (e?.name || 'Error') + ' · 실제 localStorage 남은 용량은 알 수 없습니다.';
    }
  }
  q('[data-refresh]').addEventListener('click', refresh);
  q('[data-download]').addEventListener('click', exportCurrent);
  q('[data-recovery]').addEventListener('click', exportRecovery);
  q('[data-retry]').addEventListener('click', () => session.save().then(refresh));
  async function openStorage() {
    sd.showModal();
    await refresh();
  }

  return { observe, riskText, exportCurrent, exportRecovery, importFile, openBackups, openStorage };
}
