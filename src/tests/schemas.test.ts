import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/schemas/auth";
import { createTaskCommentSchema, createTaskSchema, updateTaskSchema } from "@/schemas/task";

describe("auth schemas", () => {
  it("accepts a well-formed register payload", () => {
    const result = registerSchema.safeParse({
      email: "x@y.com",
      password: "longenoughpassword",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = registerSchema.safeParse({
      email: "x@y.com",
      password: "short",
      name: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email on login", () => {
    const result = loginSchema.safeParse({ password: "anything" });
    expect(result.success).toBe(false);
  });
});

describe("task schemas", () => {
  it("accepts a minimal create task payload", () => {
    const result = createTaskSchema.safeParse({ title: "do the thing" });
    expect(result.success).toBe(true);
  });

  it("rejects empty titles", () => {
    const result = createTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a status update", () => {
    const result = updateTaskSchema.safeParse({ status: "done" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown statuses", () => {
    const result = updateTaskSchema.safeParse({ status: "blocked" });
    expect(result.success).toBe(false);
  });

  it("trims and accepts a valid comment body", () => {
    const result = createTaskCommentSchema.safeParse({ body: "  Looks good to me.  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("Looks good to me.");
    }
  });

  it("rejects a blank comment body", () => {
    const result = createTaskCommentSchema.safeParse({ body: "   " });
    expect(result.success).toBe(false);
  });
});
