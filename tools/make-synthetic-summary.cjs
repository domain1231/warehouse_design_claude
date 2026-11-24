// 가상 자료(SYNTHETIC) 생성기: fixtures/excel/synthetic-summary.xlsx — C7 Excel Summary 대조 시험용. 실제 업무 Excel이 아니다.
// 시트 '가상호BE': 3행 머리글·4행 Summary 값(F4·G4는 행 계산과 일부러 다름, G4는 수식 없는 직접 입력), 8행 머리글, 9~16행 데이터.
// 표 범위는 A8:T15라 16행은 표 밖. 'Buffer Rack'(형식 밖 로케이션)과 자재높이 > 단 높이 행을 포함한다.
// 시트 'Summary': B4 "용적률 80% 미만 \nQ'ty", 5행 구분/AS-IS/TO-BE, 6~7행 '가상2호'(9)·'가상호'(AS-IS 6 = 앱 계산과 같음, TO-BE 빈칸).
// 사용: node tools/make-synthetic-summary.cjs
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');

const HEADER = ['No.', '로케이션', '품목코드', '품목명', '규격', 'ROP', 'MAX  Stock', '3개월 평균 입고수량', 'Rack 단수', '혼적수', 'Rack 가로(mm)', 'Rack 세로 (mm)', 'Rack 높이 (mm)', 'Rack 단 높이 (mm)', '자재높이 (mm)', '용적률(%)', '랙 용적률(%)', '사용 면적(㎡)', '유휴 공간', '비고'];
const D = [1000, 1000, 2000];
const data = [ // [로케이션, 단 높이, 자재높이]
  ['7F-A-1-1-1', 400, 100], ['7F-A-1-2-1', 400, 500], ['7F-A-2-1-1', 400, 200], ['7F-A-2-2-1', 400, 400],
  ['7F-B-1-1-1', 400, 300], ['Buffer Rack', 400, 100], ['7F-B-2-1-1', 400, 200], ['7F-C-1-1-1', 400, 100],
];
const col = (c) => String.fromCharCode(65 + c);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (r, v) => `<c r="${r}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
const num = (r, v, f) => `<c r="${r}">${f ? `<f>${esc(f)}</f>` : ''}<v>${v}</v></c>`;
const row = (n, cells) => `<row r="${n}">${cells.join('')}</row>`;

const rows = [
  row(1, [str('A1', '가상 자료 (SYNTHETIC) — 실제 업무 Excel이 아님')]),
  row(3, [str('C3', '총 면적 m²'), str('D3', '면적 사용률 (%)'), str('E3', '통로 비중 (%)'), str('F3', '평균 용적률 (%)'), str('G3', "Rack Q'ty"), str('H3', "유휴 공간 \nRack Q'ty")]),
  row(4, [num('C4', 40), num('D4', 0.15, 'SUM(Table1[사용 면적(m2)])/C4'), num('E4', 0.85, '1-D4'), num('F4', 0.5, 'AVERAGE(Table1[랙 용적률(%)])'), num('G4', 3), num('H4', 0, 'COUNTIF(Table1[유휴 공간],">500")')]),
  row(8, HEADER.map((h, c) => str(col(c) + 8, h))),
  ...data.map(([loc, sh, mh], i) => {
    const r = 9 + i, c = [num(`A${r}`, i + 1), str(`B${r}`, loc), str(`C${r}`, 'SYN-' + (i + 1)), str(`D${r}`, '가상 품목 ' + (i + 1))];
    D.forEach((v, k) => c.push(num(`${col(10 + k)}${r}`, v)));
    c.push(num(`N${r}`, sh), num(`O${r}`, mh));
    // Q열(용적률) 수식: 대부분의 행은 일부러 단 높이(N)가 아닌 MAX Stock(G)으로 나눈다(실제 업무 Excel에서 본 오류 유형을 가상으로 재현).
    c.push(`<c r="P${r}"><f>${i >= 3 ? `O${r}/G${r}` : `IFERROR(O${r}/N${r},0)`}</f><v>0</v></c>`);
    return row(r, c);
  }),
];
const sum = [
  row(4, [str('B4', "용적률 80% 미만 \nQ'ty")]),
  row(5, [str('B5', '구분'), str('C5', 'AS-IS'), str('D5', 'TO-BE')]),
  row(6, [str('B6', '가상2호'), num('C6', 9, 'COUNTIF(표1[용적률(%)],"<80%")')]),
  row(7, [str('B7', '가상호'), num('C7', 6, 'COUNTIF(표1[용적률(%)],"<80%")')]),
];
const sheet2 = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="B4:D7"/><sheetData>${sum.join('')}</sheetData></worksheet>`;
const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:T16"/><sheetData>${rows.join('')}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`;
const files = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="가상호BE" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': sheet,
  'xl/worksheets/sheet2.xml': sheet2,
  'xl/worksheets/_rels/sheet1.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>',
  'xl/tables/table1.xml': `<?xml version="1.0" encoding="UTF-8"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A8:T15"><tableColumns count="20">${HEADER.map((h, i) => `<tableColumn id="${i + 1}" name="${esc(h)}"/>`).join('')}</tableColumns></table>`,
};

function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name), raw = Buffer.from(text), d = zlib.deflateRawSync(raw), crc = zlib.crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(h, n, d); central.push(c, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22), k = Object.keys(entries).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(k, 8); e.writeUInt16LE(k, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, e]);
}
const out = path.join(__dirname, '../fixtures/excel/synthetic-summary.xlsx');
fs.writeFileSync(out, zip(files));
console.log('wrote', out);
