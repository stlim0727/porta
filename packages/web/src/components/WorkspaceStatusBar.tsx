import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { WorkspaceStatus, ChatSettings } from "../types";

interface Props {
  cascadeId?: string;
  projectName?: string;
  chatSettings?: ChatSettings;
  onOpenChatSettings?: () => void;
}

export function WorkspaceStatusBar({
  cascadeId,
  chatSettings,
  onOpenChatSettings,
}: Props) {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackedPrs, setTrackedPrs] = useState<any[]>([]);

  const fetchStatus = async () => {
    if (!cascadeId) return;
    try {
      const data = await api.getWorkspaceStatus(cascadeId);
      setStatus(data);
      if (data.trackedPr) {
        setTrackedPrs([data.trackedPr]);
      }
    } catch {
      // ignore
    }
  };

  const fetchTrackedPrs = async () => {
    if (!cascadeId) return;
    try {
      const res = await api.getTrackedPRs(cascadeId);
      if (res.prs && res.prs.length > 0) {
        setTrackedPrs(res.prs);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchStatus();
    void fetchTrackedPrs();
    const interval = setInterval(() => {
      void fetchStatus();
      void fetchTrackedPrs();
    }, 8_000);
    return () => clearInterval(interval);
  }, [cascadeId]);

  if (!status || !status.absolutePath) return null;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(status.absolutePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddPR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cascadeId || !newUrl.trim()) return;
    setLoading(true);
    try {
      await api.trackPR(cascadeId, newUrl.trim());
      setNewUrl("");
      await fetchTrackedPrs();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePR = async (owner: string, repo: string, pullNumber: number) => {
    if (!cascadeId) return;
    try {
      await api.untrackPR(cascadeId, owner, repo, pullNumber);
      await fetchTrackedPrs();
    } catch (err) {
      console.error("Failed to untrack PR", err);
    }
  };

  const getCiIcon = (ciStatus?: string) => {
    if (ciStatus === "success") return "✅";
    if (ciStatus === "failure") return "❌";
    if (ciStatus === "pending") return "⏳";
    return "⚪";
  };

  const getReviewIcon = (state?: string) => {
    if (state === "APPROVED") return "👍";
    if (state === "CHANGES_REQUESTED") return "⚠️";
    if (state === "COMMENTED") return "💬";
    return "";
  };

  const folderName =
    status.worktreeName ||
    status.absolutePath.split(/[/\\]/).filter(Boolean).pop() ||
    status.absolutePath;

  const activePr = trackedPrs.length > 0 ? trackedPrs[0] : status.trackedPr;

  const hasAutoExecutables =
    chatSettings &&
    (chatSettings.autoApproveAllCommands ||
      (chatSettings.autoApprovedExecutables &&
        chatSettings.autoApprovedExecutables.length > 0));

  const autoLabel = chatSettings?.autoApproveAllCommands
    ? "All commands"
    : chatSettings?.autoApprovedExecutables?.join(", ");

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Compact Header Info Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? "rgba(30, 41, 59, 0.95)" : "rgba(30, 41, 59, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "6px",
          color: "#e2e8f0",
          padding: "4px 10px",
          fontSize: "12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontWeight: 500,
          transition: "all 0.15s ease",
        }}
        title="Click to view Workspace, Git & Auto-Approve Info"
      >
        <span>ℹ️ Info</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span>{status.isWorktree ? "🌴" : "📁"}</span>
        <span
          style={{
            fontWeight: 600,
            color: status.isWorktree ? "#38bdf8" : "#cbd5e1",
            maxWidth: "90px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {folderName}
        </span>
        {status.branch && (
          <span
            style={{
              color: "#a7f3d0",
              maxWidth: "80px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            🌿 {status.branch}
          </span>
        )}
        {activePr && (
          <span style={{ fontSize: "11px", color: "#60a5fa" }}>
            🐙 #{activePr.pullNumber} {getCiIcon(activePr.lastCiStatus)}
          </span>
        )}
        {hasAutoExecutables && (
          <span style={{ fontSize: "11px", color: "#fbbf24" }} title={`Auto-approving: ${autoLabel}`}>
            ⚡ Auto
          </span>
        )}
      </button>

      {/* Workspace, Git & Auto-Approve Info Popover Modal */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "6px",
            width: "350px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
            zIndex: 999,
            color: "#f8fafc",
            fontSize: "13px",
          }}
        >
          {/* Popover Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              paddingBottom: "8px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>📂 Workspace & Git Info</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "14px",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Section 1: Absolute Path & Worktree */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
              Working Directory
            </div>
            <div
              style={{
                background: "#1e293b",
                borderRadius: "6px",
                padding: "8px 10px",
                wordBreak: "break-all",
                fontSize: "12px",
                fontFamily: "monospace",
                color: "#e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>{status.absolutePath}</span>
              <button
                onClick={handleCopyPath}
                style={{
                  background: copied ? "#166534" : "#334155",
                  border: "none",
                  borderRadius: "4px",
                  color: "#fff",
                  fontSize: "11px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            {status.isWorktree && (
              <div style={{ marginTop: "4px", fontSize: "11px", color: "#38bdf8", fontWeight: 500 }}>
                🌴 Git Worktree: {status.worktreeName || folderName}
              </div>
            )}
          </div>

          {/* Section 2: Git Branch */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
              Active Git Branch
            </div>
            <div
              style={{
                background: "#1e293b",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "12px",
                color: "#a7f3d0",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🌿</span>
              <span>{status.branch || "No active branch"}</span>
            </div>
          </div>

          {/* Section 3: GitHub PR Status & Tracking */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
              GitHub Pull Request
            </div>

            <form onSubmit={handleAddPR} style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <input
                type="text"
                placeholder="Paste PR URL to track..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  borderRadius: "4px",
                  border: "1px solid #334155",
                  background: "#1e293b",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "5px 10px",
                  borderRadius: "4px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Track
              </button>
            </form>

            {trackedPrs.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "6px 0" }}>
                No active PR found for current branch.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "140px", overflowY: "auto" }}>
                {trackedPrs.map((pr) => (
                  <div
                    key={pr.id || pr.pullNumber}
                    style={{
                      background: "#1e293b",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      border: "1px solid #334155",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", fontWeight: 600, textDecoration: "none" }}
                      >
                        {pr.owner || "PR"}#{pr.pullNumber}
                      </a>
                      <button
                        onClick={() => handleRemovePR(pr.owner, pr.repo, pr.pullNumber)}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "11px" }}
                      >
                        Remove
                      </button>
                    </div>
                    {pr.title && <div style={{ fontSize: "11px", color: "#cbd5e1" }}>{pr.title}</div>}
                    <div style={{ fontSize: "11px", display: "flex", gap: "10px", color: "#94a3b8" }}>
                      <span>CI: {getCiIcon(pr.lastCiStatus)} {pr.lastCiStatus || "unknown"}</span>
                      {pr.lastReviewState && pr.lastReviewState !== "NONE" && (
                        <span>Review: {getReviewIcon(pr.lastReviewState)} {pr.lastReviewState}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Command Auto-Approval Settings */}
          <div style={{ paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
              Command Auto-Approval
            </div>
            <div
              style={{
                background: "#1e293b",
                borderRadius: "6px",
                padding: "8px 10px",
                fontSize: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                <span>⚡</span>
                <span
                  style={{
                    color: hasAutoExecutables ? "#fbbf24" : "#94a3b8",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chatSettings?.autoApproveAllCommands
                    ? "ALL commands auto-approved"
                    : hasAutoExecutables
                      ? `Auto: ${autoLabel}`
                      : "No auto-approval set"}
                </span>
              </div>
              {onOpenChatSettings && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenChatSettings();
                  }}
                  style={{
                    background: "#334155",
                    border: "none",
                    borderRadius: "4px",
                    color: "#fff",
                    fontSize: "11px",
                    padding: "4px 8px",
                    cursor: "pointer",
                    flexShrink: 0,
                    fontWeight: 500,
                  }}
                >
                  ⚙️ Configure
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
