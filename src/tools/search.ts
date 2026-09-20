import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraIssue, ToolResult } from '../types.js';

const searchSchema = z.object({
  jql: z.string().min(1, 'jql query is required'),
  nextPageToken: z
    .string()
    .optional()
    .describe(
      'Page token from a previous jira_search response. Omit for the first page. ' +
        'This endpoint uses token-based paging — there is no numeric offset.',
    ),
  maxResults: z.number().int().min(1).max(100).default(20).describe('Max results (1-100)'),
  fields: z
    .array(z.string())
    .optional()
    .describe('Fields to return. Defaults to key, summary, status, assignee, type, priority.'),
  includeTotal: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, also fetch an approximate total match count for the JQL. Costs an extra API call.',
    ),
});

interface JqlSearchResult {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createSearchTools(client: JiraClient) {
  return {
    jira_search: {
      description:
        'Search Jira issues using JQL (Jira Query Language). Returns matching issues by key, ' +
        'summary, status and assignee. Paginates with an opaque nextPageToken — pass the token ' +
        'from a previous response to fetch the next page. Set includeTotal for an approximate match count.',
      inputSchema: searchSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = searchSchema.parse(args);
        const fields = parsed.fields?.join(',') || 'summary,status,assignee,issuetype,priority';

        const params = new URLSearchParams({
          jql: parsed.jql,
          maxResults: String(parsed.maxResults),
          fields,
        });
        // GET /rest/api/3/search/jql uses token paging and silently ignores startAt.
        if (parsed.nextPageToken) {
          params.set('nextPageToken', parsed.nextPageToken);
        }

        const res = await client.get<JqlSearchResult>(`/rest/api/3/search/jql?${params.toString()}`);
        if (!res.ok) return textResult(res.error!, true);

        const data = res.data!;
        const issues = data.issues ?? [];

        let total: number | undefined;
        if (parsed.includeTotal) {
          const countRes = await client.post<{ count: number }>(
            '/rest/api/3/search/approximate-count',
            { jql: parsed.jql },
          );
          if (countRes.ok) total = countRes.data?.count;
        }

        if (issues.length === 0) {
          const suffix =
            total !== undefined && total > 0
              ? ` — but the count endpoint reports ~${total} matches, which suggests a permissions or scope problem rather than an empty result.`
              : '';
          return textResult(`No issues found for JQL: ${parsed.jql}${suffix}`);
        }

        const lines = issues.map((issue) => {
          const status = (issue.fields?.status as Record<string, unknown>)?.name ?? 'Unknown';
          const assignee =
            (issue.fields?.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned';
          return `- **${issue.key}**: ${issue.fields?.summary ?? 'No summary'} [${status}] (${assignee})`;
        });

        const countPart = total !== undefined ? ` of ~${total} total` : '';
        const header = `Found ${issues.length} issue(s)${countPart}:`;

        const more = data.nextPageToken
          ? `\n\nMore results available — call jira_search again with nextPageToken: "${data.nextPageToken}"`
          : '';

        return textResult(`${header}\n\n${lines.join('\n')}${more}`);
      },
    },
  };
}
