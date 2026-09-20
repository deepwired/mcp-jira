import { z } from 'zod';
import { JiraClient } from '../client.js';
import { ToolResult } from '../types.js';

/**
 * Saved filters and labels.
 *
 * GET /rest/api/3/filter was removed from the v3 API — /filter/my and
 * /filter/search are the live routes.
 */

const listFiltersSchema = z.object({
  scope: z
    .enum(['my', 'all'])
    .optional()
    .default('my')
    .describe('"my" lists filters you own or favourite; "all" searches everything visible.'),
  query: z.string().optional().describe('Match against filter name and description, for scope "all".'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

const getFilterSchema = z.object({
  filterId: z.string().min(1, 'filterId is required'),
});

const listLabelsSchema = z.object({
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(1000).default(200),
  contains: z
    .string()
    .optional()
    .describe('Case-insensitive substring filter applied to the returned page.'),
});

interface Filter {
  id: string;
  name: string;
  jql?: string;
  description?: string;
  owner?: { displayName?: string };
  favourite?: boolean;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createFilterTools(client: JiraClient) {
  return {
    jira_list_filters: {
      description:
        'List saved Jira filters — your own and favourites by default, or search all visible ' +
        'filters. Returns each filter\'s ID and JQL so it can be run with jira_search.',
      inputSchema: listFiltersSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listFiltersSchema.parse(args);

        if (parsed.scope === 'my') {
          const res = await client.get<Filter[]>('/rest/api/3/filter/my?expand=jql');
          if (!res.ok) return textResult(res.error!, true);
          const filters = res.data ?? [];
          if (filters.length === 0) {
            return textResult('No filters owned or favourited by this account.');
          }
          return textResult(
            `${filters.length} filter(s):\n\n${filters.map(formatFilter).join('\n')}`,
          );
        }

        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
          expand: 'jql,owner',
        });
        if (parsed.query) params.set('filterName', parsed.query);

        const res = await client.get<{ values: Filter[]; total: number }>(
          `/rest/api/3/filter/search?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const filters = res.data?.values ?? [];
        if (filters.length === 0) {
          return textResult(
            parsed.query ? `No filters matching "${parsed.query}".` : 'No visible filters.',
          );
        }
        return textResult(
          `${res.data?.total ?? filters.length} filter(s):\n\n${filters.map(formatFilter).join('\n')}`,
        );
      },
    },

    jira_get_filter: {
      description:
        'Get one saved filter by ID, including its full JQL. Pass that JQL to jira_search to run it.',
      inputSchema: getFilterSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = getFilterSchema.parse(args);
        const res = await client.get<Filter>(
          `/rest/api/3/filter/${encodeURIComponent(parsed.filterId)}?expand=jql,owner,description`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const f = res.data!;
        return textResult(
          [
            `**${f.name}** (id: ${f.id})`,
            f.owner?.displayName ? `Owner: ${f.owner.displayName}` : null,
            f.description ? `Description: ${f.description}` : null,
            '',
            'JQL:',
            '```',
            f.jql ?? '(not returned)',
            '```',
          ]
            .filter((l) => l !== null)
            .join('\n'),
        );
      },
    },

    jira_list_labels: {
      description:
        'List labels defined across the Jira site. Use this to find the exact spelling of a ' +
        'label before filtering on it or setting it on an issue.',
      inputSchema: listLabelsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listLabelsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<{ values: string[]; total: number; isLast: boolean }>(
          `/rest/api/3/label?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        let labels = res.data?.values ?? [];
        if (parsed.contains) {
          const needle = parsed.contains.toLowerCase();
          labels = labels.filter((l) => l.toLowerCase().includes(needle));
        }

        if (labels.length === 0) {
          return textResult(
            parsed.contains
              ? `No labels on this page matching "${parsed.contains}". Note the filter applies to the current page only — increase maxResults or page with startAt.`
              : 'No labels found.',
          );
        }

        const more = res.data?.isLast === false ? ' (more available — increase startAt)' : '';
        return textResult(
          `${labels.length} label(s)${more}:\n\n${labels.map((l) => `- ${l}`).join('\n')}`,
        );
      },
    },
  };
}

function formatFilter(f: Filter): string {
  const fav = f.favourite ? ' ⭐' : '';
  const owner = f.owner?.displayName ? ` — ${f.owner.displayName}` : '';
  const jql = f.jql ? `\n  JQL: \`${f.jql}\`` : '';
  return `- **${f.name}** (id: ${f.id})${fav}${owner}${jql}`;
}
