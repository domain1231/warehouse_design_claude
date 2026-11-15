// 랙 상세 대화상자(기준본 65 sInfoDialog: S.openInfo·S.renderInfo, 내려받기 SVG·PNG·CSV, 실제 설비 확인).
import { esc } from '../cad/scene.js';
import { rackInfoSvg, rackSummary, itemDetail, filteredShelves, rackItems, rackCsvRows, csvEncode, specWarning } from '../warehouse/rackinfo.js';

const MARKUP = `<header><h2 id="sInfoTitle" data-title>랙 상세 · 선반별 자재</h2><button type="button" id="sInfoClose" aria-label="랙 상세 닫기" data-close data-testid="detail-close">닫기 ×</button></header>
<div id="sInfoSummary" class="s-summary detail-summary" data-testid="detail-summary"></div>
<div class="s-note" id="sInfoMeaning">현재 화면은 로케이션 기반 논리적 자재 배치도입니다. 실제 자재의 가로·세로 점유 크기를 나타내지 않습니다.</div>
<div class="s-info-tools"><input id="sInfoSearch" data-search data-testid="detail-search" placeholder="품목코드·품목명·로케이션 검색" aria-label="자재 검색"><select id="sInfoShelf" data-shelf data-testid="detail-shelf" aria-label="선반 필터"><option value="">전체 선반</option></select><select id="sShelfOrder" data-order data-testid="detail-order" aria-label="선반 번호 방향"><option value="bottom">1번 선반이 아래 (사용자 설정)</option><option value="top">1번 선반이 위 (사용자 설정)</option></select><select id="sInfoMode" aria-label="자재 배치 표시 방식"><option value="logical">논리적 위치</option><option value="measured" disabled>실측 위치 (미지원)</option></select><button type="button" id="sInfoSvg" data-svg>선반 SVG</button><button type="button" id="sInfoPng" data-png>선반 PNG</button><button type="button" id="sInfoCsv" data-csv>자재 CSV</button></div>
<div class="s-info-grid"><div id="sElevation" class="s-elevation detail-elevation" data-testid="detail-elevation"></div><aside id="sInfoDetail" class="s-info-detail detail-item" data-testid="detail-item"></aside></div>
<p class="s-note">선반 번호 방향은 Excel에서 확인할 수 없어 사용자가 지정합니다. 카드 폭과 선반 간격은 가독성을 위한 논리적 표시입니다. 높이 막대만 자재높이 ÷ 선반높이로 계산합니다. 원본 현재고가 없으면 실제 적재율은 미확인입니다.</p>`;

/**
 * @param {{ getProject: () => object, getLayout: () => object, saveOrder: (order: string) => void, download: (name: string, data: string|Blob, type?: string) => void, toast: (t: string) => void }} deps
 */
export function createRackDetail({ getProject, getLayout, saveOrder, download, toast }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'sInfoDialog';
  dialog.className = 'detail-dialog s-info';
  dialog.dataset.testid = 'detail-dialog';
  dialog.innerHTML = MARKUP;
  document.body.append(dialog);
  const $ = (sel) => dialog.querySelector(sel);
  let info = { rackId: null, shelf: '', item: null, search: '' };
  const rack = () => {
    return getProject() && getLayout().objects.find((o) => o.id === info.rackId && o.kind === 'rack');
  };

  function render() {
    const o = rack();
    if (!o) return dialog.close();
    const p = getProject();
    $('[data-title]').textContent = `${o.code} · 선반별 자재`;
    $('[data-order]').value = p.rackInfographic.shelfOrder;
    $('[data-testid=detail-summary]').innerHTML = rackSummary(o).map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`).join('') + (o.specificationChanged ? `<div class="warnbox">${esc(specWarning(o))}</div>` : '');
    const box = $('.detail-elevation');
    box.innerHTML = rackInfoSvg(o, { shelfOrder: p.rackInfographic.shelfOrder, info });
    const chosen = rackItems(o).find((i) => i.location === info.item);
    const side = $('.detail-item');
    if (chosen) {
      side.innerHTML = `<h3>선택 자재 · 원본 정보</h3><dl>${itemDetail(chosen).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    } else {
      side.innerHTML = `<h3>${info.shelf ? esc(info.shelf) + '번 선반 자재' : '선반·자재 선택'}</h3><p class="muted">선반을 누르면 해당 선반, 카드를 누르면 원본 자재 상세정보가 표시됩니다.</p>`
        + filteredShelves(o, info).flatMap((s) => s.items).map((i) => `<button type="button" class="item-row" data-detail="${esc(i.location)}">${esc(i.location)} · ${esc(i.itemName)}</button>`).join('');
    }
  }

  $('[data-close]').addEventListener('click', () => dialog.close());
  $('.detail-elevation').addEventListener('click', (e) => {
    const card = e.target.closest('[data-item]');
    if (card) {
      info.item = card.dataset.item;
      return render();
    }
    const shelf = e.target.closest('[data-shelf]');
    if (shelf) {
      info.shelf = shelf.dataset.shelf;
      info.item = null;
      $('[data-shelf]').value = info.shelf;
      render();
    }
  });
  $('.detail-item').addEventListener('click', (e) => {
    const b = e.target.closest('[data-detail]');
    if (b) {
      info.item = b.dataset.detail;
      render();
    }
  });
  $('select[data-shelf]').addEventListener('change', (e) => { info.shelf = e.target.value; info.item = null; render(); });
  $('[data-search]').addEventListener('input', (e) => { info.search = e.target.value; info.item = null; render(); });
  $('[data-order]').addEventListener('change', (e) => saveOrder(e.target.value));
  const name = (suffix) => `${rack()?.code || 'rack'}_${suffix}`;
  $('[data-svg]').addEventListener('click', () => download(name('shelves.svg'), rackInfoSvg(rack(), { shelfOrder: getProject().rackInfographic.shelfOrder, info }), 'image/svg+xml;charset=utf-8'));
  $('[data-csv]').addEventListener('click', () => download(name('materials.csv'), csvEncode(rackCsvRows(rack(), info)), 'text/csv;charset=utf-8'));
  $('[data-png]').addEventListener('click', async () => {
    const url = URL.createObjectURL(new Blob([rackInfoSvg(rack(), { shelfOrder: getProject().rackInfographic.shelfOrder, info })], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise((res, rej) => { image.onload = res; image.onerror = rej; image.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG 생성 실패');
      download(name('shelves.png'), blob);
    } catch (e) {
      toast(e.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  return {
    element: dialog,
    open(rackId) {
      info = { rackId, shelf: '', item: null, search: '' };
      const o = rack();
      if (!o) return;
      $('[data-search]').value = '';
      $('select[data-shelf]').innerHTML = '<option value="">전체 선반</option>' + (o.excel?.shelves || []).slice().sort((a, b) => a.level - b.level).map((s) => `<option value="${s.level}">${s.level}번 선반</option>`).join('');
      render();
      if (!dialog.open) dialog.showModal();
    },
    refresh: () => dialog.open && render(),
  };
}
