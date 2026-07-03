// ============================================================================
// BekiBuffet SaaS — Email Notification Service (Resend)
// ============================================================================
// Sends transactional emails: trade alerts, daily reports, subscription
// notifications. Uses Resend if RESEND_API_KEY is set, otherwise logs
// the email to console (dev mode only).
// ============================================================================

import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type EmailTemplate =
  | "trade_opened"
  | "trade_closed"
  | "daily_loss_warning"
  | "edge_discovered"
  | "strategy_review"
  | "subscription_activated"
  | "subscription_canceled"
  | "trial_expiring"
  | "welcome";

export interface EmailParams {
  [key: string]: any;
}

const TEMPLATES: Record<EmailTemplate, { subject: string; buildHtml: (params: EmailParams) => string }> = {
  welcome: {
    subject: "Welcome to BekiBuffet — Your AI Trading Agent",
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h1 style="color: #58a6ff; margin-bottom: 16px;">Welcome to BekiBuffet, ${p.name || "Trader"}!</h1>
          <p style="font-size: 16px; line-height: 1.6;">Your autonomous AI trading agent is ready. You've been given a <strong style="color: #3fb950;">14-day Pro trial</strong> with full access to:</p>
          <ul style="font-size: 14px; line-height: 1.8;">
            <li>Live trading terminal with 5 assets</li>
            <li>AI agent decision layer</li>
            <li>Backtesting engine (100 credits)</li>
            <li>Edge discovery (autonomous optimization)</li>
            <li>3 broker connections</li>
          </ul>
          <a href="${p.dashboardUrl || "https://app.bekibuffet.ai"}" style="display: inline-block; background: linear-gradient(135deg, #58a6ff, #bc8cff); color: #0a0e14; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 16px;">Open Dashboard</a>
        </div>
      </div>
    `,
  },
  trade_opened: {
    subject: `📈 Trade Opened: ${"{{asset}}"}`,
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: ${p.direction === "Long" ? "#3fb950" : "#f85149"};">${p.direction === "Long" ? "▲" : "▼"} ${p.asset} — ${p.direction}</h2>
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="color: #7d8590;">Entry Price:</td><td style="font-family: monospace; font-weight: bold;">${p.entryPrice}</td></tr>
            <tr><td style="color: #7d8590;">Size:</td><td style="font-family: monospace;">${p.size} units</td></tr>
            <tr><td style="color: #7d8590;">Stop Loss:</td><td style="font-family: monospace; color: #f85149;">${p.stopLoss}</td></tr>
            <tr><td style="color: #7d8590;">Take Profit:</td><td style="font-family: monospace; color: #3fb950;">${p.takeProfit}</td></tr>
            <tr><td style="color: #7d8590;">Confluence Score:</td><td style="font-family: monospace;">${p.score}/100</td></tr>
            <tr><td style="color: #7d8590;">Campaign:</td><td style="font-family: monospace;">Scale ${p.scale}/${p.maxScale}</td></tr>
          </table>
        </div>
      </div>
    `,
  },
  trade_closed: {
    subject: `${"{{pnlSign}}"}${"{{asset}}"} — ${"{{exitReason}}"}`,
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: ${p.pnl >= 0 ? "#3fb950" : "#f85149"};">${p.pnl >= 0 ? "✓" : "✕"} ${p.asset} — ${p.direction}</h2>
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="color: #7d8590;">Exit Price:</td><td style="font-family: monospace;">${p.exitPrice}</td></tr>
            <tr><td style="color: #7d8590;">PnL:</td><td style="font-family: monospace; font-weight: bold; color: ${p.pnl >= 0 ? "#3fb950" : "#f85149"};">${p.pnl >= 0 ? "+" : ""}$${p.pnl.toFixed(2)}</td></tr>
            <tr><td style="color: #7d8590;">Exit Reason:</td><td>${p.exitReason}</td></tr>
            <tr><td style="color: #7d8590;">Duration:</td><td>${p.duration}</td></tr>
          </table>
        </div>
      </div>
    `,
  },
  daily_loss_warning: {
    subject: "⚠️ Daily Loss Limit Warning",
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: #f85149;">⚠️ Daily Loss Warning</h2>
          <p>Your agent has reached <strong>${p.lossPct}%</strong> of the daily loss limit (${p.maxLossPct}%).</p>
          <p>The agent has reduced position sizing to protect your equity. New trades will be blocked if the limit is reached.</p>
          <p>Current equity: <strong>$${p.equity.toFixed(2)}</strong></p>
        </div>
      </div>
    `,
  },
  edge_discovered: {
    subject: `🎯 New Edge Discovered: ${"{{asset}}"}`,
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: #3fb950;">🎯 New Trading Edge Discovered</h2>
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="color: #7d8590;">Asset:</td><td><strong>${p.asset}</strong></td></tr>
            <tr><td style="color: #7d8590;">Strategy:</td><td>${p.strategy}</td></tr>
            <tr><td style="color: #7d8590;">Win Rate:</td><td style="color: #3fb950; font-weight: bold;">${p.winRate}%</td></tr>
            <tr><td style="color: #7d8590;">Profit Factor:</td><td>${p.profitFactor}</td></tr>
            <tr><td style="color: #7d8590;">Walk-Forward Score:</td><td>${p.walkForwardScore}/100</td></tr>
          </table>
          <a href="${p.dashboardUrl}" style="display: inline-block; background: #58a6ff; color: #0a0e14; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin-top: 12px;">Review Edge</a>
        </div>
      </div>
    `,
  },
  strategy_review: {
    subject: "📊 Weekly Strategy Review from BekiBuffet AI",
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: #bc8cff;">✦ Weekly Strategy Review</h2>
          <p style="font-size: 14px; line-height: 1.6;">${p.summary}</p>
          ${p.recommendations?.map((r: string) => `<p style="font-size: 13px; color: #7d8590;">→ ${r}</p>`).join("") || ""}
        </div>
      </div>
    `,
  },
  subscription_activated: {
    subject: `${"{{tier}}"} Subscription Activated`,
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: #3fb950;">✓ ${p.tier} Subscription Activated</h2>
          <p>Your BekiBuffet subscription has been upgraded to <strong>${p.tier}</strong>.</p>
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="color: #7d8590;">Broker connections:</td><td>${p.seats}</td></tr>
            <tr><td style="color: #7d8590;">Max capital:</td><td>$${p.maxCapital?.toLocaleString()}</td></tr>
            <tr><td style="color: #7d8590;">Backtest credits:</td><td>${p.backtestCredits}</td></tr>
            <tr><td style="color: #7d8590;">Renews:</td><td>${p.renewalDate}</td></tr>
          </table>
        </div>
      </div>
    `,
  },
  subscription_canceled: {
    subject: "Subscription Canceled",
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2>Subscription Canceled</h2>
          <p>Your BekiBuffet subscription has been canceled. You'll retain access until <strong>${p.periodEnd}</strong>, after which your account will revert to the Free tier.</p>
        </div>
      </div>
    `,
  },
  trial_expiring: {
    subject: "⏰ Your Pro Trial Expires Soon",
    buildHtml: (p) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e14; color: #e6edf3;">
        <div style="padding: 24px;">
          <h2 style="color: #d29922;">⏰ Trial Expiring in ${p.daysLeft} days</h2>
          <p>Your Pro trial expires on <strong>${p.expiryDate}</strong>. Upgrade now to keep your AI agent running, edge discovery, and live broker connections.</p>
          <a href="${p.upgradeUrl}" style="display: inline-block; background: linear-gradient(135deg, #58a6ff, #bc8cff); color: #0a0e14; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 16px;">Upgrade Now</a>
        </div>
      </div>
    `,
  },
};

/**
 * Send an email. Uses Resend if RESEND_API_KEY is set.
 * In development without API key, logs to console.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      logger.info("Email sent (dev mode — logged to console)", {
        to: message.to,
        subject: message.subject,
      });
      return true;
    }
    logger.warn("RESEND_API_KEY not set — email not sent", { to: message.to, subject: message.subject });
    return false;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || "BekiBuffet <noreply@bekibuffet.ai>",
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      logger.error("Resend API error", { status: resp.status, error: err });
      return false;
    }

    logger.info("Email sent", { to: message.to, subject: message.subject });
    return true;
  } catch (e: any) {
    logger.error("Failed to send email", { error: e.message, to: message.to });
    return false;
  }
}

/**
 * Send a templated email.
 */
export async function sendTemplatedEmail(
  to: string,
  template: EmailTemplate,
  params: EmailParams = {}
): Promise<boolean> {
  const tmpl = TEMPLATES[template];
  if (!tmpl) {
    logger.error("Unknown email template", { template });
    return false;
  }

  // Replace {{asset}} etc. in subject
  let subject = tmpl.subject;
  for (const [key, value] of Object.entries(params)) {
    subject = subject.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }
  if (params.pnl !== undefined) {
    subject = subject.replace("{{pnlSign}}", params.pnl >= 0 ? "✓ " : "✕ ");
  }

  return sendEmail({
    to,
    subject,
    html: tmpl.buildHtml(params),
  });
}
