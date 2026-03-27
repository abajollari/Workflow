import { registerWeatherHandler } from './weatherHandler.js';
import { registerSendProposalHandler } from './sendProposalHandler.js';
import { registerExcelHandler } from './excelHandler.js';

export function registerAllHandlers(): void {
  registerWeatherHandler();
  registerSendProposalHandler();
  registerExcelHandler();
}

