import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { registry, type HandlerContext, type HandlerResult } from '../engine/ActivityHandlerRegistry.js';
import db from '../db/database.js';
import { json } from 'stream/consumers';

async function excelHandler(ctx: HandlerContext): Promise<HandlerResult> {
  console.log(`[handler:excelHandler] running for '${ctx.activityKey}'`);

  if (!ctx.inputData) {
    const output = db.prepare('select output from project_activity where projectid = 7 and activityId = ?').get('step2');
    //console.log('[handler:excelHandler] fetched output from DB:', output);
    ctx.inputData = { rows: [output] };
  }

  const jsonData = {
  "Users": [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" }
  ],
  "Inventory": [
    { sku: "A123", item: "Laptop", stock: 15 },
    { sku: "B456", item: "Monitor", stock: 8 }
  ]
    };

  const workbook = new ExcelJS.Workbook();
  for (const sheetName in jsonData) {
    const dataArray = jsonData[sheetName];
    
    // Create a new tab for each root node
    const worksheet = workbook.addWorksheet(sheetName);

    if (dataArray.length > 0) {
      // 2. Set headers based on the keys of the first object
      const columns = Object.keys(dataArray[0]).map(key => ({
        header: key.toUpperCase(),
        key: key,
        width: 15
      }));
      worksheet.columns = columns;

      // 3. Add all rows for this specific node
      worksheet.addRows(dataArray);
    }
  }


  const uploadsDir = path.resolve('uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const fileName = `output_${Date.now()}.xlsx`;
  const filePath = path.join(uploadsDir, fileName);

  await workbook.xlsx.writeFile(filePath);
  console.log(`[handler:excelHandler] saved to ${filePath}`);

  return { outcome: 'success', payload: { fileName, filePath } };
}


export function registerExcelHandler(): void {
  registry.register('writeToExcel', excelHandler);
}
