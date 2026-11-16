// 사용 안내·프로그램 정보 대화상자(기준본 v2.4.1 helpDialog·aboutDialog 99-bootstrap). 문구는 기준본 그대로, 버전 값만 이 앱의 값.
// 문서 URL(라이선스 원문·배포 안내 링크)은 불러오는 자원이 아니며 pnpm verify의 허용 목록(D-035)에 있다.
const HELP = `<button class="close" data-close="">닫기 ×</button><h2>Warehouse Studio 사용 안내</h2><p>이 파일 하나를 Chrome 또는 Edge로 열면 인터넷 없이 사용할 수 있습니다. 초기 샘플은 첨부된 흰색 평면도의 열 배치·문·기둥을 참고하고, 어두운 대시보드의 색상 표현을 반영했습니다. 치수·위치는 실측이 아니며 모든 재고는 미입력입니다.</p><ol><li>가로·세로를 입력하고 <b>치수 적용</b>을 누릅니다. 공간 축척만 바뀌며 기존 객체 좌표를 임의로 늘리지 않습니다. 벽 밖 객체는 경고됩니다.</li><li><b>랙 추가</b>를 선택하고 도면을 클릭하거나 랙 카드를 끌어 놓습니다. 객체를 선택해 드래그하거나 우측에서 정확한 좌표·규격·임의 각도를 입력합니다. 입력 좌표는 스냅 없이 그대로 적용됩니다.</li><li>Shift+클릭으로 여러 객체를 선택합니다. 모바일은 정보 패널의 다중 선택 체크를 사용합니다. 선택 객체는 90도 회전·복제·삭제·좌측/상단 정렬·가로 간격 배치가 가능합니다.</li><li>랙의 최대 수량과 현재 수량을 입력하면 색상이 바뀝니다. 최대 수량 0/미입력, 현재 미입력은 미확인입니다. BOX·EA·PLT는 별도로 합산합니다. 단위별 전체 적재율은 양쪽 값이 확인된 랙만 포함하고 확인 랙 수를 표시합니다.</li><li>재고 이력을 저장하려면 날짜와 출처를 지정해 <b>현재 기록 저장</b>을 누릅니다. 해당 날짜의 배치도 함께 저장할 수 있습니다. 과거 조회는 읽기 전용이며 현재 작업을 덮어쓰지 않습니다. 해당 날짜에 없는 랙 재고는 ‘기록 없음’입니다. 배치 이력이 없으면 현재 배치임을 표시합니다.</li><li>Before와 After는 독립적으로 편집·자동 저장됩니다. <b>Before → After</b>는 개선안을 현재안 복사본으로 교체합니다. 비교 창은 두 배치의 면적·보관능력·경고 및 증감을 보여줍니다.</li><li>JSON은 프로젝트·두 배치·이력·배경·설정을 모두 백업합니다. CSV는 <code>date,rackId,capacity,quantity,unit,source</code> 형식이며 rackId는 변경되지 않는 내부 ID입니다. <b>CSV 양식</b>의 ID를 사용하세요. 빈 수량은 미확인, 날짜는 YYYY-MM-DD입니다. 한국어 헤더 날짜/랙ID/최대수량/현재수량/단위/출처도 지원합니다. 가져오기는 이력에 반영하며 현재 수량은 자동 변경하지 않습니다.</li><li>PNG/SVG 출력에는 현재 조회 상태의 도면 전체·제목·치수·지표·범례가 들어갑니다. 검색 필터는 도면 객체를 흐리게만 표시하며 보고서 출력은 전체 객체를 표시합니다.</li></ol><h3>Excel 연동 추가 기능</h3><p>Excel 데이터 관리에서 XLSX/UTF-8 CSV를 불러오고 워크시트·머리글 행·20개 매핑을 확인하세요. 미리보기 설정을 확인한 후 적용합니다. 같은 랙을 하나로 묶어 선반→자재를 연결합니다. 가로·세로를 입력하고 A열 기준점을 지정하세요. 기준점은 가장 작은 등록 번호 랙의 회전 외곽 좌상단입니다. 북쪽/남쪽은 번호 증가 방향이며 랙 자체의 회전과 별개입니다. 북쪽 표시를 바꾸면 동·서 및 번호 증가 방향도 함께 회전합니다.</p><p>병합/업데이트는 위치 유지 또는 재배치를 선택해야 합니다. 사라진 랙은 자동 삭제하지 않으며 상세정보에서 이번 파일 미등록을 표시합니다. 데이터에 없는 번호는 선택하지 않으면 생성하지 않습니다. 후보 랙의 실존 여부는 별도 확인하세요. 재불러오기 기준일은 사용자가 지정하고, 동일 날짜 이력 교체는 확인 후 실행합니다. 실제 현재고 수량은 생성하지 않습니다.</p><p>높이 활용률은 부피/수량 적재율과 다릅니다. 선반별 최대 자재높이를 선택한 뒤 높이 가중평균·단순평균·최대값 중 지정한 정책으로 계산합니다. 자재는 논리적 순서의 목록이며 선반 내 실제 위치나 점유 면적은 추정하지 않습니다. 품목 관리 모드는 개별 ROP/MAX Stock/평균 입고량을 상세 패널에서 확인하는 모드이며 서로 다른 품목을 합산한 적재율을 만들지 않습니다.</p><p>XLSX는 저장된 수식 결과를 읽으며 수식을 실행하지 않습니다. 누락·불일치·미확인 값은 경고합니다. 같은 파일명이어도 랙의 건물+층+열+번호를 기준으로 연결합니다. 새 파일에서 사라진 자재는 현재 목록에서 제거하되 이전 기준일의 Excel 스냅샷은 보존합니다. 파일 기준일의 Excel 정보 이력과 실제 재고 수량 이력은 별개입니다.</p><p>통로 목표 폭은 열 간 간격에 대한 검토 경고이며 통로의 실제 존재·연속성은 자동 확정하지 않습니다. 열 간 통로 도형은 실제 현장에 맞춰 기존 통로 도구로 지정하세요. 대용량 파일은 12MB / 시트 2만 행·201열 이내를 지원하며, 화면 조작 성능은 랙·이력 개수에 따라 달라집니다.</p><details><summary>오픈소스 사용 고지</summary><p>SheetJS Community Edition 0.20.3 · Copyright (C) 2012-present SheetJS LLC. Apache License 2.0. 오프라인 실행을 위해 라이브러리를 이 파일에 포함했습니다. <a href="https://docs.sheetjs.com/docs/getting-started/installation/standalone/" target="_blank" rel="noopener">공식 배포 안내</a></p><pre style="white-space:pre-wrap;font-size:11px">                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright (C) 2012-present   SheetJS LLC

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
</pre></details><h3>v2.3.3 Excel 대상·잠금·비교</h3><p>Excel 가져오기에서 BEFORE/AFTER를 확인하고 선택한 배치에만 반영합니다. 자동 백업과 새 상태를 함께 저장하며 저장 실패 시 전체 취소됩니다. BEFORE 잠금은 조회를 허용하고 편집을 막습니다. BEFORE→AFTER 복제는 미리보기·확인 후 실행하며 기존 AFTER를 백업합니다. 비교의 색 테두리·화살표는 재고 색상과 별도입니다. 이전 버전에서 배치가 지정되지 않은 공통 ID 재고 이력은 미확인 범위로 보관하며 자동으로 어느 배치의 수량으로도 사용하지 않습니다.</p><h3>v2.3.2 하단 패널</h3><p>v2.2의 위쪽 이력 영역, 아래쪽 랙 목록(왼쪽)·공간 검토(오른쪽) 배치를 복원했습니다. 재고기록과 배치이력은 별도 버튼으로 접습니다. 날짜 조회는 공통으로 유지하며 패널 표시만 바꿔서는 재고나 배치가 수정되지 않습니다. 배치의 조회·복원·비교는 각 항목의 명시적 버튼을 사용하세요. 기본 레이아웃 복원은 화면 구성만 초기화합니다. 가로로 나란한 두 패널은 양쪽을 접었을 때 행 높이가 줄어듭니다.</p><h3>객체 크기 및 랙 상세</h3><p>하단 4개 영역은 각각 접고 펼칠 수 있습니다. 도면 아래 손잡이를 위아래로 끌어 높이를 바꿉니다. 단일 객체 선택 후 8개 사각 핸들로 폭·깊이를 조절합니다. 비율 잠금과 최소·최대 치수는 선택 정보에서 설정합니다. 충돌은 기본적으로 전체 취소되며 명시적인 경고 후 허용 설정을 따릅니다. 높이는 숫자로 입력합니다.</p><p>랙 더블클릭 또는 선택 정보의 선반별 자재 상세 버튼으로 선반과 자재를 봅니다. 카드 배치는 논리적 위치이며 자재 실측 평면 배치는 미지원입니다. Excel 원본 규격과 설계 규격을 별도로 보관하고 변경 이력을 JSON에 저장합니다. 설비 변경 확인은 별도 버튼으로 사용자가 기록하며 Excel 원본값을 변경하지 않습니다.</p><h3>v2.2 다중 편집 및 통로 검토</h3><p>빈 공간 드래그로 영역 선택, Ctrl+클릭 토글, Shift+클릭 추가, Ctrl+A 전체 랙 선택을 지원합니다. 영역 선택 기준은 일부 겹침/완전 포함입니다. 선택 그룹은 같은 거리로 이동하며 기본적으로 공간 위반 시 전체 취소됩니다. 경고 후 허용은 사용자가 명시적으로 선택해야 합니다.</p><p>2개 이상 랙을 선택하면 우측 그룹 패널에서 6방향 정렬, 가로·세로 일렬 배치, 간격 배치, 그룹 이동·중심 회전을 미리볼 수 있습니다. 회전 외접 경계로 정렬하고 실제 다각형으로 충돌을 판정합니다. 간격은 외곽 사이 거리입니다. 시작·끝 균등 분배는 양 끝을 고정하고, 고정 간격은 첫/마지막/중심/기준 랙 유지 중 선택합니다. 회색 점선은 변경 전 외곽입니다.</p><p>보호 통로는 사각형 또는 3~60개 꼭짓점의 자기 교차 없는 다각형입니다. 폭 방향은 통로의 회전과 함께 움직이는 로컬 X/Y축으로 지정합니다. 단면별 최대 연속 여유 폭 중 최솟값을 계산하며, 꼭짓점·모서리 교차·여유 폭 교차 위치를 평가합니다. 침범은 최소 폭 통과와 별도로 경고합니다. 지정 출입문과 구역이 접촉하는지는 확인하지만, 전체 이동 경로·피난 연결·차량 회전·하중·법규 적합성은 판정하지 않습니다.</p><p>단면 폭은 같은 경로를 따라 이동할 수 있음을 증명하지 않습니다. 장애물 양쪽에서 가장 넓은 여유 구간이 위치마다 달라질 수 있습니다. 부분 랙 검사에서는 대상 밖 랙을 제외하므로 전체 창고가 통과한 것으로 해석하지 마세요. 정상 표시는 설정한 단면 폭 기준만 뜻합니다.</p><p>기본 확대는 창고 중심 고정입니다. 수동 화면 이동이나 선택 확대에서는 자유 탐색하고, 중앙 정렬/기본 배율로 복귀합니다. 두 손가락 핀치를 지원하며 랙 좌표는 바뀌지 않습니다. 패널을 접거나 화면 크기를 바꿔도 잠긴 창고 중심을 유지합니다. 모바일은 외부 음영 터치로 메뉴를 닫습니다.</p><p>그룹 작업은 한 번의 실행 취소로 복원합니다. 좌표·회전만 바꾸는 작업은 Excel 로케이션·선반·자재·재고 이력을 바꾸지 않습니다. 복제 랙은 고유 키 중복 연결을 막기 위해 Excel 연결을 해제한 일반 랙으로 생성합니다. 정렬만으로 보관능력이 증가했다고 계산하지 않으며 신규 랙 추가 가능성은 미판정입니다. 전후 비교 이미지·좌표 표·통로 CSV를 출력할 수 있습니다.</p><h3>단축키 · 터치</h3><p>Ctrl+Z 취소 · Ctrl+Y / Ctrl+Shift+Z 다시 · Ctrl+C/V 객체 복사/붙여넣기 · Delete 삭제 · R 회전 · Esc 선택/도구 취소. 입력 중에는 일반 텍스트 편집을 유지합니다. 휠은 포인터 중심 확대/축소입니다. 터치는 선택/이동과 화면 이동 도구를 구분하고, 확대/축소 버튼을 사용합니다. 터치 두 손가락 핀치 확대·축소를 지원합니다.</p><h3>계산 및 구현 범위</h3><ul><li>회전 사각형 간 충돌은 분리축 검사로 판정합니다. 랙 사이 여유는 바닥 다각형의 최단거리이며 양수로 지정할 때만 검사합니다. 천장보다 높은 랙도 경고합니다.</li><li>문 열림 영역은 문 폭 × 지정 깊이의 <b>보수적인 직사각형 안전 구역</b>으로 검사합니다. 열림 방향은 4개 방향으로 조정하고 부채꼴은 시각적 참고입니다. 경첩 곡선·양개문 시뮬레이션은 지원하지 않습니다.</li><li>사각형·다각형 보호 통로의 지정 로컬 단면에서 유효 폭을 검사합니다. 지정한 최소 폭과 목표 폭 미달, 랙·고정물 침범을 경고합니다. 연속 이동 경로·회전 반경·피난 가능 여부는 자동 검증하지 않습니다.</li><li>잔여 면적은 창고 경계로 잘라낸 랙·내부벽·문 안전 구역·기둥·보관 불가·통로·작업 구역의 다각형 합집합을 빼서 구합니다. 랙 점유 면적은 요구 명세대로 개별 폭×깊이 합계라 겹침/경계 이탈 시 별도 주의가 필요합니다. 잔여 면적은 새 랙을 실제로 넣을 수 있는 형상을 보증하지 않습니다.</li><li>외곽은 직사각형 고정입니다. 임의 외곽 다각형, CAD/DXF, 자동 최적 배치, 구조·하중 검증, 서버 공유, 실시간 MES 연동은 범위 밖입니다. 수백 개를 넘는 객체·대용량 이력은 속도 및 로컬 저장 용량의 한계가 있습니다.</li><li>배경은 선택 이미지를 파일 내부의 로컬 데이터로 저장합니다. 두 점 보정은 이미지 축척만 바꾸며 원근/회전 왜곡은 보정하지 않습니다. 위치와 가로·세로는 별도로 조정할 수 있습니다.</li><li>파일 위치/브라우저가 바뀌면 로컬 저장이 공유되지 않을 수 있습니다. 저장 실패 표시가 나오면 즉시 JSON 백업하세요. 취소 이력은 현재 세션의 최근 60단계까지입니다.</li></ul>`;
// 이 앱(재구축)의 요약. 기준본 v2.4.1의 변경 목록을 이 앱의 것으로 표시하지 않는다.
const CHANGES = [
  'Warehouse Layout Designer v2.4.1의 기능과 화면을 기준으로 새 구조에서 다시 만든 판입니다.',
  '프로젝트 데이터 스키마 2.3.6과 읽기·쓰기 호환을 유지합니다.',
  '저장은 쓰기 후 읽기 검증을 통과해야 저장됨으로 표시합니다.',
];
const dlg = (id, cls, html) => {
  const d = document.createElement('dialog');
  d.id = id;
  if (cls) d.className = cls;
  d.innerHTML = html;
  document.body.append(d);
  return d;
};

/** @param {{ appVersion: string, schemaVersion: string }} v */
export function createInfoDialogs({ appVersion, schemaVersion }) {
  const help = dlg('helpDialog', 'help', HELP);
  const about = dlg('aboutDialog', '', `<button class="close" id="aboutClose">닫기 ×</button><h2>Warehouse Layout Designer</h2><p id="aboutVersion">프로그램 v${appVersion}</p><p id="aboutSchema">프로젝트 데이터 ${schemaVersion}</p><p id="aboutBuild">v2.4.1 기능 기준 재구축 · 기준본 Commit d7b1e69</p><ul id="aboutChanges">${CHANGES.map((t) => `<li>${t}</li>`).join('')}</ul><a id="aboutRelease" target="_blank" rel="noopener noreferrer" href="https://github.com/domain1231/warehouse_design_claude/releases">GitHub Release 이력</a><p class="muted" id="aboutOffline">Release 이력은 인터넷에 연결한 뒤 확인할 수 있습니다.</p>`);
  const online = () => { about.querySelector('#aboutRelease').hidden = !navigator.onLine; about.querySelector('#aboutOffline').hidden = navigator.onLine; };
  online();
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  for (const d of [help, about]) d.querySelector('.close').addEventListener('click', () => d.close());
  document.getElementById('helpBtn').addEventListener('click', () => help.showModal());
  document.getElementById('aboutBtn').addEventListener('click', () => about.showModal());
}
