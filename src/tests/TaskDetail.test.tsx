import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail } from "@/components/TaskDetail";
import type { ApiProjectMember, ApiTask } from "@/types";

const { mockApiFetch } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: mockApiFetch,
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const members: ApiProjectMember[] = [
  {
    id: "membership-1",
    role: "member",
    user: { id: "user-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
  },
  {
    id: "membership-2",
    role: "viewer",
    user: { id: "user-2", name: "Dev Sharma", email: "dev@example.com" },
  },
];

const task: ApiTask = {
  id: "task-1",
  projectId: "project-1",
  title: "Prepare customer email blast",
  description: "Task description",
  status: "todo",
  assigneeId: null,
  createdById: "user-1",
  position: 0,
  createdAt: "2026-06-17T10:00:00.000Z",
  updatedAt: "2026-06-17T10:00:00.000Z",
  assignee: null,
  comments: [
    {
      id: "comment-1",
      body: "First note",
      createdAt: "2026-06-17T10:00:00.000Z",
      author: { id: "user-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
    },
    {
      id: "comment-2",
      body: "Second note",
      createdAt: "2026-06-17T11:00:00.000Z",
      author: { id: "user-2", name: "Dev Sharma", email: "dev@example.com" },
    },
  ],
};

describe("<TaskDetail />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders comments in chronological order with author and timestamp", () => {
    renderWithClient(
      <TaskDetail
        task={task}
        projectId="project-1"
        currentUserRole="member"
        members={members}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("comments")).toBeInTheDocument();
    expect(screen.getAllByText("Meera Iyer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dev Sharma").length).toBeGreaterThan(0);
    expect(screen.getByText("First note").compareDocumentPosition(screen.getByText("Second note"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByText((_, element) => element?.tagName === "TIME")).toHaveLength(2);
    expect(screen.getByText("First note").closest("article")?.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-06-17T10:00:00.000Z",
    );
  });

  it("allows members to post a comment and clears the composer", async () => {
    mockApiFetch.mockResolvedValueOnce({
      comment: {
        id: "comment-3",
        body: "Need final copy review.",
        createdAt: "2026-06-17T12:00:00.000Z",
        author: { id: "user-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
      },
    });

    renderWithClient(
      <TaskDetail
        task={task}
        projectId="project-1"
        currentUserRole="member"
        members={members}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("add comment"), {
      target: { value: "Need final copy review." },
    });
    fireEvent.click(screen.getByRole("button", { name: "post comment" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/api/tasks/task-1/comments", {
        method: "POST",
        body: JSON.stringify({ body: "Need final copy review." }),
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("add comment")).toHaveValue("");
    });
  });

  it("lets viewers read comments but not post", () => {
    renderWithClient(
      <TaskDetail
        task={task}
        projectId="project-1"
        currentUserRole="viewer"
        members={members}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("First note")).toBeInTheDocument();
    expect(screen.getByText("viewers can read comments but cannot post.")).toBeInTheDocument();
    expect(screen.queryByLabelText("add comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "post comment" })).not.toBeInTheDocument();
  });
});
