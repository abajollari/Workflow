import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env['SMTP_HOST'],
    port: Number(process.env['SMTP_PORT'] ?? 587),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth: process.env['SMTP_USER']
      ? { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] }
      : undefined,
  });
}

export interface MagicLinkEmailOpts {
  to: string;
  toName: string | null;
  activityLabel: string;
  projectId: number;
  approveUrl: string;
  rejectUrl: string;
}

export async function sendMagicLinkEmail(opts: MagicLinkEmailOpts): Promise<void> {
  if (!process.env['SMTP_HOST']) {
    console.warn('[email] SMTP_HOST not configured — skipping email notification');
    return;
  }

  const transport = createTransport();
  const from = process.env['SMTP_FROM'] ?? 'workflow@example.com';

  await transport.sendMail({
    from,
    to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
    subject: `Action required: ${opts.activityLabel}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#333">
  <h2 style="color:#1a1a2e">Workflow Action Required</h2>
  <p>A workflow activity is waiting for your response:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;font-weight:bold;color:#555">Activity</td><td style="padding:8px">${opts.activityLabel}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;color:#555">Project</td><td style="padding:8px">${opts.projectId}</td></tr>
  </table>
  <p>Please choose one of the following actions:</p>
  <div style="margin:24px 0">
    <a href="${opts.approveUrl}"
       style="display:inline-block;padding:12px 28px;background:#22c55e;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:12px">
      Approve
    </a>
    <a href="${opts.rejectUrl}"
       style="display:inline-block;padding:12px 28px;background:#ef4444;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
      Reject
    </a>
  </div>
  <p style="font-size:12px;color:#888">
    If the buttons above do not work, copy and paste one of these URLs into your browser:<br>
    Approve: ${opts.approveUrl}<br>
    Reject: ${opts.rejectUrl}
  </p>
</body>
</html>`,
  });

  console.log(`[email] magic link sent to ${opts.to} for activity '${opts.activityLabel}'`);
}
