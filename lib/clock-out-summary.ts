import { prisma } from "./prisma";
import { formatBusinessDate } from "./time";

export async function buildClockOutSummary(params: { businessDateFrom: Date; businessDateTo: Date; driverId?: string }) {
  const logs = await prisma.driverLog.findMany({
    where: {
      action: "CLOCK_OUT",
      businessDate: { gte: params.businessDateFrom, lte: params.businessDateTo },
      ...(params.driverId ? { driverId: params.driverId } : {})
    },
    orderBy: [{ businessDate: "desc" }, { datetime: "desc" }]
  });

  const clockInLogs = logs.length ? await prisma.driverLog.findMany({
    where: {
      action: "CLOCK_IN",
      businessDate: { in: Array.from(new Set(logs.map((log) => log.businessDate.getTime()))).map((time) => new Date(time)) },
      driverId: { in: Array.from(new Set(logs.map((log) => log.driverId))) }
    },
    orderBy: { datetime: "asc" }
  }) : [];
  const clockInMap = new Map(clockInLogs.map((log) => [`${log.driverId}-${formatBusinessDate(log.businessDate)}`, log.datetime]));

  const items = logs.map((log) => ({
    id: log.id,
    businessDate: formatBusinessDate(log.businessDate),
    driverId: log.driverId,
    driverName: log.driverName,
    clockInTime: clockInMap.get(`${log.driverId}-${formatBusinessDate(log.businessDate)}`) ?? null,
    clockOutTime: log.clockOutTime,
    roundedClockOutTime: log.roundedClockOutTime,
    workHours: number(log.workHours) ?? 0,
    hourlyWage: log.hourlyWage ?? 0,
    wageSubtotal: log.wageSubtotal ?? 0,
    distance: number(log.distance),
    gasRate: number(log.gasRate),
    gasSubtotal: log.gasSubtotal ?? 0,
    totalPayment: log.totalPayment ?? 0,
    dailyReport: log.dailyReport ?? "",
    createdAt: log.createdAt,
    latitude: number(log.latitude),
    longitude: number(log.longitude)
  }));

  const summary = summarize(items);
  const byDriver = Array.from(
    items.reduce((map, item) => {
      const current = map.get(item.driverId) ?? { driverId: item.driverId, driverName: item.driverName, items: [] as typeof items };
      current.items.push(item);
      map.set(item.driverId, current);
      return map;
    }, new Map<string, { driverId: string; driverName: string; items: typeof items }>())
  ).map(([, group]) => ({ driverId: group.driverId, driverName: group.driverName, ...summarize(group.items) }));

  return { summary, byDriver, items };
}

function summarize(items: Array<{ workHours: number; distance: number | null; gasSubtotal: number; wageSubtotal: number; totalPayment: number }>) {
  return {
    clockOutCount: items.length,
    totalWorkHours: round1(items.reduce((sum, item) => sum + item.workHours, 0)),
    totalDistance: round1(items.reduce((sum, item) => sum + (item.distance ?? 0), 0)),
    totalGasSubtotal: items.reduce((sum, item) => sum + item.gasSubtotal, 0),
    totalWageSubtotal: items.reduce((sum, item) => sum + item.wageSubtotal, 0),
    totalPayment: items.reduce((sum, item) => sum + item.totalPayment, 0)
  };
}

function number(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
