export const ACTIONS = [
  "CLOCK_IN",
  "START_RIDE",
  "ARRIVE",
  "DROPOFF",
  "WAIT_FIELD",
  "WAIT_OFFICE",
  "CLOCK_OUT",
  "UPDATE_SCHEDULED_CLOCK_OUT",
  "MAIL_CONFIRM_SEND",
  "MAIL_CONFIRM_PICKUP",
  "ADMIN_STATUS_CORRECTION",
  "ADMIN_CLOCK_IN_CORRECTION",
  "ADMIN_WORK_TIME_CORRECTION",
  "ADMIN_PROXY_CLOCK_OUT"
] as const;

export type Action = (typeof ACTIONS)[number];

export const STATUSES = {
  NOT_WORKING: "未出勤",
  WORKING: "出勤中",
  SENDING: "送り中",
  PICKING_UP: "迎え中",
  RETURNING: "戻り中",
  OTHER: "その他",
  ARRIVED: "現地到着",
  DROPPED_OFF: "女性降車済み",
  WAIT_FIELD: "現地待機",
  WAIT_OFFICE: "事務所待機",
  CLOCKED_OUT: "退勤済み"
} as const;

export const RIDE_TYPES = ["送り", "迎え", "事務所戻り", "その他"] as const;

export function statusForRideType(type: string) {
  if (type === "送り") return STATUSES.SENDING;
  if (type === "迎え") return STATUSES.PICKING_UP;
  if (type === "事務所戻り") return STATUSES.RETURNING;
  return STATUSES.OTHER;
}
