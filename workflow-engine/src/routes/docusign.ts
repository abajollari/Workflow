import { Router, Request, Response } from 'express';
import { sendEnvelopeFromTemplate } from '../services/docusign.service.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';
import db from '../db/database.js';

const router = Router();

// POST /api/docusign/send
// Body: { buyer: { email, name }, seller: { email, name }, agreementParty: string, jurisdiction: string, emailSubject?,
//         projectId?: number, activityId?: string }
// Standalone: sends the envelope and returns { envelopeId }.
// With projectId + activityId: delegates to the send_proposal handler via the workflow engine,
// which sends the envelope then completes the activity and publishes the workflow event.
router.post('/send', async (req: Request, res: Response) => {
  const { buyer, seller, emailSubject, agreementParty, jurisdiction, projectId, activityId } = req.body;

  if (!buyer?.email || !buyer?.name || !seller?.email || !seller?.name) {
    res.status(400).json({ error: 'buyer and seller must each have email and name' });
    return;
  }

  if (!agreementParty || !jurisdiction) {
    res.status(400).json({ error: 'agreementParty and jurisdiction are required' });
    return;
  }

  // Workflow path: engine calls the handler, which sends the envelope then completes the activity.
  if (projectId && activityId) {
    try {
      workflowEngine.triggerActivity(Number(projectId), String(activityId), {
        handler: 'send_proposal',
        buyer, seller, agreementParty, jurisdiction, emailSubject,
      });
      res.status(202).json({ status: 'triggered' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
    return;
  }

  // Standalone path: send envelope directly and return the result.
  const templateId = process.env.DOCUSIGN_TEMPLATE_ID;
  if (!templateId) {
    res.status(500).json({ error: 'DOCUSIGN_TEMPLATE_ID is not configured' });
    return;
  }

  try {
    const result = await sendEnvelopeFromTemplate({
      templateId, buyer, seller, emailSubject, agreementParty, jurisdiction,
    });
    res.json(result);
  } catch (err: any) {
    const message = err?.response?.body?.message ?? err?.message ?? 'DocuSign request failed';
    console.error('[docusign] error:', err?.response?.body ?? err);
    res.status(500).json({ error: message });
  }
});

// POST /api/docusign/webhook  — DocuSign Connect callback
// Configure in DocuSign Admin → Connect → Add Configuration → URL: https://your-domain/api/docusign/webhook
// Trigger on: Envelope Completed
// Format: JSON
router.post('/webhook', (req: Request, res: Response) => {
  // DocuSign expects a 200 quickly — acknowledge first, then process
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log('[docusign:webhook] received payload:', JSON.stringify(body));

    const envelopeId: string | undefined = body.data?.envelopeId;
    const event: string | undefined      = body.event;

    if (!envelopeId || !event) {
      console.warn('[docusign:webhook] missing envelopeId or event — ignoring');
      return;
    }

    console.log(`[docusign:webhook] envelope ${envelopeId} — event: ${event}`);

    if (event !== 'envelope-completed') return;  // only act when all parties have signed

    const row = db
      .prepare(`SELECT projectId FROM docusign_envelope WHERE envelopeId = ?`)
      .get(envelopeId) as { projectId: number } | undefined;

    if (!row) {
      console.warn(`[docusign:webhook] no project found for envelope ${envelopeId}`);
      return;
    }

    const { projectId } = row;

    try {
      // workflowEngine.completeActivity publishes the Kafka event internally — no second publish needed
      workflowEngine.completeActivity(projectId, 'signed', { outcome: 'completed' });
      console.log(`[docusign:webhook] completed 'signed' for project ${projectId}`);
    } catch (err: any) {
      console.error(`[docusign:webhook] failed to complete activity:`, err.message);
    }
  } catch (err: any) {
    console.error('[docusign:webhook] error processing payload:', err.message);
  }
});

export default router;
