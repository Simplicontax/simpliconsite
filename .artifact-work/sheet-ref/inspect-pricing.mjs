import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const sourcePath = 'D:/system/Downloads/invoice For Simplicon Tax Advisors.xlsx';
const previewDir = 'D:/simplicon/.artifact-work/sheet-ref/previews';
await fs.mkdir(previewDir, { recursive: true });

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const overview = await workbook.inspect({
  kind: 'workbook,sheet,table',
  maxChars: 8000,
  tableMaxRows: 20,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log('OVERVIEW');
console.log(overview.ndjson);

for (let index = 0; index < 10; index += 1) {
  let sheet;
  try {
    sheet = workbook.worksheets.getItemAt(index);
  } catch {
    break;
  }
  if (!sheet) break;
  const used = sheet.getUsedRange();
  console.log(`SHEET ${index + 1}: ${sheet.name}`);
  console.log(JSON.stringify({ values: used.values, formulas: used.formulas }));
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1.5, format: 'png' });
  const safeName = sheet.name.replace(/[^a-zA-Z0-9_-]/g, '-');
  await fs.writeFile(`${previewDir}/${index + 1}-${safeName}.png`, new Uint8Array(await preview.arrayBuffer()));
}
