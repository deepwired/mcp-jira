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

const updateCommentSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  commentId: z.string().min(1, 'commentId is required'),
  body: z.string().min(1, 'comment body is required'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

// Regex for Jira wiki-style links: [label|url]
const WIKI_LINK_RE = /\[([^|\]]+)\|(https?:\/\/[^\]]+)\]/g;
// Regex for bare URLs (not already inside a wiki link)
const BARE_URL_RE = /(https?:\/\/[^\s)\]>]+)/g;

interface AdfTextNode {
  type: 'text';
  text: string;
  marks?: Array<{ type: string; attrs?: Record<string, string> }>;
}

/**
 * Parse a line of text into ADF inline nodes, converting:
 *  1. [label|url] wiki-markup links
 *  2. Bare https?:// URLs
 * into ADF text nodes with link marks.
 */
function parseInlineNodes(line: string): AdfTextNode[] {
  const nodes: AdfTextNode[] = [];

  // First pass: replace wiki links with placeholders so bare-URL regex doesn't match inside them
  const placeholders: Array<{ label: string; url: string }> = [];
  const PH_PREFIX = '<<WIKILINK_';
  const PH_SUFFIX = '>>';
  const phPattern = /<<WIKILINK_(\d+)>>/;

  const withPlaceholders = line.replace(WIKI_LINK_RE, (_match, label: string, url: string) => {
    const idx = placeholders.length;
    placeholders.push({ label, url });
    return `${PH_PREFIX}${idx}${PH_SUFFIX}`;
  });

  // Second pass: split on bare URLs
  const parts = withPlaceholders.split(BARE_URL_RE);

  for (const part of parts) {
    if (!part) continue;

    // Check if this part is a bare URL
    if (/^https?:\/\//.test(part)) {
      nodes.push({ type: 'text', text: part, marks: [{ type: 'link', attrs: { href: part } }] });
      continue;
    }

    // Check for wiki-link placeholders within this part
    const chunks = part.split(phPattern);
    for (let i = 0; i < chunks.length; i++) {
      if (i % 2 === 0) {
        // Plain text chunk
        if (chunks[i]) nodes.push({ type: 'text', text: chunks[i] });
      } else {
        // Wiki link placeholder index
        const ph = placeholders[parseInt(chunks[i], 10)];
        nodes.push({
          type: 'text',
          text: ph.label,
          marks: [{ type: 'link', attrs: { href: ph.url } }],
        });
      }
    }
  }

  return nodes;
}

export function plainTextToAdf(text: string) {
  const paragraphs = text.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content: line ? parseInlineNodes(line) : [{ type: 'text' as const, text: '' }],
  }));

  return {
    type: 'doc',
    version: 1,
    content: paragraphs,
  };
}

function formatComment(c: JiraComment): string {
  const bodyText =
    typeof c.body === 'string' ? c.body : extractTextFromAdf(c.body as Record<string, unknown>);
  return `**${c.author.displayName}** (${c.created}):\n${bodyText}`;
}

function extractTextFromAdf(node: Record<string, unknown>): string {
  if (node.type === 'text' && typeof node.text === 'string') {
    // Preserve link marks as [label|url] wiki-markup for round-trip fidelity
    const marks = node.marks as Array<{ type: string; attrs?: Record<string, string> }> | undefined;
    const linkMark = marks?.find((m) => m.type === 'link');
    if (linkMark?.attrs?.href) {
      const href = linkMark.attrs.href;
      // If the display text is the URL itself, emit it as a bare URL (plainTextToAdf will auto-link it)
      if (node.text === href) return href;
      return `[${node.text}|${href}]`;
    }
    return node.text;
  }
  if (Array.isArray(node.content)) {
    const children = node.content as Record<string, unknown>[];
    // Block-level nodes (paragraphs, etc.) should be separated by newlines
    const hasBlocks = children.some(
      (c) => c.type === 'paragraph' || c.type === 'bulletList' || c.type === 'orderedList',
    );
    return children.map(extractTextFromAdf).join(hasBlocks ? '\n' : '');
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
        'Add a comment to a Jira issue. Accepts plain text (converted to ADF internally). URLs are auto-linked; use [label|url] for named links.',
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

    jira_update_comment: {
      description:
        'Update an existing comment on a Jira issue. Accepts plain text (converted to ADF internally). URLs are auto-linked; use [label|url] for named links.',
      inputSchema: updateCommentSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = updateCommentSchema.parse(args);
        const res = await client.put<JiraComment>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/comment/${encodeURIComponent(parsed.commentId)}`,
          { body: plainTextToAdf(parsed.body) },
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          `Comment ${parsed.commentId} updated on **${parsed.issueKey}**.`,
        );
      },
    },
  };
}
