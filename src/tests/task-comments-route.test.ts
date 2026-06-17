import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockCanEditTasks = vi.fn();
const mockTaskFindUnique = vi.fn();
const mockTaskCommentCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: mockTaskFindUnique,
    },
    taskComment: {
      create: mockTaskCommentCreate,
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

const routeModule = await import("@/app/api/tasks/[id]/comments/route");

function makeRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as never;
}

function makeParams(id = "task-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/tasks/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTaskFindUnique.mockResolvedValue({ id: "task-1", projectId: "project-1" });
    mockTaskCommentCreate.mockResolvedValue({
      id: "comment-1",
      body: "Need design approval before launch.",
      createdAt: "2026-06-17T10:00:00.000Z",
      author: {
        id: "user-1",
        name: "Arjun Rao",
        email: "arjun@taskboard.dev",
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest({ body: "hi" }), makeParams());

    expect(res.status).toBe(401);
    expect(mockTaskFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "arjun@taskboard.dev",
      name: "Arjun Rao",
    });
    mockTaskFindUnique.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest({ body: "hi" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "task not found" });
  });

  it("returns 403 for non-members", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "arjun@taskboard.dev",
      name: "Arjun Rao",
    });
    mockGetProjectMembership.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest({ body: "hi" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "you are not a member of this project" });
    expect(mockTaskCommentCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for viewers", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "dev@example.com",
      name: "Dev Sharma",
    });
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    mockCanEditTasks.mockReturnValue(false);

    const res = await routeModule.POST(makeRequest({ body: "hi" }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "viewers cannot post comments" });
    expect(mockTaskCommentCreate).not.toHaveBeenCalled();
  });

  it("creates a comment for members", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "arjun@taskboard.dev",
      name: "Arjun Rao",
    });
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockCanEditTasks.mockReturnValue(true);

    const res = await routeModule.POST(
      makeRequest({ body: "  Need design approval before launch.  " }),
      makeParams(),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({
      comment: {
        id: "comment-1",
        body: "Need design approval before launch.",
        createdAt: "2026-06-17T10:00:00.000Z",
        author: {
          id: "user-1",
          name: "Arjun Rao",
          email: "arjun@taskboard.dev",
        },
      },
    });
    expect(mockTaskCommentCreate).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        authorId: "user-1",
        body: "Need design approval before launch.",
      },
      include: {
        author: { select: { id: true, email: true, name: true } },
      },
    });
  });

  it("creates a comment for admins", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-2",
      email: "meera@taskboard.dev",
      name: "Meera Iyer",
    });
    mockGetProjectMembership.mockResolvedValue({ role: "admin" });
    mockCanEditTasks.mockReturnValue(true);

    const res = await routeModule.POST(makeRequest({ body: "Approved." }), makeParams());

    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid input", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "arjun@taskboard.dev",
      name: "Arjun Rao",
    });

    const res = await routeModule.POST(makeRequest({ body: "   " }), makeParams());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid input");
    expect(mockTaskFindUnique).not.toHaveBeenCalled();
  });
});
