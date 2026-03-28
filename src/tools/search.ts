import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraIssue, ToolResult } from '../types.js';

const searchSchema = z.object({
  jql: z.string().min(1, 'jql query is required'),
  startAt: z.number().int().min(0).default(0).describe('Pagination offset'),
  maxResults: z.number().int().min(1).max(100).default(20).describe('Max results (1-100)'),
  fields: z
    .array(z.string())
    .optional()
    .describe('Fields to return. Defaults to key, summary, status, assignee.'),
});

interface JqlSearchResult {
  issues: JiraIssue[];
  isLast: boolean;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createSearchTools(client: JiraClient) {
  return {
    jira_search: {
      description:
        'Search Jira issues using JQL (Jira Query Language). Supports pagination via startAt and maxResults.',
      inputSchema: searchSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = searchSchema.parse(args);
        const fields = parsed.fields?.join(',') || 'summary,status,assignee,issuetype,priority';

        const params = new URLSearchParams({
          jql: parsed.jql,
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
          fields,
        });

        const res = await client.get<JqlSearchResult>(
          `/rest/api/3/search/jql?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const data = res.data!;
        if (data.issues.length === 0) {
          return textResult(`No issues found for JQL: ${parsed.jql}`);
        }

        const lines = data.issues.map((issue) => {
          const status = (issue.fields?.status as Record<string, unknown>)?.name ?? 'Unknown';
          const assignee =
            (issue.fields?.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned';
          return `- **${issue.key}**: ${issue.fields?.summary ?? 'No summary'} [${status}] (${assignee})`;
        });

        const more = data.isLast ? '' : ' (more results available — increase startAt)';
        const header = `Found ${data.issues.length} issue(s)${more}:`;
        return textResult(`${header}\n\n${lines.join('\n')}`);
      },
    },
  };
}
