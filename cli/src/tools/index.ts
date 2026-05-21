import type { Config } from "../config.js";
import {
  fsToolDefinitions,
  readFile,
  writeFile,
  editFile,
  listDirectory,
  globFiles,
  type ToolDefinition,
} from "./fs.js";
import { bashToolDefinition, executeBash } from "./bash.js";
import { searchToolDefinition, webSearch } from "./search.js";

export type { ToolDefinition };

export function getToolDefinitions(config: Config): ToolDefinition[] {
  const tools = [...fsToolDefinitions, bashToolDefinition];
  if (config.tavilyApiKey) {
    tools.push(searchToolDefinition);
  }
  return tools;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  config: Config
): Promise<string> {
  switch (name) {
    case "read_file": {
      const path = input.path;
      if (!path || typeof path !== "string") return "Error: read_file requires a 'path' string";
      return await readFile(path, input.start_line as number | undefined, input.end_line as number | undefined);
    }

    case "write_file": {
      const path = input.path;
      if (!path || typeof path !== "string") return "Error: write_file requires a 'path' string";
      if (input.content === undefined || input.content === null) return "Error: write_file requires a 'content' string";
      return writeFile(path, String(input.content));
    }

    case "edit_file": {
      const path = input.path;
      if (!path || typeof path !== "string") return "Error: edit_file requires a 'path' string";
      if (input.old_string === undefined) return "Error: edit_file requires an 'old_string'";
      if (input.new_string === undefined) return "Error: edit_file requires a 'new_string'";
      return editFile(path, String(input.old_string), String(input.new_string));
    }

    case "list_directory":
      return listDirectory(
        (input.path as string | undefined) ?? ".",
        (input.depth as number | undefined) ?? 2
      );

    case "glob":
      return await globFiles(
        input.pattern as string,
        input.cwd as string | undefined
      );

    case "bash": {
      const command = input.command;
      if (!command || typeof command !== "string") return "Error: bash requires a 'command' string";
      return executeBash(command, (input.timeout as number | undefined) ?? 30000);
    }

    case "web_search": {
      const query = input.query;
      if (!query || typeof query !== "string") return "Error: web_search requires a 'query' string";
      return await webSearch(query, config.tavilyApiKey ?? "", (input.max_results as number | undefined) ?? 5);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
