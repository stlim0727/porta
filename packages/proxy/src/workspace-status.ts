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
  isWorktree: boolean;
  worktreeName?: string;
  branch?: string;
  gitOrigin?: string; // owner/repo e.g. "stlim0727/porta"
  trackedPr?: TrackedPR;
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
): WorkspaceStatus {
  const localPath = uriToLocalPath(workspaceUri);
  const status: WorkspaceStatus = {
    absolutePath: localPath,
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

  // 1. Get branch name
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

  // 2. Get origin repo
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

  // 3. Auto-track PR if conversationId and branch are present
  if (conversationId && status.branch && status.gitOrigin) {
    const [owner, repo] = status.gitOrigin.split("/");
    if (owner && repo) {
      const trackedPRs = githubMonitor.getTrackedPRs(conversationId);
      if (trackedPRs.length > 0) {
        status.trackedPr = trackedPRs[0];
      } else if (status.branch !== "main" && status.branch !== "master") {
        // Async auto lookup
        void autoLookupAndTrackPR(conversationId, owner, repo, status.branch);
      }
    }
  }

  return status;
}

async function autoLookupAndTrackPR(
  conversationId: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  try {
    // Attempt gh cli check
    const ghOutput = execSync(
      `gh pr list --repo ${owner}/${repo} --head ${branch} --json number,url,title,state`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();

    if (ghOutput) {
      const prs = JSON.parse(ghOutput);
      if (Array.isArray(prs) && prs.length > 0 && prs[0].number) {
        githubMonitor.trackPR(conversationId, owner, repo, prs[0].number, false);
      }
    }
  } catch {
    // gh cli lookup failed or PR not found
  }
}
