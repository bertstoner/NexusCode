import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from "fs";
import { join, resolve, relative, dirname } from "path";
import { glob } from "fast-glob";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const fsToolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file at the given path. Returns the file contents as a string. Use this when you need to examine existing code or files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to read (relative to current directory or absolute)",
        },
        start_line: {
          type: "number",
          description: "Optional: 1-indexed line to start reading from",
        },
        end_line: {
          type: "number",
          description: "Optional: 1-indexed line to stop reading at (inclusive)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file, creating it (and any parent directories) if it doesn't exist. Use this to create new files or completely overwrite existing ones.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to write (relative to current directory or absolute)",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Make targeted edits to an existing file by replacing specific text. The old_string must match exactly (including whitespace). Use this for precise edits without rewriting the whole file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to edit",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace. Must be unique in the file.",
        },
        new_string: {
          type: "string",
          description: "The string to replace the old_string with",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_directory",
    description:
      "List the files and directories in a given path. Returns a tree-style listing.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory path to list (defaults to current directory)",
        },
        depth: {
          type: "number",
          description: "How many levels deep to list (default: 2, max: 5)",
        },
      },
      required: [],
    },
  },
  {
    name: "glob",
    description:
      "Find files matching a glob pattern. Useful for discovering project structure or finding files by name.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")',
        },
        cwd: {
          type: "string",
          description: "Base directory for the search (defaults to current directory)",
        },
      },
      required: ["pattern"],
    },
  },
];

export async function readFile(
  path: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${path}`);
  }
  const content = readFileSync(resolved, "utf-8");
  if (startLine !== undefined || endLine !== undefined) {
    const lines = content.split("\n");
    const start = (startLine ?? 1) - 1;
    const end = endLine ?? lines.length;
    const slice = lines.slice(start, end);
    return slice
      .map((l, i) => `${String(start + i + 1).padStart(6)}→${l}`)
      .join("\n");
  }
  const lines = content.split("\n");
  if (lines.length > 500) {
    const preview = lines.slice(0, 500);
    return (
      preview.map((l, i) => `${String(i + 1).padStart(6)}→${l}`).join("\n") +
      `\n… (${lines.length - 500} more lines, use start_line/end_line to read more)`
    );
  }
  return lines.map((l, i) => `${String(i + 1).padStart(6)}→${l}`).join("\n");
}

export function writeFile(path: string, content: string): string {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, "utf-8");
  const lines = content.split("\n").length;
  return `Wrote ${lines} lines to ${path}`;
}

export function editFile(
  path: string,
  oldString: string,
  newString: string
): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${path}`);
  }
  const content = readFileSync(resolved, "utf-8");
  if (!content.includes(oldString)) {
    throw new Error(
      `old_string not found in ${path}. Make sure it matches exactly.`
    );
  }
  const occurrences = content.split(oldString).length - 1;
  if (occurrences > 1) {
    throw new Error(
      `old_string appears ${occurrences} times in ${path}. Provide more context to make it unique.`
    );
  }
  const updated = content.replace(oldString, newString);
  writeFileSync(resolved, updated, "utf-8");
  return `Edited ${path}: replaced the matched block`;
}

export function listDirectory(
  dirPath: string = ".",
  depth: number = 2
): string {
  const resolved = resolve(dirPath);
  if (!existsSync(resolved)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
  const lines: string[] = [];
  function walk(dir: string, prefix: string, currentDepth: number) {
    if (currentDepth > Math.min(depth, 5)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir).filter(
        (e) =>
          !e.startsWith(".git") &&
          e !== "node_modules" &&
          e !== "dist" &&
          e !== ".next"
      );
    } catch {
      return;
    }
    entries.sort((a, b) => {
      const aIsDir = statSync(join(dir, a)).isDirectory();
      const bIsDir = statSync(join(dir, b)).isDirectory();
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const fullPath = join(dir, entry);
      const isDir = statSync(fullPath).isDirectory();
      const connector = isLast ? "└── " : "├── ";
      lines.push(prefix + connector + entry + (isDir ? "/" : ""));
      if (isDir) {
        walk(fullPath, prefix + (isLast ? "    " : "│   "), currentDepth + 1);
      }
    }
  }
  lines.push(relative(process.cwd(), resolved) || ".");
  walk(resolved, "", 1);
  return lines.join("\n");
}

export async function globFiles(
  pattern: string,
  cwd?: string
): Promise<string> {
  const results = await glob(pattern, {
    cwd: cwd ? resolve(cwd) : process.cwd(),
    ignore: ["node_modules/**", ".git/**", "dist/**"],
    onlyFiles: false,
    dot: false,
  });
  if (results.length === 0) {
    return `No files matching: ${pattern}`;
  }
  return results.sort().join("\n");
}
