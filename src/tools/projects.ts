import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraProjectSearch, JiraProject, ToolResult } from '../types.js';

const listProjectsSchema = z.object({
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(20),
});

const getProjectSchema = z.object({
  projectKey: z.string().min(1, 'projectKey is required'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createProjectTools(client: JiraClient) {
  return {
    jira_list_projects: {
      description: 'List Jira projects the authenticated user has access to.',
      inputSchema: listProjectsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listProjectsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<JiraProjectSearch>(
          `/rest/api/3/project/search?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const data = res.data!;
        if (data.values.length === 0) {
          return textResult('No projects found.');
        }

        const lines = data.values.map(
          (p: JiraProject) => `- **${p.key}**: ${p.name} (${p.projectTypeKey})`,
        );
        const header = `${data.total} project(s) — showing ${data.startAt + 1}-${data.startAt + data.values.length}:`;
        return textResult(`${header}\n\n${lines.join('\n')}`);
      },
    },

    jira_get_project: {
      description: 'Get details for a specific Jira project by key.',
      inputSchema: getProjectSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = getProjectSchema.parse(args);
        const res = await client.get<JiraProject>(
          `/rest/api/3/project/${encodeURIComponent(parsed.projectKey)}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const p = res.data!;
        return textResult(
          [
            `**${p.key}**: ${p.name}`,
            `Type: ${p.projectTypeKey}`,
            `Style: ${p.style}`,
            `ID: ${p.id}`,
          ].join('\n'),
        );
      },
    },
  };
}
