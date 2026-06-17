"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiTask, ApiProjectMember, Role, TaskStatus } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  currentUserRole: Role | null;
  members: ApiProjectMember[];
  onClose: () => void;
};

function formatCommentTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function TaskDetail({ task, projectId, currentUserRole, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? "");
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const canPostComments = currentUserRole === "admin" || currentUserRole === "member";

  const updateTask = useMutation({
    mutationFn: (input: Partial<ApiTask>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "delete failed"),
  });

  const createComment = useMutation({
    mutationFn: (input: { body: string }) =>
      apiFetch<{ comment: ApiTask["comments"][number] }>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => setCommentError(err instanceof Error ? err.message : "comment failed"),
  });

  function onSave() {
    setError(null);
    updateTask.mutate({
      title,
      description,
      status,
      assigneeId: assigneeId || null,
    });
  }

  function onCommentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setCommentError(null);
    createComment.mutate({ body: trimmed });
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">edit task</h2>
          <button onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => deleteTask.mutate()}
            disabled={deleteTask.isPending}
            className="text-sm text-red-400 hover:text-red-300"
          >
            delete task
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
            >
              cancel
            </button>
            <button
              onClick={onSave}
              disabled={updateTask.isPending}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateTask.isPending ? "saving…" : "save"}
            </button>
          </div>
        </div>

        <section className="mt-6 border-t border-border pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">comments</h3>
            <span className="text-xs text-muted">
              {task.comments.length} {task.comments.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          <div className="space-y-3">
            {task.comments.length === 0 && (
              <p className="text-sm text-muted">no comments yet.</p>
            )}

            {task.comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-md border border-border bg-bg px-3 py-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{comment.author.name}</p>
                  <time
                    className="text-xs text-muted"
                    dateTime={comment.createdAt}
                  >
                    {formatCommentTimestamp(comment.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-100">{comment.body}</p>
              </article>
            ))}
          </div>

          {canPostComments ? (
            <form onSubmit={onCommentSubmit} className="mt-4">
              <label className="block">
                <span className="text-xs text-muted">add comment</span>
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  placeholder="share context, decisions, or blockers"
                  className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              {commentError && (
                <p className="mt-2 text-sm text-red-400" role="alert">
                  {commentError}
                </p>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={createComment.isPending || !commentBody.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {createComment.isPending ? "posting..." : "post comment"}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted">viewers can read comments but cannot post.</p>
          )}
        </section>
      </div>
    </div>
  );
}
