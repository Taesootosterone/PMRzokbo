"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UpdatesPanel } from "./updates";
import {
  Check,
  Download,
  HardDrive,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";

export function SettingsDialog({ close }: { close: () => void }) {
  const [tab, setTab] = useState<"backup" | "updates">("backup");
  const [busy, setBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const inProgress = useRef(false);
  const updateInProgress = useRef(false);
  const handleApplying = useCallback((value: boolean) => {
    updateInProgress.current = value;
    setUpdateBusy(value);
  }, []);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!inProgress.current && !updateInProgress.current) close();
      }
      if (event.key === "Tab") {
        const controls = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
          ) || []),
        ].filter((element) => element.getClientRects().length > 0);
        if (!controls?.length) {
          event.preventDefault();
          panel.current?.focus();
          return;
        }
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === panel.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [close]);

  async function downloadBackup() {
    if (inProgress.current) return;
    inProgress.current = true;
    setBusy(true);
    setError("");
    setFilename("");
    try {
      const response = await fetch("/api/v1/backup", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || "백업 파일을 만들지 못했습니다. 다시 시도하세요.",
        );
      }
      const name = /filename="([a-zA-Z0-9._-]+\.pmrz)"/.exec(
        response.headers.get("content-disposition") || "",
      )?.[1];
      if (!name)
        throw new Error(
          "백업 파일 정보를 확인하지 못했습니다. 다시 시도하세요.",
        );
      const blob = await response.blob();
      if (!blob.size)
        throw new Error("백업 파일이 비어 있습니다. 다시 시도하세요.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      // Safari에서도 다운로드가 시작된 뒤 URL을 해제합니다.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setFilename(name);
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "서버에 연결하지 못했습니다. 앱이 실행 중인지 확인하고 다시 시도하세요."
          : (error as Error).message,
      );
    } finally {
      inProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="modal small-modal settings-modal"
      >
        <button
          className="modal-close icon-button"
          onClick={close}
          disabled={busy || updateBusy}
          aria-label="설정 닫기"
        >
          <X />
        </button>
        <div className="settings-kicker">
          <Settings size={15} />
          <span className="eyebrow">나의 서재 설정</span>
        </div>
        <h2 id="settings-title">설정</h2>
        <p>
          {tab === "backup"
            ? "소중한 학습 기록을 한 파일로 보관하세요."
            : "새 코드를 받고, 원할 때 적용하세요."}
        </p>
        <div
          role="tablist"
          aria-label="설정 메뉴"
          className="settings-tabs"
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight"].includes(event.key) &&
              !busy &&
              !updateBusy
            ) {
              event.preventDefault();
              const next = tab === "backup" ? "updates" : "backup";
              setTab(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }
          }}
        >
          <button
            role="tab"
            id="settings-tab-backup"
            aria-selected={tab === "backup"}
            aria-controls="settings-panel-backup"
            disabled={busy || updateBusy}
            onClick={() => setTab("backup")}
          >
            데이터 백업
          </button>
          <button
            role="tab"
            id="settings-tab-updates"
            aria-selected={tab === "updates"}
            aria-controls="settings-panel-updates"
            disabled={busy || updateBusy}
            onClick={() => setTab("updates")}
          >
            앱 업데이트
          </button>
        </div>
        <div
          role="tabpanel"
          id="settings-panel-backup"
          aria-labelledby="settings-tab-backup"
          hidden={tab !== "backup"}
        >
          <section
            className="settings-backup-card"
            aria-labelledby="backup-title"
            aria-busy={busy}
          >
            <span className="settings-backup-icon">
              <HardDrive size={25} strokeWidth={1.5} />
            </span>
            <h3 id="backup-title">전체 데이터 백업</h3>
            <p>
              현재 저장된 자료를 담은 <strong>.pmrz 파일</strong>을
              내려받습니다. 앱을 켜 둔 채로 백업할 수 있어요.
            </p>
            <ul className="backup-includes">
              <li>
                <Check size={14} />
                문항과 문제·해설 이미지
              </li>
              <li>
                <Check size={14} />
                풀이 기록·별표·메모
              </li>
              <li>
                <Check size={14} />
                개념·노트 연결·진행 중인 시험
              </li>
            </ul>
            <button
              className="button primary full-width backup-download-button"
              onClick={() => void downloadBackup()}
              disabled={busy || updateBusy}
            >
              {busy ? (
                <RefreshCw size={17} className="spin" />
              ) : (
                <Download size={17} />
              )}
              {busy ? "백업 파일 만드는 중…" : "전체 백업 다운로드"}
            </button>
            <p className="backup-destination">
              파일은 이 브라우저의 다운로드 위치에 저장됩니다.
            </p>
          </section>
          <div aria-live="polite">
            {busy && (
              <p className="field-help" role="status">
                백업 파일을 준비하고 있습니다. 이미지가 많으면 시간이 걸릴 수
                있어요.
              </p>
            )}
            {filename && (
              <div className="backup-success" role="status">
                <Check size={18} />
                <div>
                  <strong>백업 파일을 다운로드로 보냈습니다.</strong>
                  <p>
                    브라우저의 다운로드 목록에서 파일이 저장되었는지 확인하세요.
                  </p>
                  <code>{filename}</code>
                </div>
              </div>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="settings-backup-help">
            다른 Mac으로 옮길 때 이 백업 파일과 앱 설치 파일을 함께 가져가세요.
            앱 설치 파일과 실행 설정은 백업에 포함되지 않습니다. 복원 방법은
            README의 안내를 따르세요.
          </p>
        </div>
        <div
          role="tabpanel"
          id="settings-panel-updates"
          aria-labelledby="settings-tab-updates"
          hidden={tab !== "updates"}
        >
          <UpdatesPanel onApplying={handleApplying} backupBusy={busy} />
        </div>
      </section>
    </div>
  );
}
