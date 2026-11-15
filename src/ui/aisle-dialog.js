// 통로 폭·보호 구역 검토 대화상자(기준본 50 M.validate). 읽기 전용: 프로젝트를 바꾸지 않고 실행취소에도 넣지 않는다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { aisleReviewRows, aisleCsvRows } from '../warehouse/aisles.js';

const MARKUP = `<div class="dialog-head"><h2>통로 폭 · 보호 구역 검토</h2><button type="button" id="mAisleClose" data-close data-testid="aisle-close">닫기 ×</button></div>
<div id="mAisleReport" data-testid="aisle-report"></div>
<div class="dialog-foot"><button type="button" id="mAisleCsv" data-testid="aisle-csv">통로 검토 CSV</button></div>`;

/** @param {{ getLayout: () => object, getWarnings: () => {text: string}[], csv: (name: string, rows: any[][]) => void }} deps */
export function createAisleDialog({ getLayout, getWarnings, csv }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'mAisleDialog';
  dialog.className = 'compare-dialog';
  dialog.dataset.testid = 'aisle-dialog';
  dialog.innerHTML = MARKUP;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  const report = dialog.querySelector('#mAisleReport');
  let rows = [];
  dialog.querySelector('#mAisleCsv').addEventListener('click', () => csv('aisle_clearance.csv', aisleCsvRows(rows)));
  return {
    open() {
      rows = aisleReviewRows(getLayout());
      const warns = getWarnings();
      const table = rows.length
        ? `<table class="records-table"><tr>${['통로', '상태', '현재 m', '최소 m', '목표 m', '부족 m', '침범 객체', '검사 범위', '문 구역 접촉'].map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.status)}</td><td>${fmt(r.width, 2)}</td><td>${fmt(r.min, 2)}</td><td>${fmt(r.target, 2)}</td><td>${fmt(r.shortage, 2)}</td><td>${esc(r.obstacles)}</td><td>${r.scope}</td><td>${r.door}</td></tr>`).join('')}</table>`
        : '<p class="info">지정된 보호 통로가 없습니다. 통로 도구 또는 다각형 통로 그리기로 구역을 먼저 지정하세요.</p>';
      report.innerHTML = `${table}<h3>랙·구조 검토</h3>${warns.length ? `<ol class="warning-list">${warns.map((w) => `<li>${esc(w.text)}</li>`).join('')}</ol>` : '<p class="info">설정 기준의 경고 없음</p>'}<p class="note">경로 연결·차량 회전·피난 적합성은 이 검토에서 판정하지 않습니다.</p>`;
      if (!dialog.open) dialog.showModal();
    },
  };
}
