import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectExportButton } from "@/components/ProjectExportButton";

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

describe("<ProjectExportButton />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for viewers", () => {
    renderWithClient(<ProjectExportButton projectId="project-1" currentUserRole="viewer" />);

    expect(screen.queryByRole("button", { name: "Export to Airtable" })).not.toBeInTheDocument();
  });

  it("calls the export endpoint and shows a success summary", async () => {
    mockApiFetch.mockResolvedValueOnce({
      result: {
        total: 4,
        created: 2,
        updated: 2,
        failed: 0,
        failures: [],
      },
    });

    renderWithClient(<ProjectExportButton projectId="project-1" currentUserRole="member" />);

    fireEvent.click(screen.getByRole("button", { name: "Export to Airtable" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith("/api/projects/project-1/export-airtable", {
        method: "POST",
      });
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported 4 tasks: 2 created, 2 updated, 0 failed",
    );
  });

  it("shows partial failure details", async () => {
    mockApiFetch.mockResolvedValueOnce({
      result: {
        total: 3,
        created: 1,
        updated: 1,
        failed: 1,
        failures: [
          {
            taskId: "task-2",
            taskTitle: "Draft press release",
            message: "invalid_request_unknown",
            permanent: true,
          },
        ],
      },
    });

    renderWithClient(<ProjectExportButton projectId="project-1" currentUserRole="admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Export to Airtable" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported 3 tasks: 1 created, 1 updated, 1 failed. First failure: Draft press release (invalid_request_unknown)",
    );
  });
});
