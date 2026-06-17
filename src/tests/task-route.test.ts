import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockCanEditTasks = vi.fn();
const mockTaskFindUnique = vi.fn();
const mockTaskUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: mockTaskFindUnique,
      update: mockTaskUpdate,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
  getProjectMembership: mockGetProjectMembership,
  canEditTasks: mockCanEditTasks,
  unauthorized: (message = "unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  forbidden: (message = "forbidden") =>
    Response.json({ error: message }, { status: 403 }),
  notFound: (message = "not found") =>
    Response.json({ error: message }, { status: 404 }),
  badRequest: (message = "bad request", details?: unknown) =>
    Response.json({ error: message, details }, { status: 400 }),
}));

const routeModule = await import("@/app/api/tasks/[id]/route");

function makeRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as never;
}

function makeParams(id = "task-1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "viewer@example.com",
      name: "Viewer",
    });
    mockTaskFindUnique.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
    });
    mockTaskUpdate.mockResolvedValue({
      id: "task-1",
      title: "Updated title",
    });
  });

  it("rejects viewers before mutating the task", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    mockCanEditTasks.mockReturnValue(false);

    const res = await routeModule.PATCH(makeRequest({ title: "Updated title" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "viewers cannot update tasks" });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("allows members to update tasks", async () => {
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockCanEditTasks.mockReturnValue(true);

    const res = await routeModule.PATCH(makeRequest({ title: "Updated title" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      task: {
        id: "task-1",
        title: "Updated title",
      },
    });
    expect(mockGetProjectMembership).toHaveBeenCalledWith("user-1", "project-1");
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { title: "Updated title" },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  });
});
