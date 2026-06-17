import Airtable from "airtable";
import type {
  AirtableCreateInput,
  AirtableMockClient,
} from "@/lib/airtable-mock";
import type { AirtableExportFailure, AirtableExportResult, TaskStatus } from "@/types";

const TASK_ID_FIELD = "TaskBoard Task ID";
const AIRTABLE_API_ROOT = "https://api.airtable.com/v0";

export type ExportProjectTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string; email: string } | null;
};

export type ExportProject = {
  id: string;
  name: string;
};

type AirtableTaskFields = {
  "TaskBoard Task ID": string;
  "Project ID": string;
  "Project Name": string;
  Title: string;
  Description: string;
  Status: string;
  Position: number;
  Assignee: string;
  "Created At": string;
  "Updated At": string;
};

export type ExportTaskInput = {
  project: ExportProject;
  task: ExportProjectTask;
};

export type UpsertOutcome = "created" | "updated";

export interface AirtableExportClient {
  upsertTask(input: ExportTaskInput): Promise<UpsertOutcome>;
}

type AirtableFieldDefinition = {
  name: keyof AirtableTaskFields;
  type: "singleLineText" | "number";
  options?: Record<string, unknown>;
};

type AirtableTableInfo = {
  id: string;
  name: string;
  fields: Array<{ id: string; name: string; type: string }>;
};

interface AirtableMetadataClient {
  getTable(): Promise<AirtableTableInfo>;
  createField(field: AirtableFieldDefinition): Promise<void>;
}

const REQUIRED_FIELDS: AirtableFieldDefinition[] = [
  { name: "TaskBoard Task ID", type: "singleLineText" },
  { name: "Project ID", type: "singleLineText" },
  { name: "Project Name", type: "singleLineText" },
  { name: "Title", type: "singleLineText" },
  { name: "Description", type: "singleLineText" },
  { name: "Status", type: "singleLineText" },
  { name: "Position", type: "number", options: { precision: 0 } },
  { name: "Assignee", type: "singleLineText" },
  { name: "Created At", type: "singleLineText" },
  { name: "Updated At", type: "singleLineText" },
];

const REQUIRED_FIELDS_BY_NORMALIZED_NAME = new Map(
  REQUIRED_FIELDS.map((field) => [normalizeFieldName(field.name), field] as const),
);

class AirtableConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirtableConfigError";
  }
}

export function createAirtableExportClient(): AirtableExportClient {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!apiKey) throw new AirtableConfigError("AIRTABLE_API_KEY is not configured");
  if (!baseId) throw new AirtableConfigError("AIRTABLE_BASE_ID is not configured");
  if (!tableName) throw new AirtableConfigError("AIRTABLE_TABLE_NAME is not configured");

  const table = new Airtable({ apiKey, requestTimeout: 15_000 }).base(baseId)<AirtableTaskFields>(tableName);
  const metadataClient = createAirtableMetadataClient(apiKey, baseId, tableName);
  let schemaEnsured = false;

  return {
    async upsertTask(input) {
      if (!schemaEnsured) {
        await ensureRequiredFields(metadataClient);
        schemaEnsured = true;
      }

      const fields = toAirtableFields(input);
      try {
        return await upsertRealAirtableTask(table, input.task.id, fields);
      } catch (error) {
        const missingFields = extractMissingRequiredFields(error);
        if (missingFields.length === 0) throw error;

        await ensureRequiredFields(metadataClient, missingFields);
        return upsertRealAirtableTask(table, input.task.id, fields);
      }
    },
  };
}

export function createMockAirtableExportClient(client: AirtableMockClient): AirtableExportClient {
  return {
    async upsertTask(input) {
      const fields = toAirtableFields(input);
      const existing = await findMockAirtableRecord(client, input.task.id);

      if (existing) {
        await client.update(existing.id, fields);
        return "updated";
      }

      const createInput: AirtableCreateInput = {
        id: input.task.id,
        fields,
      };
      await client.create(createInput);
      return "created";
    },
  };
}

export async function exportProjectTasksToAirtable(
  project: ExportProject,
  tasks: ExportProjectTask[],
  client: AirtableExportClient = createAirtableExportClient(),
): Promise<AirtableExportResult> {
  const result: AirtableExportResult = {
    total: tasks.length,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  for (const task of tasks) {
    try {
      const outcome = await retryTransientFailures(() => client.upsertTask({ project, task }));
      if (outcome === "created") result.created += 1;
      else result.updated += 1;
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        taskId: task.id,
        taskTitle: task.title,
        message: getErrorMessage(error),
        permanent: isPermanentAirtableError(error),
      });
    }
  }

  return result;
}

function toAirtableFields(input: ExportTaskInput): AirtableTaskFields {
  return {
    [TASK_ID_FIELD]: input.task.id,
    "Project ID": input.project.id,
    "Project Name": input.project.name,
    Title: input.task.title,
    Description: input.task.description ?? "",
    Status: input.task.status,
    Position: input.task.position,
    Assignee: input.task.assignee?.name ?? "",
    "Created At": input.task.createdAt.toISOString(),
    "Updated At": input.task.updatedAt.toISOString(),
  };
}

async function findRealAirtableRecord(
  table: Airtable.Table<AirtableTaskFields>,
  taskId: string,
) {
  const records = await table.select({
    filterByFormula: `{${TASK_ID_FIELD}} = '${escapeFormulaValue(taskId)}'`,
    maxRecords: 1,
  }).all();
  return records[0] ?? null;
}

async function upsertRealAirtableTask(
  table: Airtable.Table<AirtableTaskFields>,
  taskId: string,
  fields: AirtableTaskFields,
): Promise<UpsertOutcome> {
  const existing = await findRealAirtableRecord(table, taskId);
  if (existing) {
    await table.update(existing.id, fields, { typecast: true });
    return "updated";
  }

  await table.create(fields, { typecast: true });
  return "created";
}

async function findMockAirtableRecord(client: AirtableMockClient, taskId: string) {
  const records = await client.list();
  return records.find((record) => record.fields[TASK_ID_FIELD] === taskId) ?? null;
}

function createAirtableMetadataClient(
  apiKey: string,
  baseId: string,
  tableReference: string,
): AirtableMetadataClient {
  let cachedTable: AirtableTableInfo | null = null;

  return {
    async getTable() {
      if (cachedTable) return cachedTable;

      const response = await fetch(`${AIRTABLE_API_ROOT}/meta/bases/${baseId}/tables`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw toMetadataError(response.status, body);
      }

      const tables = Array.isArray(body?.tables) ? body.tables as AirtableTableInfo[] : [];
      const table = tables.find((entry) => entry.id === tableReference || entry.name === tableReference);
      if (!table) {
        throw new AirtableConfigError(`Airtable table '${tableReference}' was not found in base ${baseId}`);
      }

      cachedTable = table;
      return table;
    },

    async createField(field) {
      const table = await this.getTable();
      const response = await fetch(`${AIRTABLE_API_ROOT}/meta/bases/${baseId}/tables/${table.id}/fields`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: field.name,
          type: field.type,
          options: field.options,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const error = toMetadataError(response.status, body);
        if (getErrorMessage(error).toLowerCase().includes("already exists")) {
          cachedTable = null;
          return;
        }
        throw error;
      }

      cachedTable = null;
      await this.getTable();
    },
  };
}

async function ensureRequiredFields(
  metadataClient: AirtableMetadataClient,
  specificFields: AirtableFieldDefinition[] = REQUIRED_FIELDS,
) {
  const table = await metadataClient.getTable();
  const existing = new Set(table.fields.map((field) => normalizeFieldName(field.name)));

  for (const field of specificFields) {
    if (existing.has(normalizeFieldName(field.name))) continue;
    await metadataClient.createField(field);
    existing.add(normalizeFieldName(field.name));
  }
}

async function retryTransientFailures<T>(work: () => Promise<T>): Promise<T> {
  const delays = [150, 300, 600];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt === delays.length || isPermanentAirtableError(error)) {
        break;
      }

      await wait(delays[attempt]);
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeFormulaValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function extractMissingRequiredFields(error: unknown): AirtableFieldDefinition[] {
  const message = getErrorMessage(error);
  const match = message.match(/Unknown field names?:\s*(.+)$/i) ?? message.match(/Unknown field name:\s*"([^"]+)"/i);
  if (!match) return [];

  const raw = match[1] ?? "";
  const names = raw
    .split(",")
    .map((part) => part.replace(/["']/g, "").trim())
    .filter(Boolean);

  return names
    .map((name) => REQUIRED_FIELDS_BY_NORMALIZED_NAME.get(normalizeFieldName(name)))
    .filter((field): field is AirtableFieldDefinition => Boolean(field));
}

function isPermanentAirtableError(error: unknown) {
  const statusCode = getStatusCode(error);
  if (statusCode === 429) return false;
  if (statusCode === 0) return false;
  if (statusCode >= 500) return false;
  if (statusCode >= 400) return true;

  if (error instanceof AirtableConfigError) return true;

  const code = getErrorCode(error);
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN" || code === "ENOTFOUND" || code === "EACCES") {
    return false;
  }

  const message = getErrorMessage(error).toLowerCase();
  if (message.includes("timeout") || message.includes("network")) return false;
  return true;
}

function getStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return -1;
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;
  return -1;
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("errno" in error && typeof error.errno === "string") return error.errno;
  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  if (error && typeof error === "object" && "error" in error && typeof error.error === "string" && error.error) {
    return error.error;
  }
  const code = getErrorCode(error);
  if (code) return `airtable request failed (${code})`;
  return "unknown export error";
}

function normalizeFieldName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function toMetadataError(statusCode: number, body: unknown) {
  const message = body && typeof body === "object" && "error" in body
    ? typeof body.error === "object" && body.error && "message" in body.error && typeof body.error.message === "string"
      ? body.error.message
      : typeof body.error === "string"
        ? body.error
        : `Airtable metadata request failed (${statusCode})`
    : `Airtable metadata request failed (${statusCode})`;

  const type = body && typeof body === "object" && "error" in body
    ? typeof body.error === "object" && body.error && "type" in body.error && typeof body.error.type === "string"
      ? body.error.type
      : "METADATA_ERROR"
    : "METADATA_ERROR";

  return Object.assign(new Error(message), { statusCode, error: type });
}

export {
  AirtableConfigError,
  TASK_ID_FIELD,
  extractMissingRequiredFields,
};
