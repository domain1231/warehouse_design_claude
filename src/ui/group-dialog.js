// 다중 랙 편집 대화상자(기준본 50 mEditDialog: M.open·M.previewEdit·M.applyEdit).
// 계산은 commands.calculateGroup, 적용은 commands.applyGroupPreview. 적용 전까지 배치는 바뀌지 않는다.
import { GROUP_ACTIONS, groupCommandName, readGroupConfig, calculateGroup, applyGroupPreview, newSpatialWarnings, active } from '../warehouse/commands.js';
import { buildScene, esc } from '../cad/scene.js';
import { polygon } from '../geometry/polygons.js';
import { formatNumber as fmt } from '../core/format.js';

const opts = (list) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const MARKUP = `<form method="dialog" class="group-form">
<header class="dialog-head"><h2>다중 랙 편집 / 적용 전 미리보기</h2><button type="button" data-close data-testid="group-close">취소 ×</button></header>
<p class="muted">회전한 다각형의 X/Y 외접 경계를 기준으로 정렬·간격을 계산합니다. 적용 전까지 저장된 배치는 바뀌지 않습니다.</p>
<div class="group-grid"><section class="fields">
<label class="full">동작<select name="action" data-testid="group-action">${opts(GROUP_ACTIONS)}</select></label>
<label>정렬 기준<select name="reference">${opts([['group', '선택 그룹 전체 경계'], ['first', '처음 선택한 기준 랙'], ['line', '직접 입력한 기준선'], ['warehouse', '창고 외벽']])}</select></label>
<label>기준선 좌표 (m)<input name="line" type="number" value="0" step="0.001"></label>
<label>간격 방식<select name="spacing">${opts([['fixed', '고정 간격'], ['between', '시작·끝 사이 균등 분배']])}</select></label>
<label>외곽 사이 간격 (m)<input name="gap" type="number" value="0.3" min="0" step="0.001" data-testid="group-gap"></label>
<label>고정할 위치<select name="anchor">${opts([['first', '현재 첫 랙'], ['last', '현재 마지막 랙'], ['center', '그룹 중심'], ['reference', '처음 선택한 기준 랙']])}</select></label>
<label>순서<select name="order">${opts([['x', '현재 X 좌표'], ['y', '현재 Y 좌표'], ['locationAsc', '로케이션 오름차순'], ['locationDesc', '로케이션 내림차순'], ['selection', '선택한 순서'], ['custom', '직접 지정 순서']])}</select></label>
<label class="full">직접 순서 (랙 번호를 쉼표로 구분)<input name="custom" placeholder="7F-C-1,7F-C-2,7F-C-10"></label>
<label>이동 ΔX (m)<input name="dx" type="number" value="0" step="0.001"></label>
<label>이동 ΔY (m)<input name="dy" type="number" value="0" step="0.001"></label>
<label>회전 (°)<input name="angle" type="number" value="90" step="1"></label>
<label class="check"><input name="reverse" type="checkbox"> 순서 반전</label>
<label class="check full"><input name="allow" type="checkbox" data-testid="group-allow"> 이번 변경의 공간 위반을 확인하고 허용</label>
<p class="info full" data-testid="group-length"></p>
<p class="muted full">일렬 배치는 가로=상단, 세로=좌측 정렬을 함께 수행합니다. 간격 배치는 다른 축의 좌표를 유지합니다. 균등 분배는 양 끝 랙을 고정하고 외곽 사이 여유를 동일하게 만듭니다.</p>
</section><section><svg class="group-preview" data-testid="group-preview" role="img" aria-label="변경 미리보기"></svg>
<p class="info" data-testid="group-summary"></p><div class="group-issues" data-testid="group-issues"></div></section></div>
<footer class="dialog-foot"><button type="button" data-apply class="primary" data-testid="group-apply" disabled>그룹 전체에 적용</button></footer>
</form>`;

/**
 * @param {{ getProject: () => object, getSelection: () => string[], toast: (t: string) => void, apply: (label: string, mutate: Function, overrideAllow: boolean) => Promise<any> }} deps
 */
export function createGroupDialog({ getProject, getSelection, toast, apply }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'group-dialog';
  dialog.dataset.testid = 'group-dialog';
  dialog.innerHTML = MARKUP;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const $ = (sel) => dialog.querySelector(sel);
  const field = (name) => form.elements.namedItem(name);
  let preview = null;

  function refresh() {
    preview = null;
    $('[data-apply]').disabled = true;
    const p = getProject();
    const ids = getSelection();
    try {
      const raw = Object.fromEntries(['action', 'reference', 'line', 'spacing', 'gap', 'anchor', 'order', 'custom', 'dx', 'dy', 'angle'].map((k) => [k, field(k).value]));
      raw.reverse = field('reverse').checked;
      const r = calculateGroup(active(p), ids, readGroupConfig(raw), { fmt });
      const invalid = newSpatialWarnings(p, r.before, r.layout, r.targetIds);
      preview = r;
      const w = r.layout.warehouse;
      const svg = $('.group-preview');
      svg.setAttribute('viewBox', `-1.2 -1.2 ${w.width + 2.4} ${w.height + 2.4}`);
      svg.innerHTML = buildScene(r.layout, p, { tool: 'none' }).svg + r.before.objects.filter((o) => r.targetIds.has(o.id)).map((o) => `<polygon points="${polygon(o).map((q) => q.join(',')).join(' ')}" fill="none" stroke="#d0d8e7" stroke-opacity=".45" stroke-width=".035" stroke-dasharray=".12 .1" pointer-events="none"/>`).join('');
      $('[data-testid=group-length]').textContent = r.lengthInfo || '정렬 기준: 회전 외곽 경계 / 전체 랙 일괄 적용';
      $('[data-testid=group-summary]').textContent = `${ids.length}개 랙 · 적용 관련 공간 위반 ${invalid.length}건 · 회색 점선=변경 전 외곽`;
      $('[data-testid=group-issues]').innerHTML = invalid.map((x) => `<p class="warn-line">${esc(x.text)}</p>`).join('') || '<p class="info">이 변경으로 평가된 공간 위반 없음</p>';
      $('[data-apply]').disabled = invalid.length > 0 && !field('allow').checked;
    } catch (e) {
      $('[data-testid=group-summary]').textContent = e.message;
      $('[data-testid=group-length]').textContent = e.message;
      $('[data-testid=group-issues]').innerHTML = '';
      $('.group-preview').innerHTML = '';
    }
  }

  form.addEventListener('change', refresh);
  form.addEventListener('input', (e) => { if (e.target.type === 'number') refresh(); });
  $('[data-close]').addEventListener('click', () => dialog.close());
  $('[data-apply]').addEventListener('click', async () => {
    refresh();
    if (!preview || $('[data-apply]').disabled) return;
    const r = await apply(groupCommandName(preview.config.action), applyGroupPreview(preview), field('allow').checked);
    if (r?.ok) dialog.close();
  });

  return {
    element: dialog,
    /** 기준본 M.open(action). extra.gap은 간격 배치 단추 옆 입력값. */
    open(action, extra = {}) {
      const p = getProject();
      if (getSelection().length < 2) return toast('현재 편집에서 랙을 2개 이상 선택하세요.');
      const g = p.editing.groupEditing ?? {};
      field('action').value = action;
      field('gap').value = String(extra.gap ?? g.gap ?? 0.3);
      field('order').value = action.endsWith('Y') ? 'y' : g.order || 'x';
      field('anchor').value = g.anchor || 'first';
      field('allow').checked = p.editing.allowWarnings;
      if (!dialog.open) dialog.showModal();
      refresh();
    },
    close: () => dialog.close(),
  };
}
