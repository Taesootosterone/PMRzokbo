"use client";
import { useEffect, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { api } from "./types";
type DesktopStatus = {
  supported: boolean;
  installing: boolean;
  apps: { action: string; name: string; path: string; installed: boolean }[];
  error: string | null;
};
export function MacAppsPanel({
  disabled,
  onBusy,
}: {
  disabled: boolean;
  onBusy: (value: boolean) => void;
}) {
  const [status, setStatus] = useState<DesktopStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const poll = () =>
      api<DesktopStatus>("desktop")
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch(() => {});
    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!status?.supported) return null;
  const installed =
    status.apps.length === 4 && status.apps.every((app) => app.installed);
  async function install() {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      setStatus(
        await api<DesktopStatus>("desktop/install", {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="mac-apps-card" aria-labelledby="mac-apps-title">
      <div className="update-card-heading">
        <Monitor size={22} />
        <h3 id="mac-apps-title">Mac에서 더블클릭으로 업데이트</h3>
      </div>
      <p>
        Finder → 이동 → 홈 → Applications에서 <strong>리햅 업데이트.app</strong>
        을 여세요. 최신 코드 확인부터 전체 백업·설치·재시작까지 진행합니다.
      </p>
      <p className="field-help">
        리햅 열기 · 업데이트 · 중지 · 상태 앱을 함께 제공합니다. 앱이 설치된
        Mac의 서버를 제어합니다.
      </p>
      <p role="status">
        {status.installing || busy
          ? "Mac 앱을 준비하고 있어요…"
          : installed
            ? "Mac 앱 4개가 설치되어 있습니다."
            : "Mac 앱을 설치하거나 복구할 수 있습니다."}
      </p>
      <button
        className="button secondary"
        onClick={() => void install()}
        disabled={disabled || busy || status.installing}
      >
        <RefreshCw size={16} className={busy ? "spin" : ""} />
        {installed ? "Mac 앱 다시 설치/복구" : "Mac 앱 설치/복구"}
      </button>
      {(error || status.error) && (
        <p className="form-error" role="alert">
          {error || status.error}
        </p>
      )}
    </section>
  );
}
