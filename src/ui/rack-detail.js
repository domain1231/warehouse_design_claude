// 랙 상세 대화상자(기준본 65 sInfoDialog: S.openInfo·S.renderInfo, 내려받기 SVG·PNG·CSV, 실제 설비 확인).
import { esc } from '../cad/scene.js';
import { rackInfoSvg, rackSummary, itemDetail, filteredShelves, rackItems, rackCsvRows, csvEncode, specWarning } from '../warehouse/rackinfo.js';

const MARKUP = `<div class="dialog-head"><h2 data-title></h2><button type="button" data-close data-testid="detail-close">닫기 ×</button></div>
<div class="detail-summary" data-testid="detail-summary"></div>
<div class="detail-controls">
<label>선반<select data-shelf data-testid="detail-shelf"></select></label>
<label>선반 번호 방향<select data-order data-testid="detail-order"><option value="bottom">아래 → 위</option><option value="top">위 → 아래</option></select></label>
<label class="grow">자재 검색<input type="search" data-search data-testid="detail-search" placeholder="품목코드·품목명·로케이션"></label>
<button type="button" data-physical data-testid="detail-physical">실제 설비 변경 확인</button>
<button type="button" data-svg>SVG</button><button type="button" data-png>PNG</button><button type="button" data-csv>CSV</button>
</div>
<div class="detail-grid"><div class="detail-elevation" data-testid="detail-elevation"></div><div class="detail-item" data-testid="detail-item"></div></div>`;

/**
 * @param {{ getProject: () => object, getLayout: () => object, readOnly?: () => boolean, saveOrder: (order: string) => void, confirmPhysical: (rackId: string) => void, download: (name: string, data: string|Blob, type?: string) => void, toast: (t: string) => void }} deps
 */
export function createRackDetail({ getProject, getLayout, readOnly = () => false, saveOrder, confirmPhysical, download, toast }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'detail-dialog';
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
    $('[data-physical]').disabled = p.settings.scenario === 'before' && p.scenarioMeta.before.locked || readOnly();
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
  $('[data-physical]').addEventListener('click', () => {
    if (!confirm('현재 설계 치수를 실제 설비 변경으로 확인하여 기록합니까? Excel 원본 규격은 그대로 보존됩니다.')) return;
    confirmPhysical(info.rackId);
  });
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
