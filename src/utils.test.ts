import { describe, expect, test } from "bun:test";
import { createTmuxSessionName, isProcessAlive, SSH_PORT } from "./utils.ts";

describe("createTmuxSessionName", () => {
  test("sanitizes directory names", () => {
    const name = createTmuxSessionName("/home/user/my project (1)");
    expect(name).toMatch(/^my-project--1--[a-f0-9]{6}$/);
  });

  test("generates unique suffixes", () => {
    const a = createTmuxSessionName("/tmp/test");
    const b = createTmuxSessionName("/tmp/test");
    expect(a).not.toBe(b);
  });

  test("uses folder basename only", () => {
    const name = createTmuxSessionName("/very/deep/nested/path");
    expect(name).toMatch(/^path-[a-f0-9]{6}$/);
  });
});

describe("SSH_PORT", () => {
  test("defaults to 2222", () => {
    expect(SSH_PORT).toBe(2222);
  });
});

describe("isProcessAlive", () => {
  test("returns true for current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  test("returns false for invalid PID", () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });
});
