import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"];
const IGNORED_PREFIXES = ["node_modules/", "convex/_generated/", ".eve/", ".output/", ".vercel/", ".convex/"];

const SCRIPT_KIND_BY_EXTENSION = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

function extensionOf(path) {
  const match = /\.[^./]+$/.exec(path);
  return match ? match[0] : "";
}

export function isCheckedPath(path) {
  return (
    SOURCE_EXTENSIONS.includes(extensionOf(path)) &&
    !IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(`/${prefix}`))
  );
}

export function findComments(path, text) {
  const kind = SCRIPT_KIND_BY_EXTENSION[extensionOf(path)] ?? ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map();
  const collect = (ranges) => {
    for (const range of ranges ?? []) {
      if (found.has(range.pos)) continue;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
      found.set(range.pos, { line: line + 1, column: character + 1, text: text.slice(range.pos, range.end) });
    }
  };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);
  return [...found.values()].sort((a, b) => a.line - b.line || a.column - b.column);
}

function candidateFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  });
  return output.split("\0").filter((path) => path.length > 0 && isCheckedPath(path));
}

function main() {
  const violations = [];
  const files = candidateFiles();
  for (const path of files) {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const comment of findComments(path, text)) violations.push({ path, ...comment });
  }
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.path}:${v.line}:${v.column} ${v.text.split("\n")[0].slice(0, 80)}`);
    }
    console.error(`check-no-comments: ${violations.length} comment(s) found in ${files.length} files`);
    process.exit(1);
  }
  console.log(`check-no-comments: ${files.length} files, 0 comments`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
