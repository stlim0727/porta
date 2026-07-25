import { describe, it, expect } from "vitest";
import { getWorkspaceStatus } from "../workspace-status.js";

describe("getWorkspaceStatus with preferredBranch", () => {
  it("uses preferredBranch when provided", () => {
    const cwd = process.cwd();
    const status = getWorkspaceStatus(cwd, "test-conv-id", "feat/my-custom-branch");
    expect(status.branch).toBe("feat/my-custom-branch");
  });

  it("falls back to on-disk HEAD when preferredBranch is missing", () => {
    const cwd = process.cwd();
    const status = getWorkspaceStatus(cwd, "test-conv-id");
    expect(status.branch).toBeDefined();
    expect(status.branch!.length).toBeGreaterThan(0);
  });
});
