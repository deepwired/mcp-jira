#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './auth.js';
import { enforceScope, getAvailableTools } from './scopes.js';
import { JiraClient } from './client.js';
import { JiraConfig, ToolResult } from './types.js';
import { createIssueTools } from './tools/issues.js';
import { createSearchTools } from './tools/search.js';
import { createCommentTools } from './tools/comments.js';
import { createProjectTools } from './tools/projects.js';
import { createUserTools } from './tools/users.js';
import { createLinkTools } from './tools/links.js';

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

interface ToolEntry {
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export function createServer(config: JiraConfig) {
  const client = new JiraClient(config);
  const availableToolNames = getAvailableTools(config.scopes);

  const allTools: Record<string, ToolEntry> = {
    ...createIssueTools(client),
    ...createSearchTools(client),
    ...createCommentTools(client),
    ...createProjectTools(client),
    ...createUserTools(client),
    ...createLinkTools(client),
  };

  const server = new McpServer({
    name: 'mcp-jira-scoped',
    version: '1.0.0',
    description: 'MCP server for Atlassian Jira with scoped API tokens',
  });

  for (const [name, tool] of Object.entries(allTools)) {
    if (!availableToolNames.includes(name)) continue;

    const shape = tool.inputSchema.shape;

    server.tool(
      name,
      tool.description,
      shape,
      async (args) => {
        try {
          enforceScope(name, config.scopes);
          const result = await tool.handler(args as Record<string, unknown>);
          return {
            content: result.content,
            isError: result.isError,
          };
        } catch (err) {
          if (err instanceof z.ZodError) {
            const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
            return errorResult(`Validation error: ${messages}`);
          }
          if (err instanceof Error) {
            return errorResult(err.message);
          }
          return errorResult(String(err));
        }
      },
    );
  }

  return server;
}

async function main() {
  const config = await loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
