#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './auth.js';
import { enforceScope, getAvailableTools, TOOL_SPECS, unreachableToolsets } from './scopes.js';
import { DEFAULT_TOOLSETS, TOOLSETS, Toolset } from './scope-catalog.js';
import { JiraClient } from './client.js';
import { JiraConfig, ToolResult } from './types.js';
import { ProjectScope } from './project-scope.js';
import { createIssueTools } from './tools/issues.js';
import { createSearchTools } from './tools/search.js';
import { createCommentTools } from './tools/comments.js';
import { createProjectTools } from './tools/projects.js';
import { createUserTools } from './tools/users.js';
import { createLinkTools } from './tools/links.js';
import { createAttachmentTools } from './tools/attachments.js';
import { createFieldTools } from './tools/fields.js';
import { createWorklogTools } from './tools/worklogs.js';
import { createMetaTools } from './tools/meta.js';
import { createAgileTools } from './tools/agile.js';
import { createVersionTools } from './tools/versions.js';
import { createFilterTools } from './tools/filters.js';

/** Kept in step with package.json by `npm run check:version`. */
export const SERVER_VERSION = '2.0.0';

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

/**
 * Tell the model what exists but isn't loaded. Gating improves tool selection
 * but makes disabled capabilities invisible, so the instructions field names
 * them and says how to turn them on.
 */
export function buildInstructions(
  enabled: Toolset[],
  granted: string[],
  projectScope?: ProjectScope,
): string {
  const lines = [
    'Jira Cloud via scoped API tokens. Scopes are enforced by this server before any API call.',
    '',
    `Enabled toolsets: ${enabled.join(', ')}.`,
  ];

  const disabled = (Object.keys(TOOLSETS) as Toolset[]).filter((t) => !enabled.includes(t));
  if (disabled.length > 0) {
    lines.push(
      '',
      'Not loaded (set JIRA_TOOLSETS to enable, or "all"):',
      ...disabled.map((t) => `  - ${t}: ${TOOLSETS[t].description}`),
    );
  }

  const blocked = unreachableToolsets(granted).filter((t) => enabled.includes(t));
  if (blocked.length > 0) {
    lines.push(
      '',
      `Enabled but partly unreachable with the current scopes: ${blocked.join(', ')}. ` +
        'Some tools in these toolsets are hidden because JIRA_SCOPES does not grant what they need.',
    );
  }

  if (projectScope?.isActive) {
    lines.push(
      '',
      `Restricted to projects: ${projectScope.projects.join(', ')}. ` +
        'Requests naming any other project are refused before the API is called, ' +
        'and JQL searches are constrained to these projects automatically.',
    );
  }

  lines.push(
    '',
    'Notes: jira_search paginates with an opaque nextPageToken, not a numeric offset. ' +
      'Content tools accept and return Markdown by default; pass format: "adf" for raw ADF. ' +
      'On update, omitting a field leaves it untouched while passing null clears it.',
  );

  return lines.join('\n');
}

/**
 * Apply the project allowlist to a tool's arguments before it runs. Doing it
 * here rather than in each tool means a new tool cannot forget to enforce it:
 * anything taking issueKey, projectKey or jql is covered automatically.
 */
export function applyProjectScope(
  scope: ProjectScope,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!scope.isActive) return args;

  const out = { ...args };

  for (const key of ['issueKey', 'inwardIssueKey', 'outwardIssueKey']) {
    const value = out[key];
    if (typeof value === 'string' && value !== '') scope.assertIssueKey(value);
  }

  if (typeof out.projectKey === 'string' && out.projectKey !== '') {
    scope.assertProject(out.projectKey);
  }
  if (typeof out.projectKeyOrId === 'string' && out.projectKeyOrId !== '') {
    scope.assertProject(out.projectKeyOrId);
  }

  if (Array.isArray(out.issueKeys)) {
    for (const k of out.issueKeys) {
      if (typeof k === 'string') scope.assertIssueKey(k);
    }
  }

  if (typeof out.jql === 'string') {
    out.jql = scope.constrainJql(out.jql);
  }

  return out;
}

export function createServer(config: JiraConfig) {
  const client = new JiraClient(config);
  const projectScope = new ProjectScope(config.projects);
  const toolsets = config.toolsets ?? DEFAULT_TOOLSETS;
  const availableToolNames = getAvailableTools(config.scopes, toolsets);

  const allTools: Record<string, ToolEntry> = {
    ...createIssueTools(client),
    ...createSearchTools(client),
    ...createCommentTools(client),
    ...createProjectTools(client),
    ...createUserTools(client),
    ...createLinkTools(client),
    ...createAttachmentTools(client),
    ...createFieldTools(client),
    ...createWorklogTools(client),
    ...createMetaTools(client),
    ...createAgileTools(client),
    ...createVersionTools(client),
    ...createFilterTools(client),
  };

  const server = new McpServer(
    {
      name: 'mcp-jira-scoped',
      version: SERVER_VERSION,
      description: 'MCP server for Atlassian Jira with scoped API tokens',
    },
    { instructions: buildInstructions(toolsets, config.scopes, projectScope) },
  );

  // Deterministic ordering lets clients cache the tool list and improves
  // prompt-cache hit rates (MCP spec 2026-07-28).
  for (const [name, tool] of Object.entries(allTools).sort(([a], [b]) => a.localeCompare(b))) {
    if (!availableToolNames.includes(name)) continue;

    const shape = tool.inputSchema.shape;

    server.tool(name, tool.description, shape, async (args) => {
      try {
        enforceScope(name, config.scopes);
        const scoped = applyProjectScope(projectScope, args as Record<string, unknown>);
        const result = await tool.handler(scoped);
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
    });
  }

  return server;
}

/** Guards against a tool being implemented but never given a scope spec. */
export function unspecifiedTools(toolNames: string[]): string[] {
  return toolNames.filter((n) => !(n in TOOL_SPECS));
}

async function main() {
  const config = await loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when run as a binary, not when imported by tests.
if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
