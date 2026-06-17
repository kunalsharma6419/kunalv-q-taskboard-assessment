import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirtableError, AirtableMockClient } from "@/lib/airtable-mock";
import {
  createMockAirtableExportClient,
  extractMissingRequiredFields,
  exportProjectTasksToAirtable,
  type AirtableExportClient,
  TASK_ID_FIELD,
} from "@/lib/airtable";

const project = { id: "project-1", name: "Q3 Launch" };
const task = {
  id: "task-1",
  title: "Prepare customer email blast",
  description: "Task description",
  status: "todo" as const,
  position: 2,
  createdAt: new Date("2026-06-17T10:00:00.000Z"),
  updatedAt: new Date("2026-06-17T11:00:00.000Z"),
  assignee: { id: "user-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
};

describe("airtable export service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates then updates the same task on rerun", async () => {
    const mockClient = new AirtableMockClient();
    const client = createMockAirtableExportClient(mockClient);

    const first = await exportProjectTasksToAirtable(project, [task], client);
    const second = await exportProjectTasksToAirtable(project, [{ ...task, title: "Updated title" }], client);

    expect(first).toMatchObject({ total: 1, created: 1, updated: 0, failed: 0 });
    expect(second).toMatchObject({ total: 1, created: 0, updated: 1, failed: 0 });

    const records = mockClient.__getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].fields[TASK_ID_FIELD]).toBe("task-1");
    expect(records[0].fields.Title).toBe("Updated title");
  });

  it("retries transient failures and succeeds", async () => {
    const client: AirtableExportClient = {
      upsertTask: vi.fn()
        .mockRejectedValueOnce(new AirtableError("rate limited", "rate-limit", 429))
        .mockRejectedValueOnce(new AirtableError("temporary outage", "server-error", 500))
        .mockResolvedValueOnce("created"),
    };

    const result = await exportProjectTasksToAirtable(project, [task], client);

    expect(result).toMatchObject({ total: 1, created: 1, updated: 0, failed: 0 });
    expect(client.upsertTask).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent failures and keeps exporting later tasks", async () => {
    const client: AirtableExportClient = {
      upsertTask: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("invalid_request_unknown"), { statusCode: 422 }))
        .mockResolvedValueOnce("updated"),
    };

    const result = await exportProjectTasksToAirtable(project, [
      task,
      { ...task, id: "task-2", title: "Follow up with design" },
    ], client);

    expect(result).toMatchObject({ total: 2, created: 0, updated: 1, failed: 1 });
    expect(result.failures[0]).toEqual({
      taskId: "task-1",
      taskTitle: "Prepare customer email blast",
      message: "invalid_request_unknown",
      permanent: true,
    });
    expect(client.upsertTask).toHaveBeenCalledTimes(2);
  });

  it("surfaces fetch-style error messages from the Airtable client", async () => {
    const client: AirtableExportClient = {
      upsertTask: vi.fn().mockRejectedValue({
        message: "request to https://api.airtable.com failed, reason: connect EACCES",
        code: "EACCES",
      }),
    };

    const result = await exportProjectTasksToAirtable(project, [task], client);

    expect(result.failed).toBe(1);
    expect(result.failures[0]).toEqual({
      taskId: "task-1",
      taskTitle: "Prepare customer email blast",
      message: "request to https://api.airtable.com failed, reason: connect EACCES",
      permanent: false,
    });
  });

  it("extracts required fields from Airtable unknown-field errors", () => {
    const missing = extractMissingRequiredFields(
      new Error('The formula for filtering records is invalid: Unknown field names: taskboard task id, status'),
    );

    expect(missing.map((field) => field.name)).toEqual(["TaskBoard Task ID", "Status"]);
  });
});
