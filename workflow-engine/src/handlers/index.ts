import { registerWeatherHandler } from './weatherHandler.js';
import { registerSendProposalHandler } from './sendProposalHandler.js';

export function registerAllHandlers(): void {
  registerWeatherHandler();
  registerSendProposalHandler();
}
