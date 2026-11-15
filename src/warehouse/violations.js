// 배치 위반 목록 표(기준본 90 W.list 비미리보기 + 92 열 모드 50행 페이징). DOM 없는 순수 함수.
import { excessText } from './constraints.js';
import { esc } from '../cad/scene.js';

export const ISSUE_NAMES = { boundary: '경계 초과', rackCollision: '랙 충돌', structureCollision: '구조물 충돌', aisle: '통로 기준', gap: '최소 간격', waiting: '배치 대기', column: '열 조건' };
export const VIOLATION_PAGE = 50;
export const VIOLATION_HEAD = ['랙 / 선택', '위반 유형·방향·초과 거리', '충돌 대상', '상태'];

/** 이슈가 있는 랙 행만, scan 순서 그대로. 열 모드는 페이지당 50행·행당 이슈 8·대상 8로 제한. */
export function violationRows(result, page = 0) {
  const all = result.rows.filter((r) => r.issues.length);
  if (!result.column) return { rows: all, page: 0, total: all.length };
  const pg = Math.min(Math.max(0, page), Math.max(0, Math.ceil(all.length / VIOLATION_PAGE) - 1));
  const rows = all.slice(pg * VIOLATION_PAGE, pg * VIOLATION_PAGE + VIOLATION_PAGE)
    .map((r) => ({ ...r, issues: r.issues.slice(0, 8).map((i) => ({ ...i, targets: i.targets.slice(0, 8) })) }));
  return { rows, page: pg, total: all.length };
}

export const violationStatus = (r, project, scenario = project.settings.scenario) =>
  r.issues.length ? (project.autoPlacement.reviewNotes?.[scenario]?.[r.id] === 'review' ? '검토 중' : '미해결') : '해결';

const pager = (page, total) => `<div class="row"><button type="button" data-cl-page="main" data-cl-next="${page - 1}" ${page <= 0 ? 'disabled' : ''}>이전</button><span>${total}건 · ${page + 1}/${Math.max(1, Math.ceil(total / VIOLATION_PAGE))}쪽 · ${VIOLATION_PAGE}건씩 표시</span><button type="button" data-cl-page="main" data-cl-next="${page + 1}" ${(page + 1) * VIOLATION_PAGE >= total ? 'disabled' : ''}>다음</button></div>`;

export function violationListHtml(result, project, page = 0) {
  const { rows, page: pg, total } = violationRows(result, page);
  const body = rows.map((r) => `<tr tabindex="0" data-w-rack="${esc(r.id)}"><td><button type="button" data-w-focus="${esc(r.id)}">${esc(r.code)}</button></td><td>${esc(r.issues.map((i) => `${ISSUE_NAMES[i.type]} · ${i.text}`).join(' / ') || '위반 없음')}<br>${esc(excessText(r.excess))}</td><td>${esc([...new Set(r.issues.flatMap((i) => i.targets.map((t) => `${t.code} (${t.id})`)))].join(', ') || '—')}</td><td>${violationStatus(r, project)}</td></tr>`).join('');
  return `<table class="w-table w-violations"><thead><tr>${VIOLATION_HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${result.column ? pager(pg, total) : ''}`;
}
