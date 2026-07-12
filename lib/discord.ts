import { DriverLog } from "@prisma/client";
import { buildBusinessNotificationView } from "./notification-view";

export type WebhookType = "ATTENDANCE" | "LEAVE" | "NOTICE";

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

export type DiscordTitleInput = {
  action: string;
  status?: string | null;
  type?: string | null;
  driverName: string;
  castName?: string | null;
  destination?: string | null;
  memo?: string | null;
};

export function buildDiscordTitle(input: DiscordTitleInput): string {
  const driverName = clean(input.driverName) || "ドライバー";
  const castName = clean(input.castName);
  const destination = clean(input.destination);
  const memo = clean(input.memo);
  const type = clean(input.type);

  if (input.action === "CLOCK_IN") return `🟢 ${driverName} / 出勤しました`;
  if (input.action === "CLOCK_OUT") return `🔴 ${driverName} / 退勤しました`;
  if (input.action === "UPDATE_SCHEDULED_CLOCK_OUT") return `🕘 ${driverName} / 退勤予定変更`;
  if (input.action === "MAIL_CONFIRM_SEND") return `📩 ${driverName} / 送りメール確認`;
  if (input.action === "MAIL_CONFIRM_PICKUP") return `📩 ${driverName} / 迎えメール確認`;

  if (input.action === "START_RIDE") {
    if (type === "送り") {
      if (castName && destination) return `🚕 ${driverName} / ${castName}と合流＆${destination}へ送り中`;
      if (castName) return `🚕 ${driverName} / ${castName}と合流＆送り中`;
      if (destination) return `🚕 ${driverName} / ${destination}へ送り中`;
      return `🚕 ${driverName} / 送り中`;
    }
    if (type === "迎え") {
      if (castName && destination) return `🙋 ${driverName} / ${destination}に${castName}をお迎え中`;
      if (castName) return `🙋 ${driverName} / ${castName}をお迎え中`;
      if (destination) return `🙋 ${driverName} / ${destination}へお迎え中`;
      return `🙋 ${driverName} / 迎え中`;
    }
    if (type === "事務所戻り") {
      if (castName) return `🏠 ${driverName} / ${castName}と事務所に戻り中`;
      return `🏠 ${driverName} / 単独で事務所に戻り中`;
    }
    if (memo && destination) return `📢 ${driverName} / ${memo} / ${destination}へ移動中`;
    if (memo) return `📢 ${driverName} / ${memo}対応中`;
    if (destination) return `📢 ${driverName} / ${destination}へ移動中`;
    return `📢 ${driverName} / その他対応中`;
  }

  if (input.action === "ARRIVE") {
    if (destination) return `✅ ${driverName} / ${destination}に到着しました`;
    if (type === "事務所戻り" || input.status === "戻り中") return `✅ ${driverName} / 事務所に到着しました`;
    if (type === "迎え") return `✅ ${driverName} / お迎え先に到着しました`;
    return `✅ ${driverName} / 到着しました`;
  }

  if (input.action === "DROPOFF") {
    if (castName) return `📢 ${driverName} / ${castName}を降ろしました`;
    return `📢 ${driverName} / 降車完了`;
  }

  if (input.action === "WAIT_FIELD") {
    if (destination) return `📢 ${driverName} / ${destination}で待機開始`;
    return `📢 ${driverName} / 現地待機開始`;
  }

  if (input.action === "WAIT_OFFICE") return `🏢 ${driverName} / 事務所待機開始`;

  return `📢 ${driverName} / ${clean(input.status) || input.action}`;
}

export function buildDiscordPayloadForLog(log: DriverLog) {
  const view = buildBusinessNotificationView(log);
  const description = discordDescription(view.descriptionLines, view.mapUrl);
  return {
    embeds: [
      {
        title: buildDiscordTitle(log),
        ...(description ? { description } : {}),
        color: view.accentColor,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export async function sendDiscordPayload(type: WebhookType, payload: unknown) {
  const url = webhookFor(type);
  if (!url || !url.startsWith("https://discord.com/api/webhooks/")) {
    return { sent: false, webhookType: type, status: 0, retryAfterMs: null, error: "Webhook URLが未設定です。" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    let retryAfterMs: number | null = null;
    if (response.status === 429) {
      const body = await response.json().catch(() => null) as { retry_after?: number } | null;
      if (body?.retry_after) retryAfterMs = Math.ceil(body.retry_after * 1000);
    }
    return { sent: response.ok, webhookType: type, status: response.status, retryAfterMs, error: response.ok ? null : `Discord HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Discord送信がタイムアウトしました。" : "Discord送信に失敗しました。";
    return { sent: false, webhookType: type, status: 0, retryAfterMs: null, error: message };
  }
}

export async function sendDiscordForLog(log: DriverLog) {
  const type = webhookTypeForAction(log.action);
  return sendDiscordPayload(type, buildDiscordPayloadForLog(log));
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
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDiscordNoticePayload(input)),
      signal: controller.signal
    });
    clearTimeout(timeout);
    return { sent: response.ok, webhookType: "NOTICE" as const };
  } catch {
    return { sent: false, webhookType: "NOTICE" as const };
  }
}

export function buildDiscordNoticePayload(input: {
  title: string;
  fields: { name: string; value: string; inline?: boolean }[];
  color?: number;
}) {
  return {
    embeds: [{
      title: input.title,
      color: input.color ?? 15105570,
      fields: input.fields,
      timestamp: new Date().toISOString()
    }]
  };
}

function discordDescription(lines: string[], mapUrl?: string) {
  return [...lines, ...(mapUrl ? [`📍 [Google Mapで開く](${mapUrl})`] : [])].join("\n") || undefined;
}

function clean(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || ["-", "undefined", "null", "なし", "未設定"].includes(text)) return "";
  return text;
}
