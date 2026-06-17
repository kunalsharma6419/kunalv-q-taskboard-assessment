import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockGetProjectMembership = vi.fn();
const mockCanEditTasks = vi.fn();
const mockProjectFindUnique = vi.fn();
const mockCreateAirtableExportClient = vi.fn();
const mockExportProjectTasksToAirtable = vi.fn();

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
  canEditTasks: mockCanEditTasks,
  unauthorized: (message = "unauthorized") =>
    Response.json({ error: message }, { status: 401 }),
  forbidden: (message = "forbidden") =>
    Response.json({ error: message }, { status: 403 }),
  notFound: (message = "not found") =>
    Response.json({ error: message }, { status: 404 }),
}));

vi.mock("@/lib/airtable", () => ({
  AirtableConfigError: class AirtableConfigError extends Error {},
  createAirtableExportClient: mockCreateAirtableExportClient,
  exportProjectTasksToAirtable: mockExportProjectTasksToAirtable,
}));

const routeModule = await import("@/app/api/projects/[id]/export-airtable/route");

function makeRequest() {
  return {} as never;
}

function makeParams(id = "project-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/projects/[id]/export-airtable", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockProjectFindUnique.mockResolvedValue({
      id: "project-1",
      name: "Q3 Launch",
      tasks: [
        {
          id: "task-1",
          title: "Prepare customer email blast",
          description: "Task description",
          status: "todo",
          position: 3,
          createdAt: new Date("2026-06-17T10:00:00.000Z"),
          updatedAt: new Date("2026-06-17T11:00:00.000Z"),
          assignee: { id: "user-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
        },
      ],
    });
    mockCreateAirtableExportClient.mockReturnValue({ upsertTask: vi.fn() });
    mockExportProjectTasksToAirtable.mockResolvedValue({
      total: 1,
      created: 1,
      updated: 0,
      failed: 0,
      failures: [],
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockProjectFindUnique).not.toHaveBeenCalled();
  });

  it("returns 403 for non-members", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com", name: "Arjun Rao" });
    mockGetProjectMembership.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "you are not a member of this project" });
  });

  it("returns 403 for viewers", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "dev@example.com", name: "Dev" });
    mockGetProjectMembership.mockResolvedValue({ role: "viewer" });
    mockCanEditTasks.mockReturnValue(false);

    const res = await routeModule.POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "viewers cannot export tasks" });
  });

  it("exports tasks for members", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com", name: "Arjun Rao" });
    mockGetProjectMembership.mockResolvedValue({ role: "member" });
    mockCanEditTasks.mockReturnValue(true);

    const res = await routeModule.POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.result).toMatchObject({ total: 1, created: 1, updated: 0, failed: 0 });
    expect(mockExportProjectTasksToAirtable).toHaveBeenCalledWith(
      { id: "project-1", name: "Q3 Launch" },
      [
        expect.objectContaining({
          id: "task-1",
          title: "Prepare customer email blast",
          status: "todo",
        }),
      ],
      expect.anything(),
    );
  });

  it("returns partial failures without failing the whole run", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com", name: "Arjun Rao" });
    mockGetProjectMembership.mockResolvedValue({ role: "admin" });
    mockCanEditTasks.mockReturnValue(true);
    mockExportProjectTasksToAirtable.mockResolvedValue({
      total: 2,
      created: 1,
      updated: 0,
      failed: 1,
      failures: [
        {
          taskId: "task-2",
          taskTitle: "Broken task",
          message: "invalid_request_unknown",
          permanent: true,
        },
      ],
    });

    const res = await routeModule.POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.result.failed).toBe(1);
    expect(json.result.failures[0].taskId).toBe("task-2");
  });

  it("returns 404 when the project does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com", name: "Arjun Rao" });
    mockGetProjectMembership.mockResolvedValue({ role: "admin" });
    mockCanEditTasks.mockReturnValue(true);
    mockProjectFindUnique.mockResolvedValue(null);

    const res = await routeModule.POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "project not found" });
  });
});
