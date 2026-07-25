import React, { useState, useEffect } from "react";
import type { ChatSettings, WorkspaceStatus, TrackedPR } from "../types";
import { api } from "../api/client";
import { IconCheck, IconFolder, IconGitBranch, IconCopy } from "./Icons";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cascadeId: string;
  chatTitle?: string;
  settings: ChatSettings;
  onUpdateSettings: (patch: Partial<ChatSettings>) => Promise<void>;
  onDeleteChat?: () => void;
  workspaceUri?: string;
  branchName?: string;
}

const COMMON_PRESETS = ["git", "node", "pnpm", "npm", "bun", "python", "cargo", "docker", "deno"];

export function ChatSettingsModal({
  isOpen,
  onClose,
  cascadeId,
  chatTitle,
  settings,
  onUpdateSettings,
  onDeleteChat,
  workspaceUri,
  branchName,
}: Props) {
  const [customExe, setCustomExe] = useState("");
  const [saving, setSaving] = useState(false);

  // Info Section State
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [trackedPrs, setTrackedPrs] = useState<TrackedPR[]>([]);
  const [newPrUrl, setNewPrUrl] = useState("");
  const [prLoading, setPrLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !cascadeId) return;

    let mounted = true;
    const loadInfo = async () => {
      try {
        const [wsData, prsData] = await Promise.all([
          api
            .getWorkspaceStatus(cascadeId, workspaceUri, branchName)
            .catch(() => null),
          api.getTrackedPRs(cascadeId).catch(() => ({ prs: [] })),
        ]);
        if (mounted) {
          if (wsData) setStatus(wsData);
          setTrackedPrs(prsData.prs ?? []);
        }
      } catch {
        // ignore
      }
    };

    void loadInfo();
    return () => {
      mounted = false;
    };
  }, [isOpen, cascadeId, workspaceUri, branchName]);

  if (!isOpen) return null;

  const currentExecutables = settings.autoApprovedExecutables ?? [];

  const handleToggleExecutable = async (exe: string) => {
    const normalized = exe.toLowerCase().trim();
    if (!normalized) return;

    let updated: string[];
    if (currentExecutables.includes(normalized)) {
      updated = currentExecutables.filter((e) => e !== normalized);
    } else {
      updated = [...currentExecutables, normalized];
    }

    setSaving(true);
    try {
      await onUpdateSettings({ autoApprovedExecutables: updated });
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustom = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const normalized = customExe.toLowerCase().trim();
    if (!normalized) return;

    if (!currentExecutables.includes(normalized)) {
      setSaving(true);
      try {
        await onUpdateSettings({
          autoApprovedExecutables: [...currentExecutables, normalized],
        });
        setCustomExe("");
      } finally {
        setSaving(false);
      }
    } else {
      setCustomExe("");
    }
  };

  const handleToggleApproveAll = async (checked: boolean) => {
    setSaving(true);
    try {
      await onUpdateSettings({ autoApproveAllCommands: checked });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyText = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleAddPR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cascadeId || !newPrUrl.trim()) return;
    setPrLoading(true);
    try {
      await api.trackPR(cascadeId, newPrUrl.trim());
      setNewPrUrl("");
      const res = await api.getTrackedPRs(cascadeId);
      setTrackedPrs(res.prs ?? []);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPrLoading(false);
    }
  };

  const handleRemovePR = async (owner: string, repo: string, pullNumber: number) => {
    if (!cascadeId) return;
    try {
      await api.untrackPR(cascadeId, owner, repo, pullNumber);
      setTrackedPrs((prev) => prev.filter((p) => Number(p.pullNumber) !== Number(pullNumber)));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <h3>Chat Settings</h3>
            {chatTitle && <span className="modal-subtitle">{chatTitle}</span>}
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close settings">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* SECTION 1: Workspace & Git Information (dir, br, pr) */}
          <div className="settings-section info-section">
            <h4 className="settings-section-title">Workspace & Git Info</h4>
            
            {/* dir */}
            <div className="settings-field info-field" style={{ marginTop: "10px" }}>
              <label className="field-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <IconFolder size={13} /> Directory (dir)
              </label>
              <div className="info-value-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-tertiary, #18181c)", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", color: "var(--text-secondary, #cccccc)" }}>
                <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {status?.absolutePath || workspaceUri || "N/A"}
                </span>
                {(status?.absolutePath || workspaceUri) && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(status?.absolutePath || workspaceUri || "")}
                    style={{ background: "transparent", border: "none", color: copiedPath ? "#22c55e" : "var(--text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", marginLeft: "8px", flexShrink: 0 }}
                  >
                    {copiedPath ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    {copiedPath ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>

            {/* br */}
            <div className="settings-field info-field" style={{ marginTop: "12px" }}>
              <label className="field-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <IconGitBranch size={13} /> Branch (br)
              </label>
              <div className="info-value-box" style={{ background: "var(--bg-tertiary, #18181c)", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", color: "#38bdf8", fontFamily: "monospace", fontWeight: 500 }}>
                {status?.branch || "No active branch"}
              </div>
            </div>

            {/* pr */}
            <div className="settings-field info-field" style={{ marginTop: "12px" }}>
              <label className="field-label">Tracked Pull Requests (pr)</label>
              {trackedPrs.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", marginBottom: "8px" }}>
                  No PRs tracked yet for this chat.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                  {trackedPrs.map((pr) => (
                    <div key={`${pr.owner}/${pr.repo}#${pr.pullNumber}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-tertiary, #18181c)", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}>
                      <a href={pr.url || `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.pullNumber}`} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 500 }}>
                        {pr.owner}/{pr.repo}#{pr.pullNumber} {pr.title ? `- ${pr.title}` : ""}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemovePR(pr.owner, pr.repo, pr.pullNumber)}
                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "11px" }}
                      >
                        Untrack
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddPR} style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="GitHub PR URL (e.g., https://github.com/owner/repo/pull/12)"
                  value={newPrUrl}
                  onChange={(e) => setNewPrUrl(e.target.value)}
                  style={{ flex: 1, fontSize: "12px" }}
                  disabled={prLoading}
                />
                <button type="submit" className="settings-add-btn" disabled={!newPrUrl.trim() || prLoading} style={{ fontSize: "12px" }}>
                  Track PR
                </button>
              </form>
            </div>
          </div>

          {/* SECTION 2: Terminal Command Auto-Approval */}
          <div className="settings-section" style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))" }}>
            <h4 className="settings-section-title">Terminal Command Auto-Approval</h4>
            <p className="settings-section-desc">
              When Antigravity requests command execution (e.g. <code>git</code>, <code>node</code>, <code>pnpm</code>),
              commands matching allowed executables will be auto-approved directly for this chat.
            </p>

            <div className="settings-field">
              <label className="field-label">Allowed Executables</label>
              <div className="exe-tags-container">
                {currentExecutables.length === 0 ? (
                  <span className="no-exe-text">No executables configured yet. Select a preset or type one below.</span>
                ) : (
                  currentExecutables.map((exe) => (
                    <span key={exe} className="exe-tag">
                      <code>{exe}</code>
                      <button
                        type="button"
                        className="exe-remove-btn"
                        onClick={() => handleToggleExecutable(exe)}
                        title={`Remove ${exe}`}
                        disabled={saving}
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="settings-field">
              <label className="field-label">Quick Add Presets</label>
              <div className="presets-chips">
                {COMMON_PRESETS.map((preset) => {
                  const isAdded = currentExecutables.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`preset-chip ${isAdded ? "active" : ""}`}
                      onClick={() => handleToggleExecutable(preset)}
                      disabled={saving}
                    >
                      {isAdded ? <IconCheck size={11} /> : "+"} {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleAddCustom} className="settings-field custom-exe-form">
              <label className="field-label">Add Custom Executable</label>
              <div className="custom-exe-input-group">
                <input
                  type="text"
                  className="settings-input"
                  placeholder="Executable name (e.g., make, kubectl, cargo)"
                  value={customExe}
                  onChange={(e) => setCustomExe(e.target.value)}
                  disabled={saving}
                />
                <button
                  type="submit"
                  className="settings-add-btn"
                  disabled={!customExe.trim() || saving}
                >
                  Add
                </button>
              </div>
            </form>

            <div className="settings-row approve-all-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Auto-approve ALL commands</span>
                <span className="settings-row-desc">
                  Automatically approve any terminal command requested by Antigravity in this chat.
                </span>
              </div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={settings.autoApproveAllCommands}
                  onChange={(e) => handleToggleApproveAll(e.target.checked)}
                  disabled={saving}
                />
                <span className="settings-switch-track" />
              </label>
            </div>
          </div>

          {/* SECTION 3: Danger Zone */}
          {onDeleteChat && (
            <div
              className="settings-section danger-section"
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h4 className="settings-section-title" style={{ color: "#f87171", margin: 0 }}>
                    Danger Zone
                  </h4>
                  <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                    Permanently delete this conversation trajectory.
                  </div>
                </div>
                <button
                  type="button"
                  className="chat-delete-btn"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to delete this chat?")) {
                      onDeleteChat();
                      onClose();
                    }
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#f87171",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "12px",
                    transition: "all 150ms ease",
                  }}
                >
                  Delete Chat
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="settings-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
