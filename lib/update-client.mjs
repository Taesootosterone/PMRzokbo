export async function updaterRequest(action, body) {
  const port = Number(process.env.PMRZ_UPDATER_PORT),
    token = process.env.PMRZ_UPDATER_TOKEN;
  if (!Number.isInteger(port) || !token)
    return {
      enabled: false,
      phase: "idle",
      current: {
        version: process.env.PMRZ_RUNNING_VERSION || "수동 실행",
        sha: null,
      },
      error: "npm start로 실행하면 GitHub 업데이트를 사용할 수 있습니다.",
    };
  const response = await fetch(`http://127.0.0.1:${port}/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Pmrz-Control": token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(
      action === "desktop" && body !== undefined ? 270000 : 5000,
    ),
  });
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(value.error || "업데이트 요청 실패");
    error.status = response.status;
    throw error;
  }
  return value;
}
