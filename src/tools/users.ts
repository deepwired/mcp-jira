import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraUser, ToolResult } from '../types.js';

const getUserSchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
});

const searchUsersSchema = z.object({
  query: z.string().min(1, 'search query is required'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(20),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function formatUser(u: JiraUser): string {
  return [
    `**${u.displayName}**`,
    `Account ID: ${u.accountId}`,
    u.emailAddress ? `Email: ${u.emailAddress}` : null,
    `Active: ${u.active}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function createUserTools(client: JiraClient) {
  return {
    jira_get_user: {
      description: 'Get Jira user info by account ID.',
      inputSchema: getUserSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = getUserSchema.parse(args);
        const res = await client.get<JiraUser>(
          `/rest/api/3/user?accountId=${encodeURIComponent(parsed.accountId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(formatUser(res.data!));
      },
    },

    jira_search_users: {
      description: 'Search Jira users by name or email. Useful for finding assignees.',
      inputSchema: searchUsersSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = searchUsersSchema.parse(args);
        const params = new URLSearchParams({
          query: parsed.query,
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<JiraUser[]>(
          `/rest/api/3/user/search?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const users = res.data!;
        if (users.length === 0) {
          return textResult(`No users found matching "${parsed.query}".`);
        }

        const lines = users.map(
          (u) =>
            `- **${u.displayName}** (${u.accountId})${u.emailAddress ? ` — ${u.emailAddress}` : ''}`,
        );
        return textResult(`Found ${users.length} user(s):\n\n${lines.join('\n')}`);
      },
    },
  };
}
