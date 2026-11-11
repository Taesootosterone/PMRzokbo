"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Github,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { api } from "./types";

interface UpdateStatus {
  enabled: boolean;
  phase: string;
  repository?: string;
  branch?: string;
  automatic?: boolean;
  checkIntervalHours?: number;
  current: { sha: string | null; version: string };
  candidate?: { sha: string; version: string } | null;
  error?: string | null;
  lastCheckedAt?: string;
  lastResult?: { kind: string; sha: string; at: string } | null;
}
const working = [
  "checking",
  "downloading",
  "installing",
  "backup",
  "restarting",
];
const labels: Record<string, string> = {
  checking: "GitHub 버전 확인 중…",
  downloading: "새 코드를 다운로드하는 중…",
  ready: "다운로드 완료 · 적용 대기",
  installing: "새 버전 설치·빌드 중…",
  backup: "사용자 데이터 자동 백업 중…",
  restarting: "새 버전으로 재시작 중…",
  idle: "확인할 준비가 됐어요.",
  error: "업데이트를 완료하지 못했습니다.",
  "rolled-back": "이전 코드로 복구했습니다.",
};
export function UpdatesPanel({
  onApplying,
  backupBusy,
}: {
  onApplying: (value: boolean) => void;
  backupBusy: boolean;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null),
    [error, setError] = useState(""),
    [requesting, setRequesting] = useState(false),
    [applying, setApplying] = useState(false),
    [reconnecting, setReconnecting] = useState(false);
  const target = useRef<string | null>(null),
    started = useRef(0);
  useEffect(() => {
    let mounted = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await api<UpdateStatus>("updates");
        if (!mounted) return;
        setStatus(value);
        setReconnecting(false);
        if (target.current) {
          if (
            value.current.sha === target.current &&
            value.phase === "idle" &&
            value.lastResult?.kind === "applied"
          ) {
            target.current = null;
            onApplying(false);
            window.location.reload();
            return;
          }
          if (
            ["error", "rolled-back"].includes(value.phase) ||
            value.lastResult?.kind === "rolled-back"
          ) {
            target.current = null;
            setApplying(false);
            onApplying(false);
          }
        }
      } catch {
        if (!mounted) return;
        if (target.current) {
          setReconnecting(true);
        } else
          setError(
            "업데이트 상태를 확인하지 못했습니다. 잠시 후 다시 확인하세요.",
          );
      }
      if (mounted) {
        if (target.current && Date.now() - started.current > 25 * 60 * 1000) {
          target.current = null;
          setApplying(false);
          onApplying(false);
          setError("처리가 오래 걸리고 있습니다. 서버 실행 상태를 확인하세요.");
        }
        timer = setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [onApplying]);
  const busy =
    requesting || applying || (!!status && working.includes(status.phase));
  async function check() {
    setRequesting(true);
    setError("");
    try {
      setStatus(
        await api<UpdateStatus>("updates/check", {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRequesting(false);
    }
  }
  async function apply() {
    if (!status?.candidate) return;
    const sha = status.candidate.sha;
    started.current = Date.now();
    setApplying(true);
    onApplying(true);
    setError("");
    try {
      const result = await api<UpdateStatus>("updates/apply", {
        method: "POST",
        body: JSON.stringify({ sha }),
      });
      target.current = sha;
      setStatus(result);
    } catch (e) {
      target.current = null;
      setApplying(false);
      onApplying(false);
      setError((e as Error).message);
    }
  }
  return (
    <section className="settings-update-card" aria-labelledby="update-title">
      <div className="update-card-heading">
        <Github size={23} />
        <h3 id="update-title">GitHub 업데이트</h3>
      </div>
      <p>새 코드를 내려받아 두고, 원할 때 적용하세요.</p>
      {status && (
        <>
          <div className="update-version">
            <span>현재 버전</span>
            <strong>
              v{status.current.version}{" "}
              <small>
                {status.current.sha
                  ? status.current.sha.slice(0, 8)
                  : "최초 설치"}
              </small>
            </strong>
          </div>
          {status.repository && (
            <p className="update-source">
              {status.repository} · {status.branch}
            </p>
          )}
          <p className="field-help">
            {status.automatic
              ? `앱 시작 시와 ${status.checkIntervalHours || 6}시간마다 확인·다운로드만 진행합니다. 적용은 아래 버튼을 눌러야 합니다.`
              : "자동 확인은 꺼져 있습니다. 버튼을 눌러 확인·다운로드할 수 있습니다."}
          </p>
        </>
      )}
      <div className="update-phase" data-phase={status?.phase || "loading"}>
        {busy ? (
          <RefreshCw size={15} className="spin" />
        ) : status?.phase === "ready" ? (
          <ArrowDownToLine size={15} />
        ) : status?.lastResult?.kind === "rolled-back" ? (
          <RotateCcw size={15} />
        ) : (
          <Check size={15} />
        )}
        <span>
          {reconnecting
            ? "서버 재시작을 기다리고 있습니다…"
            : status?.phase === "idle" && status.lastCheckedAt
              ? "현재 최신 버전을 사용하고 있습니다."
              : labels[status?.phase || ""] ||
                "업데이트 상태를 확인하고 있습니다…"}
        </span>
      </div>
      {status?.candidate && (
        <div className="update-candidate">
          <span>적용할 버전</span>
          <strong>
            v{status.candidate.version}{" "}
            <code>{status.candidate.sha.slice(0, 8)}</code>
          </strong>
        </div>
      )}
      <div className="update-actions">
        <button
          className="button secondary"
          onClick={() => void check()}
          disabled={!status?.enabled || busy || backupBusy}
        >
          <RefreshCw size={15} />
          업데이트 확인·다운로드
        </button>
        {status?.candidate && (
          <button
            className="button primary"
            onClick={() => void apply()}
            disabled={busy || backupBusy}
          >
            업데이트 적용
          </button>
        )}
      </div>
      {!!(error || status?.error) && (
        <p
          className={status?.enabled ? "form-error" : "field-help"}
          role={status?.enabled ? "alert" : undefined}
        >
          {error || status?.error}
        </p>
      )}
      {status?.candidate && (
        <p className="field-help">
          적용 전에 작성 중인 내용을 저장하세요. 설치·빌드 후 전체 백업을 만들고
          앱을 잠시 재시작합니다. 새 버전이 실행되지 않으면 이전 코드로
          복구합니다.
        </p>
      )}
    </section>
  );
}
