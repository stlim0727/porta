import { describe, it, expect } from "vitest";
import { getWorkspaceStatus } from "../workspace-status.js";

describe("getWorkspaceStatus with preferredBranch", () => {
  it("always reads branch from disk HEAD, ignoring preferredBranch for non-worktree repos", () => {
    const cwd = process.cwd();
    const statusWithPreferred = getWorkspaceStatus(cwd, "test-conv-id", "some/old-branch");
    const statusWithout = getWorkspaceStatus(cwd, "test-conv-id");

    // Both should return the same branch (from disk HEAD), not the preferredBranch
    expect(statusWithPreferred.branch).toBe(statusWithout.branch);
    expect(statusWithPreferred.branch).not.toBe("some/old-branch");
  });

  it("reads branch from disk HEAD when preferredBranch is missing", () => {
    const cwd = process.cwd();
    const status = getWorkspaceStatus(cwd, "test-conv-id");
    expect(status.branch).toBeDefined();
    expect(status.branch!.length).toBeGreaterThan(0);
  });
});
