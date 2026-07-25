/**
 * Service to inspect local workspace absolute path, Git worktree status,
 * active branch name, and auto-track associated GitHub Pull Requests.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, basename, normalize } from "node:path";
import { execSync } from "node:child_process";
import { githubMonitor, type TrackedPR } from "./github-monitor.js";

export interface WorkspaceStatus {
  absolutePath: string;
  ideWorkspacePath?: string;
  isWorktree: boolean;
  worktreeName?: string;
  worktreePath?: string;
  branch?: string;
  gitOrigin?: string; // owner/repo e.g. "stlim0727/porta"
  trackedPr?: TrackedPR;
}

interface WorktreeEntry {
  path: string;
  branch?: string;
}

function parseGitWorktrees(cwd: string): WorktreeEntry[] {
  try {
    const raw = execSync("git worktree list --porcelain", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!raw) return [];

    const entries: WorktreeEntry[] = [];
    const blocks = raw.split("\n\n");
    for (const block of blocks) {
      const lines = block.split("\n");
      let path = "";
      let branch = "";
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          path = normalize(line.slice(9).trim());
        } else if (line.startsWith("branch refs/heads/")) {
          branch = line.slice("branch refs/heads/".length).trim();
        }
      }
      if (path) {
        entries.push({ path, branch: branch || undefined });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function uriToLocalPath(uri: string): string {
  let p = uri;
  if (p.startsWith("file:///")) {
    p = p.slice(8);
  } else if (p.startsWith("file://")) {
    p = p.slice(7);
  }
  // Decode percent encoding (e.g. %20 -> space)
  try {
    p = decodeURIComponent(p);
  } catch {
    // ignore
  }
  return normalize(p);
}

function parseOriginRepo(remoteUrl: string): string | undefined {
  if (!remoteUrl) return undefined;
  // Patterns:
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  const match = remoteUrl.match(/(?:github\.com[:/])([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (match && match[1] && match[2]) {
    return `${match[1]}/${match[2]}`;
  }
  return undefined;
}

export function getWorkspaceStatus(
  workspaceUri: string,
  conversationId?: string,
  preferredBranch?: string,
): WorkspaceStatus {
  const localPath = uriToLocalPath(workspaceUri);
  const status: WorkspaceStatus = {
    absolutePath: localPath,
    ideWorkspacePath: localPath,
    isWorktree: false,
  };

  if (!existsSync(localPath)) {
    return status;
  }

  const gitPath = join(localPath, ".git");
  let gitDir = gitPath;

  if (existsSync(gitPath)) {
    try {
      const st = statSync(gitPath);
      if (st.isFile()) {
        status.isWorktree = true;
        status.worktreeName = basename(localPath);
        status.worktreePath = localPath;
        const content = readFileSync(gitPath, "utf8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/i);
        if (match && match[1]) {
          gitDir = match[1];
          if (!gitDir.includes(":") && !gitDir.startsWith("/") && !gitDir.startsWith("\\")) {
            gitDir = join(localPath, gitDir);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 1. Get branch name — always from disk HEAD
  try {
    const headPath = join(gitDir, "HEAD");
    if (existsSync(headPath)) {
      const headContent = readFileSync(headPath, "utf8").trim();
      if (headContent.startsWith("ref: refs/heads/")) {
        status.branch = headContent.slice("ref: refs/heads/".length).trim();
      } else {
        // Detached HEAD or commit hash
        status.branch = headContent.slice(0, 7);
      }
    }
  } catch {
    // fallback
  }

  if (!status.branch) {
    try {
      const branch = execSync("git branch --show-current", {
        cwd: localPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (branch) {
        status.branch = branch;
      }
    } catch {
      // ignore
    }
  }

  // 2. Check git worktrees for this repository
  //    Use preferredBranch (from conversation metadata) to find the correct
  //    worktree when the workspace has multiple worktrees and the conversation
  //    was started on a specific branch/worktree.
  const worktrees = parseGitWorktrees(localPath);
  if (worktrees.length > 0) {
    const currentNorm = localPath.toLowerCase();
    const mainWorktree = worktrees[0];

    // If the conversation has a recorded branch that maps to a specific
    // worktree different from the cwd, use that worktree.
    const lookupBranch = preferredBranch?.trim() || status.branch;
    const branchWorktree = lookupBranch
      ? worktrees.find(
          (w) => w.branch && w.branch.toLowerCase() === lookupBranch.toLowerCase(),
        )
      : undefined;

    const activeWorktree = branchWorktree || worktrees.find((w) => w.path.toLowerCase() === currentNorm);

    if (activeWorktree) {
      status.worktreePath = activeWorktree.path;
      status.worktreeName = basename(activeWorktree.path);
      const isDiffPath = activeWorktree.path.toLowerCase() !== currentNorm;
      const isDiffMain = mainWorktree && activeWorktree.path.toLowerCase() !== mainWorktree.path.toLowerCase();

      if (isDiffPath || isDiffMain) {
        status.isWorktree = true;
      }

      if (isDiffPath) {
        status.absolutePath = activeWorktree.path;
        // When resolving to a different worktree, use that worktree's branch
        if (activeWorktree.branch) {
          status.branch = activeWorktree.branch;
        }
      }
    }
  }

  // 3. Get origin repo
  try {
    const remoteUrl = execSync("git config --get remote.origin.url", {
      cwd: localPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    status.gitOrigin = parseOriginRepo(remoteUrl);
  } catch {
    // ignore
  }

  // 4. Return tracked PR if explicitly tracked for this conversationId
  if (conversationId) {
    const trackedPRs = githubMonitor.getTrackedPRs(conversationId);
    if (trackedPRs.length > 0) {
      status.trackedPr = trackedPRs[0];
    }
  }

  return status;
}
