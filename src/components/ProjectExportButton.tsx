"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { AirtableExportResult, Role } from "@/types";

type Props = {
  projectId: string;
  currentUserRole: Role | null;
};

function summarize(result: AirtableExportResult) {
  return `Exported ${result.total} tasks: ${result.created} created, ${result.updated} updated, ${result.failed} failed`;
}

export function ProjectExportButton({ projectId, currentUserRole }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const canExport = currentUserRole === "admin" || currentUserRole === "member";

  const exportMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ result: AirtableExportResult }>(`/api/projects/${projectId}/export-airtable`, {
        method: "POST",
      }),
    onSuccess: ({ result }) => {
      const baseSummary = summarize(result);
      if (result.failed > 0) {
        const firstFailure = result.failures[0];
        const suffix = firstFailure ? ` First failure: ${firstFailure.taskTitle} (${firstFailure.message})` : "";
        setMessage(`${baseSummary}.${suffix}`);
        return;
      }

      setMessage(baseSummary);
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "export failed");
    },
  });

  if (!canExport) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          exportMutation.mutate();
        }}
        disabled={exportMutation.isPending}
        className="rounded-md border border-border bg-bg px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
      >
        {exportMutation.isPending ? "Exporting..." : "Export to Airtable"}
      </button>

      {message && (
        <p className="max-w-md text-right text-sm text-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
