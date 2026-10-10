import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("design tokens", () => {
  it("src/styles/tokens.css stays in sync with reference/tokens.css", () => {
    const norm = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    expect(norm("src/styles/tokens.css")).toBe(norm("reference/tokens.css"));
  });
});
