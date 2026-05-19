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
    case "read_file":
      return await readFile(
        input.path as string,
        input.start_line as number | undefined,
        input.end_line as number | undefined
      );

    case "write_file":
      return writeFile(input.path as string, input.content as string);

    case "edit_file":
      return editFile(
        input.path as string,
        input.old_string as string,
        input.new_string as string
      );

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

    case "bash":
      return executeBash(
        input.command as string,
        (input.timeout as number | undefined) ?? 30000
      );

    case "web_search":
      return await webSearch(
        input.query as string,
        config.tavilyApiKey ?? "",
        (input.max_results as number | undefined) ?? 5
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
