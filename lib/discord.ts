import { DriverLog } from "@prisma/client";
import { buildBusinessNotificationView } from "./notification-view";

type WebhookType = "ATTENDANCE" | "LEAVE" | "NOTICE";

function webhookFor(type: WebhookType) {
  if (type === "ATTENDANCE") return process.env.DISCORD_URL_ATTENDANCE;
  if (type === "LEAVE") return process.env.DISCORD_URL_LEAVE;
  return process.env.DISCORD_URL_NOTICE;
}

export function webhookTypeForAction(action: string): WebhookType {
  if (action === "CLOCK_IN") return "ATTENDANCE";
  if (action === "CLOCK_OUT") return "LEAVE";
  return "NOTICE";
}

export async function sendDiscordForLog(log: DriverLog) {
  const type = webhookTypeForAction(log.action);
  const url = webhookFor(type);
  if (!url || !url.startsWith("https://discord.com/api/webhooks/")) {
    return { sent: false, webhookType: type };
  }

  try {
    const view = buildBusinessNotificationView(log);
    const payload = {
      embeds: [
        {
          title: `${view.icon} ${view.driverName} / ${view.title}`,
          description: discordDescription(view.descriptionLines, view.mapUrl),
          color: view.accentColor,
          timestamp: new Date().toISOString()
        }
      ]
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    return { sent: response.ok, webhookType: type };
  } catch {
    return { sent: false, webhookType: type };
  }
}

export async function sendDiscordNotice(input: {
  title: string;
  fields: { name: string; value: string; inline?: boolean }[];
  color?: number;
}) {
  const url = webhookFor("NOTICE");
  if (!url || !url.startsWith("https://discord.com/api/webhooks/")) return { sent: false, webhookType: "NOTICE" as const };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: input.title,
          color: input.color ?? 15105570,
          fields: input.fields,
          timestamp: new Date().toISOString()
        }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    return { sent: response.ok, webhookType: "NOTICE" as const };
  } catch {
    return { sent: false, webhookType: "NOTICE" as const };
  }
}

function discordDescription(lines: string[], mapUrl?: string) {
  return [...lines, ...(mapUrl ? [`📍 [Google Mapで開く](${mapUrl})`] : [])].join("\n") || undefined;
}
