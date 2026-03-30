import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraCommentList, JiraComment, ToolResult } from '../types.js';

const listCommentsSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(20),
});

const addCommentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  body: z.string().min(1, 'comment body is required'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function plainTextToAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function formatComment(c: JiraComment): string {
  const bodyText =
    typeof c.body === 'string' ? c.body : extractTextFromAdf(c.body as Record<string, unknown>);
  return `**${c.author.displayName}** (${c.created}):\n${bodyText}`;
}

function extractTextFromAdf(node: Record<string, unknown>): string {
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  if (Array.isArray(node.content)) {
    return (node.content as Record<string, unknown>[]).map(extractTextFromAdf).join('');
  }
  return '';
}

export function createCommentTools(client: JiraClient) {
  return {
    jira_list_comments: {
      description:
        'List comments on a Jira issue. Returns comment bodies, authors, and timestamps.',
      inputSchema: listCommentsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listCommentsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<JiraCommentList>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const data = res.data!;
        if (data.comments.length === 0) {
          return textResult(`No comments on ${parsed.issueKey}.`);
        }

        const formatted = data.comments.map(formatComment);
        const header = `${data.total} comment(s) on ${parsed.issueKey} — showing ${data.startAt + 1}-${data.startAt + data.comments.length}:`;
        return textResult(`${header}\n\n${formatted.join('\n\n---\n\n')}`);
      },
    },

    jira_add_comment: {
      description:
        'Add a comment to a Jira issue. Accepts plain text (converted to ADF internally).',
      inputSchema: addCommentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = addCommentSchema.parse(args);
        const res = await client.post<JiraComment>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment`,
          { body: plainTextToAdf(parsed.body) },
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Comment added to **${parsed.issueKey}** (comment id: ${res.data!.id})`);
      },
    },
  };
}
