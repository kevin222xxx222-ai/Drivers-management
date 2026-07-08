import { DriverLog, Driver } from "@prisma/client";
import { roundClockOut } from "./time";

export function roundToTenYen(value: number) {
  return Math.round(value / 10) * 10;
}

export function calculateClockOutSettlement(params: {
  driver: Driver;
  clockInLog: DriverLog;
  clockOutTime?: Date;
  distance?: number | null;
}) {
  const clockOutTime = params.clockOutTime ?? new Date();
  const roundedClockOutTime = roundClockOut(clockOutTime);
  const diffHours = Math.max(
    0,
    (roundedClockOutTime.getTime() - params.clockInLog.datetime.getTime()) / (1000 * 60 * 60)
  );
  const workHours = Math.round(diffHours * 2) / 2;
  const hourlyWage = params.driver.hourlyWage;
  const wageSubtotal = roundToTenYen(workHours * hourlyWage);
  const gasRate = params.driver.gasRate ? Number(params.driver.gasRate) : null;
  const distance = params.distance ?? null;
  const gasSubtotal =
    params.driver.gasSettlementType === "SEPARATE" && gasRate && distance !== null
      ? roundToTenYen(distance * gasRate)
      : 0;

  return {
    clockInTime: params.clockInLog.datetime,
    clockOutTime,
    roundedClockOutTime,
    workHours,
    hourlyWage,
    wageSubtotal,
    gasSettlementType: params.driver.gasSettlementType,
    gasType: params.driver.gasType,
    gasRate,
    distance,
    gasSubtotal,
    totalPayment: wageSubtotal + gasSubtotal
  };
}
