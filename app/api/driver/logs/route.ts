import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth";
import { createDriverLog, getDriverPageState } from "@/lib/driver-service";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const authStartedAt = Date.now();
    const user = await requireDriver();
    performanceLog("driver_action_auth", { elapsedMs: Date.now() - authStartedAt });
    const parseStartedAt = Date.now();
    const input = await request.json();
    performanceLog("driver_action_parse", { elapsedMs: Date.now() - parseStartedAt });
    const saveStartedAt = Date.now();
    const log = await createDriverLog({
      driver: user.driver,
      actor: { userType: "DRIVER", userId: user.driver.id },
      input
    });
    performanceLog("driver_action_save", { action: input.action, elapsedMs: Date.now() - saveStartedAt });
    const stateStartedAt = Date.now();
    const state = await getDriverPageState(user.driver);
    performanceLog("driver_action_state", { elapsedMs: Date.now() - stateStartedAt });
    performanceLog("driver_action_total", { action: input.action, elapsedMs: Date.now() - startedAt });
    return NextResponse.json({ success: true, log, state });
  } catch (error) {
    if (error instanceof Response) return error;
    performanceLog("driver_action_total", { success: false, elapsedMs: Date.now() - startedAt });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 400 });
  }
}

function performanceLog(event: string, data: Record<string, unknown>) {
  if (process.env.PERFORMANCE_LOGGING !== "true") return;
  console.log(JSON.stringify({ event, ...data }));
}
