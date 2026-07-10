import { DriverLog } from "@prisma/client";
import { formatTokyoDateTime, formatTokyoTime } from "./time";

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

  const payload = {
    embeds: [
      {
        title: buildTitle(log),
        color: buildColor(log.action),
        fields: buildFields(log),
        timestamp: new Date().toISOString(),
        footer: { text: `DriverID：${log.driverId} / LogID：${log.id}` }
      }
    ]
  };

  try {
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

function buildTitle(log: DriverLog) {
  if (log.action === "CLOCK_IN") return `🟢 ${log.driverName} / 出勤`;
  if (log.action === "START_RIDE") {
    if (log.type === "送り") return `🚕 ${log.driverName} / ${log.castName ?? ""}と合流＆${log.destination ?? ""}へ送り中`;
    if (log.type === "迎え") return `🙋 ${log.driverName} / ${log.destination ?? ""}に${log.castName ?? ""}をお迎え中`;
    if (log.type === "事務所戻り") return `🏠 ${log.driverName} / ${log.castName ?? ""}で事務所に戻り中`;
    return `📢 ${log.driverName} / ${log.memo ?? "その他"} / ${log.destination ?? ""}へ移動中`;
  }
  if (log.action === "ARRIVE") return `✅ ${log.driverName} / 到着しました`;
  if (log.action === "DROPOFF") return `📢 ${log.driverName} / ${log.castName ? `${log.castName}を降ろしました` : "降車完了"}`;
  if (log.action === "WAIT_OFFICE") return `🏢 ${log.driverName} / 事務所待機開始`;
  if (log.action === "WAIT_FIELD") return `📢 ${log.driverName} / 現地待機開始`;
  if (log.action === "MAIL_CONFIRM_SEND") return `📩 ${log.driverName} / 送りメール確認`;
  if (log.action === "MAIL_CONFIRM_PICKUP") return `📩 ${log.driverName} / 迎えメール確認`;
  if (log.action === "CLOCK_OUT") return `🔴 ${log.driverName} / 退勤`;
  return `${log.driverName} / ${log.action}`;
}

function buildColor(action: string) {
  if (action === "CLOCK_IN") return 5763719;
  if (action === "START_RIDE") return 3447003;
  if (action === "ARRIVE") return 15105570;
  if (action === "CLOCK_OUT") return 15158332;
  if (action.startsWith("MAIL_CONFIRM")) return 10181046;
  return 9807270;
}

function buildFields(log: DriverLog) {
  const fields = [
    { name: "日時", value: formatTokyoDateTime(log.datetime), inline: true },
    { name: "現在ステータス", value: log.status, inline: true }
  ];
  if (log.scheduledClockOut) fields.push({ name: "退勤予定", value: formatTokyoDateTime(log.scheduledClockOut), inline: true });
  if (log.castName) fields.push({ name: "キャスト名", value: log.castName, inline: true });
  if (log.destination) fields.push({ name: "目的地", value: log.destination, inline: true });
  if (log.travelMinutes) fields.push({ name: "移動時間", value: `${log.travelMinutes}分`, inline: true });
  if (log.estimatedArrival) fields.push({ name: "到着予定", value: formatTokyoTime(log.estimatedArrival), inline: true });
  if (log.actualArrival) fields.push({ name: "実際到着", value: formatTokyoTime(log.actualArrival), inline: true });
  if (log.dropoffTime) fields.push({ name: "降ろした時間", value: formatTokyoTime(log.dropoffTime), inline: true });
  if (log.workHours) fields.push({ name: "稼働時間", value: `${log.workHours}h`, inline: true });
  if (log.wageSubtotal !== null) fields.push({ name: "時給分報酬", value: `${log.wageSubtotal.toLocaleString()}円`, inline: true });
  if (log.gasSubtotal !== null) fields.push({ name: "ガス代支払い", value: `${log.gasSubtotal.toLocaleString()}円`, inline: true });
  if (log.totalPayment !== null) fields.push({ name: "合計報酬", value: `${log.totalPayment.toLocaleString()}円`, inline: true });
  if (log.dailyReport) fields.push({ name: "業務報告", value: log.dailyReport, inline: false });
  if (log.memo) fields.push({ name: "メモ", value: log.memo, inline: false });
  if (log.latitude && log.longitude) fields.push({ name: "GoogleMapを開く", value: `https://maps.google.com/?q=${log.latitude},${log.longitude}`, inline: false });
  return fields;
}
