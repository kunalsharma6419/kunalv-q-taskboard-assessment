import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockProjectFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: mockProjectFindUnique,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
  getProjectMembership: mockGetProjectMembership,
  unauthorized: (message = "unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  forbidden: (message = "forbidden") =>
    Response.json({ error: message }, { status: 403 }),
  notFound: (message = "not found") =>
    Response.json({ error: message }, { status: 404 }),
  badRequest: (message = "bad request", details?: unknown) =>
    Response.json({ error: message, details }, { status: 400 }),
  canEditProject: vi.fn(),
}));

const routeModule = await import("@/app/api/projects/[id]/route");

function makeRequest() {
  return {} as never;
}

function makeParams(id = "project-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "meera@taskboard.dev",
      name: "Meera Iyer",
    });
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockProjectFindUnique.mockResolvedValue({
      id: "project-1",
      name: "Q3 Launch",
      description: "Launch work",
      ownerId: "user-1",
      createdAt: "2026-06-17T10:00:00.000Z",
      updatedAt: "2026-06-17T10:00:00.000Z",
      owner: {
        id: "user-1",
        email: "meera@taskboard.dev",
        name: "Meera Iyer",
      },
      memberships: [
        {
          id: "membership-1",
          role: "member",
          user: {
            id: "user-1",
            email: "meera@taskboard.dev",
            name: "Meera Iyer",
          },
        },
      ],
      tasks: [
        {
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
              author: {
                id: "user-1",
                email: "meera@taskboard.dev",
                name: "Meera Iyer",
              },
            },
            {
              id: "comment-2",
              body: "Second note",
              createdAt: "2026-06-17T11:00:00.000Z",
              author: {
                id: "user-1",
                email: "meera@taskboard.dev",
                name: "Meera Iyer",
              },
            },
          ],
        },
      ],
    });
  });

  it("requests safe user fields and chronological comments", async () => {
    const res = await routeModule.GET(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockProjectFindUnique).toHaveBeenCalledWith({
      where: { id: "project-1" },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        memberships: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
        tasks: {
          include: {
            assignee: { select: { id: true, email: true, name: true } },
            comments: {
              include: {
                author: { select: { id: true, email: true, name: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: [{ status: "asc" }, { position: "asc" }],
        },
      },
    });
    expect(json.project.owner).not.toHaveProperty("passwordHash");
    expect(json.project.memberships[0].user).not.toHaveProperty("passwordHash");
    expect(json.project.tasks[0].comments.map((comment: { body: string }) => comment.body)).toEqual([
      "First note",
      "Second note",
    ]);
  });
});
