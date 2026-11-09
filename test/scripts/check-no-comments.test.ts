import { describe, expect, it } from "vitest";
import { findComments, isCheckedPath } from "../../scripts/check-no-comments.mjs";

const slash = "/";
const lineComment = `${slash}${slash} note`;
const blockComment = `${slash}* note *${slash}`;

describe("check-no-comments", () => {
  it("flags line and block comments", () => {
    const source = `const a = 1; ${lineComment}\nconst b = ${blockComment} 2;\n`;
    expect(findComments("x.ts", source).map((c: { line: number }) => c.line)).toEqual([1, 2]);
  });

  it("flags a comment before a closing token and at end of file", () => {
    const source = `call(${blockComment});\n${lineComment}`;
    expect(findComments("x.mjs", source)).toHaveLength(2);
  });

  it("ignores slashes inside strings, URLs, templates, and regexes", () => {
    const source = [
      `const url = "https:${slash}${slash}example.com";`,
      `const t = \`a ${slash}${slash} \${url} ${slash}* b *${slash}\`;`,
      `const re = ${slash}\\${slash}\\${slash}x${slash}g;`,
      `const ratio = 4 ${slash} 2;`,
    ].join("\n");
    expect(findComments("x.ts", source)).toEqual([]);
  });

  it("scopes to source files outside generated and vendored directories", () => {
    expect(isCheckedPath("agent/tools/list_cellar.ts")).toBe(true);
    expect(isCheckedPath("scripts/smoke-mcp.mjs")).toBe(true);
    expect(isCheckedPath("convex/_generated/api.d.ts")).toBe(false);
    expect(isCheckedPath("node_modules/x/index.js")).toBe(false);
    expect(isCheckedPath(".eve/compile/module-map.mjs")).toBe(false);
    expect(isCheckedPath("README.md")).toBe(false);
  });
});
