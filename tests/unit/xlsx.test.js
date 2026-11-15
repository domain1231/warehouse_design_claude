// XLSX 읽기 경계: 서식 문자열(발음 제외)·엔터티·_xHHHH_, 참/거짓, 오류 값, r 속성 없는 행·칸, 저장 방식(무압축) 항목, 시트 순서.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkbook, sheetMatrix, decodeCell, encodeCol, unescapeXml } from '../../src/excel/xlsx.js';
import { excelNumber, parseExcelLocation, normHeader } from '../../src/excel/analyze.js';

/** 무압축(stored) ZIP 만들기(CRC는 읽기에서 검사하지 않으므로 0). */
function storedZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), d = enc.encode(text);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + d.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Uint8Array(Buffer.concat([...parts, ...central, new Uint8Array(e.buffer)]));
}

const wbXml = '<workbook><sheets><sheet name="둘째" sheetId="2" r:id="rId2"/><sheet name="첫째 &amp; 시트" sheetId="1" r:id="rId1"/></sheets></workbook>';
const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>';
const sst = '<sst><si><r><t>가</t></r><r><rPr/><t xml:space="preserve"> 나</t></r><rPh><t>ga</t></rPh></si><si><t>A&amp;B_x000D_C</t></si><si/></sst>';
const sheet1 = '<worksheet><dimension ref="A1:D5"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="b"><v>1</v></c><c r="D1" t="e"><v>#N/A</v></c></row><row><c t="inlineStr"><is><t>인라인</t></is></c><c><v>1.25</v></c><c s="3"/><c t="str"><v>수식 결과</v></c></row><row r="4"><c r="B4" t="s"><v>2</v></c></row></sheetData></worksheet>';

test('XLSX: 시트 순서·이름 엔터티, 서식 문자열(발음 제외), _xHHHH_, 참/거짓, 오류는 빈 칸, r 없는 행·칸, 크기는 dimension 기준', async () => {
  const zip = storedZip({ 'xl/workbook.xml': wbXml, 'xl/_rels/workbook.xml.rels': rels, 'xl/sharedStrings.xml': sst, 'xl/worksheets/sheet1.xml': sheet1, 'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>' });
  const wb = await readWorkbook('t.xlsx', zip);
  assert.deepEqual(wb.sheetNames, ['둘째', '첫째 & 시트']);
  const m = sheetMatrix(wb.sheets['첫째 & 시트']);
  assert.deepEqual(m, [
    ['가 나', 'A&B\rC', true, null],
    ['인라인', 1.25, null, '수식 결과'],
    [null, null, null, null],
    [null, '', null, null],
    [null, null, null, null],
  ]);
  assert.deepEqual(sheetMatrix(wb.sheets['둘째']), [[null]]);
});

test('주소·열 이름 변환, XML 엔터티', () => {
  assert.deepEqual(decodeCell('AA10'), { r: 9, c: 26 });
  assert.equal(encodeCol(0), 'A');
  assert.equal(encodeCol(27), 'AB');
  assert.equal(encodeCol(200), 'GS');
  assert.equal(unescapeXml('&lt;a&gt; &#65;&#x42; &quot;'), '<a> AB "');
});

test('CSV: 빈 칸·따옴표 안 줄바꿈·마지막 줄 바꿈 없음', async () => {
  const wb = await readWorkbook('a.csv', new TextEncoder().encode('a,,"줄\n바꿈"\r\n1,2'));
  assert.deepEqual(sheetMatrix(wb.sheets.Sheet1), [['a', null, '줄\n바꿈'], ['1', '2', null]]);
});

test('숫자·로케이션·머리글 정규화', () => {
  assert.equal(excelNumber(' 1,250 '), 1250);
  assert.equal(excelNumber(''), null);
  assert.ok(Number.isNaN(excelNumber(true)));
  assert.equal(parseExcelLocation(' 7f-a-1-2-3 ').location, '7F-A-1-2-3');
  assert.equal(parseExcelLocation('7F-A-0-1-1'), null);
  assert.equal(normHeader('사용 면적(㎡)'), normHeader('사용 면적(m2)'));
});
