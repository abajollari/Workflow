import { registry, type HandlerContext, type HandlerResult } from '../engine/ActivityHandlerRegistry.js';
import { sendEnvelopeFromTemplate } from '../services/docusign.service.js';
import db from '../db/database.js';

async function sendProposalHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const templateId = process.env.DOCUSIGN_TEMPLATE_ID;
  if (!templateId) throw new Error('DOCUSIGN_TEMPLATE_ID is not configured');

  const cfg = ctx.inputData as Record<string, unknown>;

  const buyer: { name: string; email: string } =
    (cfg.buyer as { name: string; email: string }) ??
    { name: cfg.buyerName as string, email: cfg.buyerEmail as string };
  const seller: { name: string; email: string } =
    (cfg.seller as { name: string; email: string }) ??
    { name: cfg.sellerName as string, email: cfg.sellerEmail as string };
  const agreementParty = cfg.agreementParty as string;
  const jurisdiction   = cfg.jurisdiction   as string;
  const emailSubject   = cfg.emailSubject   as string | undefined;

  if (!buyer?.email || !buyer?.name || !seller?.email || !seller?.name) {
    throw new Error('buyer and seller must each have email and name');
  }
  if (!agreementParty || !jurisdiction) {
    throw new Error('agreementParty and jurisdiction are required');
  }

  console.log(`[handler:send_proposal] sending envelope — buyer=${buyer.email}, seller=${seller.email}`);

  const { envelopeId } = await sendEnvelopeFromTemplate({
    templateId, buyer, seller, agreementParty, jurisdiction, emailSubject,
  });

  db.prepare(
    `INSERT OR IGNORE INTO docusign_envelope (envelopeId, projectId) VALUES (?, ?)`
  ).run(envelopeId, ctx.projectId);

  console.log(`[handler:send_proposal] envelope sent — id=${envelopeId}, stored for project ${ctx.projectId}`);
  return { outcome: 'sent', payload: { envelopeId } };
}

export function registerSendProposalHandler(): void {
  registry.register('send_proposal', sendProposalHandler);
}
