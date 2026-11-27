import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';

/** Sends HeroArc's few emails (verify, reset password, invite). */
export interface Mailer {
  send(to: string, subject: string, text: string, html: string): Promise<void>;
}

/** Production: Resend. */
export class ResendMailer implements Mailer {
  private readonly client: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }
  async send(to: string, subject: string, text: string, html: string) {
    const r = await this.client.emails.send({ from: this.from, to, subject, text, html });
    if (r.error) throw new Error(`Resend: ${r.error.message}`);
  }
}

/** Local and tests: SMTP (Mailpit catches everything at http://localhost:8025). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(to: string, subject: string, text: string, html: string) {
    await this.transport.sendMail({ from: this.from, to, subject, text, html });
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** A plain, readable email with one button. */
export function email(title: string, lines: string[], button: { label: string; url: string }) {
  const text = [title, '', ...lines, '', `${button.label}: ${button.url}`, '', '— HeroArc'].join(
    '\n',
  );
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f3;font-family:Inter,-apple-system,system-ui,sans-serif;color:#1f2a24">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e3e8e3;border-radius:14px;padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('')}
<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#557f68;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(button.label)}</a></p>
<p style="margin:0;font-size:12px;color:#5f6b64">If the button doesn't work, open: ${esc(button.url)}</p>
</div></body></html>`;
  return { text, html };
}
