// 색상 설정·기본 색상 복원 대화상자(기준본 75 vThemeDialog·V.resetPreview). 변경은 edit(실행취소·검증 경로)로만 한다.
import { THEME_DEFAULT, esc } from '../cad/scene.js';
import { COLORS_DEFAULT } from '../core/project.js';
import { STATE_NAMES } from './inspector.js';

export const THEME_NAMES = Object.freeze({ bg: '메인 배경', panel: '좌우·하단 패널', card: '카드', line: '구분선', text: '기본 글자', muted: '보조 글자', blue: '강조·버튼', selected: '선택 테두리', header: '상단 배경', canvas: '도면 바탕', floor: '창고 내부', control: '입력·버튼 바탕' });
export const CONFIRM_ALL = '색상 설정만 변경됩니다. BEFORE·AFTER의 사용자 지정 객체색까지 기본값으로 복원합니까? 창고 데이터는 유지됩니다.';

/** 화면 전체에 UI 색상을 CSS 변수로 적용(기준본 V.applyTheme). --accent는 --blue와 같다. */
export function applyTheme(project) {
  const style = document.documentElement.style;
  for (const [k, c] of Object.entries({ ...THEME_DEFAULT, ...project.theme?.customColors })) style.setProperty('--' + k, c);
  style.setProperty('--accent', 'var(--blue)');
}

/** @param {{ project: () => object, edit: (label: string, mutate: Function) => Promise<boolean>, resetColors: Function, confirm?: (t: string) => boolean }} deps */
export function createThemeDialog({ project, edit, resetColors, confirm = (t) => window.confirm(t) }) {
  const d = document.createElement('dialog');
  d.id = 'vThemeDialog';
  d.className = 'theme-dialog';
  d.dataset.testid = 'theme-dialog';
  d.innerHTML = '<button type="button" class="close" id="vThemeClose" data-close data-testid="theme-close">취소·닫기 ×</button><h2>색상 설정 · 기본 색상 복원</h2><p class="muted">기본값 출처: 최초 warehouse_layout_designer_original.html. 색상 설정만 변경되며 랙 좌표·회전·규격·선반·재고·이력은 유지됩니다.</p><div class="theme-fields v-fields" id="vThemeFields" data-fields></div><button type="button" id="vThemeApply" data-apply data-testid="theme-apply">입력한 UI 색상 적용</button><hr><label>복원 범위<select id="vResetScope" data-scope data-testid="reset-scope"><option value="ui">UI 기본 테마만 복원</option><option value="occupancy">적재율 기본 색상·기준만 복원</option><option value="all">모든 색상 설정 복원 (양쪽 객체 지정색 포함)</option></select></label><div class="theme-preview" id="vResetPreview" data-preview data-testid="reset-preview"></div><button type="button" id="vResetApply" data-reset data-testid="reset-colors">미리본 기본 색상 복원</button><p class="muted">취소·닫기는 아직 적용하지 않은 입력과 미리보기를 취소합니다.</p>';
  document.body.append(d);
  const q = (s) => d.querySelector(s);

  /** 선택한 범위가 실제로 바꿀 항목(현재 → 기본). */
  function changes(scope) {
    const p = project(), rows = [];
    if (scope === 'ui' || scope === 'all') for (const [k, def] of Object.entries(THEME_DEFAULT)) rows.push([THEME_NAMES[k], p.theme.customColors[k] ?? def, def]);
    if (scope === 'occupancy' || scope === 'all') {
      for (const [k, def] of Object.entries(COLORS_DEFAULT)) rows.push([STATE_NAMES[k], p.settings.colors[k], def]);
      rows.push(['보통 시작 %', p.settings.low, 50], ['주의 시작 %', p.settings.high, 90]);
    }
    if (scope === 'all') {
      const n = Object.keys(p.theme.objectColors.before).length + Object.keys(p.theme.objectColors.after).length;
      rows.push(['지정 객체색 (BEFORE+AFTER)', `${n}개`, '0개'], ['색상 표시', p.theme.colorMode === 'custom' ? '사용자 지정' : '데이터 기반', '데이터 기반']);
    }
    return rows;
  }
  function preview() {
    const scope = q('[data-scope]').value, rows = changes(scope), diff = rows.filter((r) => String(r[1]).toLowerCase() !== String(r[2]).toLowerCase());
    const sw = (c) => (/^#/.test(c) ? `<span class="theme-swatch" style="background:${esc(c)}"></span>` : '');
    q('[data-preview]').innerHTML = `<p>적용 전 미리보기 · ${scope === 'all' ? '양쪽 배치의 개별 객체색도 해제하고 데이터 기반 모드로 복원' : '색상 설정만 복원'} · 변경 ${diff.length}건</p>`
      + (diff.length ? diff.map(([n, cur, def]) => `<div data-change>${sw(cur)}${esc(n)} ${esc(cur)} → ${sw(def)}${esc(def)}</div>`).join('') : '<p>이미 기본값입니다. 변경 없음.</p>')
      + (scope !== 'ui' ? '<p>실제 적재율 경계: 보통 50% / 주의 90% · 수량 값은 변경 없음</p>' : '');
  }
  function open() {
    const colors = { ...THEME_DEFAULT, ...project().theme.customColors };
    q('[data-fields]').innerHTML = Object.entries(THEME_NAMES).map(([k, n]) => `<label>${n}<input type="color" data-theme-key="${k}" data-testid="theme-${k}" value="${colors[k]}"><small>최초 ${THEME_DEFAULT[k]}</small></label>`).join('');
    preview();
    d.showModal();
  }
  q('[data-close]').addEventListener('click', () => d.close());
  q('[data-scope]').addEventListener('change', preview);
  q('[data-apply]').addEventListener('click', async () => {
    const colors = Object.fromEntries([...d.querySelectorAll('[data-theme-key]')].map((i) => [i.dataset.themeKey, i.value]));
    if (await edit('UI 색상 적용', (draft) => { draft.theme.customColors = colors; draft.theme.presetId = 'custom'; })) d.close();
  });
  q('[data-reset]').addEventListener('click', async () => {
    const scope = q('[data-scope]').value;
    if (scope === 'all' && !confirm(CONFIRM_ALL)) return;
    if (await edit('기본 색상 복원', (draft) => resetColors(draft, scope))) d.close();
  });
  return { open };
}
