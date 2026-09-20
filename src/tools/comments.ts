import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraCommentList, JiraComment, ToolResult } from '../types.js';
import { toAdf, fromAdf } from '../adf.js';

// Re-exported for backwards compatibility with pre-2.0 importers.
export { plainTextToAdf, extractTextFromAdf } from '../adf.js';

const formatIn = z
  .enum(['markdown', 'text', 'adf'])
  .optional()
  .default('markdown')
  .describe(
    'How to interpret the supplied body. "markdown" (default) supports headings, lists, ' +
      'tables, code blocks and emphasis. "text" treats it literally, auto-linking URLs only. ' +
      '"adf" takes a raw Atlassian Document Format JSON string.',
  );

const formatOut = z
  .enum(['markdown', 'text', 'adf'])
  .optional()
  .default('markdown')
  .describe(
    'How to render comment bodies. "markdown" (default) preserves structure. ' +
      '"text" flattens to plain text. "adf" returns raw ADF JSON.',
  );

const listCommentsSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(20),
  format: formatOut,
});

const addCommentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  body: z.string().min(1, 'comment body is required'),
  format: formatIn,
});

const updateCommentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  commentId: z.string().min(1, 'commentId is required'),
  body: z.string().min(1, 'comment body is required'),
  format: formatIn,
});

const deleteCommentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  commentId: z.string().min(1, 'commentId is required'),
  confirm: z.boolean().describe('Must be true to confirm deletion. This action is irreversible.'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function formatComment(c: JiraComment, format: 'markdown' | 'text' | 'adf'): string {
  return `**${c.author.displayName}** (${c.created}) — comment id \`${c.id}\`:\n${fromAdf(c.body, format)}`;
}

export function createCommentTools(client: JiraClient) {
  return {
    jira_list_comments: {
      description:
        'List comments on a Jira issue. Returns comment bodies, authors, timestamps and comment IDs. ' +
        'Bodies are rendered as Markdown by default, preserving headings, lists, tables and code blocks.',
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

        const formatted = data.comments.map((c) => formatComment(c, parsed.format));
        const header = `${data.total} comment(s) on ${parsed.issueKey} — showing ${data.startAt + 1}-${data.startAt + data.comments.length}:`;
        return textResult(`${header}\n\n${formatted.join('\n\n---\n\n')}`);
      },
    },

    jira_add_comment: {
      description:
        'Add a comment to a Jira issue. Accepts Markdown by default — headings, lists, tables, ' +
        'code blocks, links and emphasis are all preserved in Jira.',
      inputSchema: addCommentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = addCommentSchema.parse(args);
        const res = await client.post<JiraComment>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment`,
          { body: toAdf(parsed.body, parsed.format) },
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Comment added to **${parsed.issueKey}** (comment id: ${res.data!.id})`);
      },
    },

    jira_update_comment: {
      description:
        'Update an existing comment on a Jira issue. Accepts Markdown by default. ' +
        'Use jira_list_comments to find comment IDs.',
      inputSchema: updateCommentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = updateCommentSchema.parse(args);
        const res = await client.put<JiraComment>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment/${encodeURIComponent(parsed.commentId)}`,
          { body: toAdf(parsed.body, parsed.format) },
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Comment ${parsed.commentId} updated on **${parsed.issueKey}**.`);
      },
    },

    jira_delete_comment: {
      description:
        'Delete a comment from a Jira issue. Requires confirm: true as a safety guard. ' +
        'Use jira_list_comments to find comment IDs.',
      inputSchema: deleteCommentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = deleteCommentSchema.parse(args);
        if (!parsed.confirm) {
          return textResult(
            'Deletion aborted: you must pass confirm: true to delete a comment. This is a safety guard.',
            true,
          );
        }
        const res = await client.delete(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment/${encodeURIComponent(parsed.commentId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Comment ${parsed.commentId} deleted from **${parsed.issueKey}**.`);
      },
    },
  };
}
