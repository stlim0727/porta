import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatSettingsModal } from "../components/ChatSettingsModal";
import type { ChatSettings } from "../types";

describe("ChatSettingsModal", () => {
  const defaultSettings: ChatSettings = {
    autoApprovedExecutables: ["git", "node"],
    autoApproveAllCommands: false,
  };

  it("does not render when isOpen is false", () => {
    render(
      <ChatSettingsModal
        isOpen={false}
        onClose={vi.fn()}
        cascadeId="conv-1"
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
      />,
    );
    expect(screen.queryByText("Chat Settings")).not.toBeInTheDocument();
  });

  it("renders workspace & git info, auto approval, and danger zone sections when isOpen is true", () => {
    render(
      <ChatSettingsModal
        isOpen={true}
        onClose={vi.fn()}
        cascadeId="conv-1"
        chatTitle="My Conversation"
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Chat Settings")).toBeInTheDocument();
    expect(screen.getByText("My Conversation")).toBeInTheDocument();
    expect(screen.getByText("Workspace & Git Info")).toBeInTheDocument();
    expect(screen.getByText("Terminal Command Auto-Approval")).toBeInTheDocument();
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
    expect(screen.getAllByText("git")[0]).toBeInTheDocument();
    expect(screen.getAllByText("node")[0]).toBeInTheDocument();
  });

  it("adds preset executable when clicking preset chip", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatSettingsModal
        isOpen={true}
        onClose={vi.fn()}
        cascadeId="conv-1"
        settings={{ autoApprovedExecutables: ["git"], autoApproveAllCommands: false }}
        onUpdateSettings={onUpdate}
      />,
    );

    const pnpmChip = screen.getByRole("button", { name: /\+ pnpm/i });
    await userEvent.click(pnpmChip);

    expect(onUpdate).toHaveBeenCalledWith({
      autoApprovedExecutables: ["git", "pnpm"],
    });
  });

  it("removes executable when clicking remove button", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatSettingsModal
        isOpen={true}
        onClose={vi.fn()}
        cascadeId="conv-1"
        settings={defaultSettings}
        onUpdateSettings={onUpdate}
      />,
    );

    const removeGitBtn = screen.getByTitle("Remove git");
    await userEvent.click(removeGitBtn);

    expect(onUpdate).toHaveBeenCalledWith({
      autoApprovedExecutables: ["node"],
    });
  });

  it("adds custom executable when submitted", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatSettingsModal
        isOpen={true}
        onClose={vi.fn()}
        cascadeId="conv-1"
        settings={defaultSettings}
        onUpdateSettings={onUpdate}
      />,
    );

    const input = screen.getByPlaceholderText(/Executable name/i);
    await userEvent.type(input, "cargo");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onUpdate).toHaveBeenCalledWith({
      autoApprovedExecutables: ["git", "node", "cargo"],
    });
  });

  it("calls onDeleteChat and onClose when confirming delete chat", async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ChatSettingsModal
        isOpen={true}
        onClose={onClose}
        cascadeId="conv-1"
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onDeleteChat={onDelete}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: "Delete Chat" });
    await userEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith("Are you sure you want to delete this chat?");
    expect(onDelete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
