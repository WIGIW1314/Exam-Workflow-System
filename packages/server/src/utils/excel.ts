import type { Response } from 'express';
import ExcelJS from 'exceljs';

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '409EFF' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'DCE3EC' } },
      left: { style: 'thin', color: { argb: 'DCE3EC' } },
      bottom: { style: 'thin', color: { argb: 'DCE3EC' } },
      right: { style: 'thin', color: { argb: 'DCE3EC' } },
    };
  });
}

function styleBody(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E8EDF3' } },
        left: { style: 'thin', color: { argb: 'E8EDF3' } },
        bottom: { style: 'thin', color: { argb: 'E8EDF3' } },
        right: { style: 'thin', color: { argb: 'E8EDF3' } },
      };
    });
  });
}

export function buildSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ExcelColumn[],
  rows: Array<Record<string, unknown>>,
) {
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 22 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 18,
  }));
  rows.forEach((row) => sheet.addRow(row));
  styleHeader(sheet.getRow(1));
  styleBody(sheet);
  return sheet;
}

export function buildTemplateSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ExcelColumn[],
  sampleRows: Array<Record<string, unknown>>,
) {
  const sheet = buildSheet(workbook, name, columns, sampleRows);
  sheet.addRow({});
  const tipsRow = sheet.addRow(['填写说明：请保留表头，按示例格式填写后再导入。']);
  sheet.mergeCells(`A${tipsRow.number}:${String.fromCharCode(64 + columns.length)}${tipsRow.number}`);
  tipsRow.font = { size: 10, color: { argb: '909399' }, italic: true };
  return sheet;
}

export async function sendWorkbook(res: Response, workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
