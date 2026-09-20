import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraIssue, ToolResult } from '../types.js';

const linkIssuesSchema = z.object({
  linkType: z.string().min(1, 'linkType is required (e.g. "Blocks", "Relates", "Work item split")'),
  inwardIssueKey: z.string().min(1, 'inwardIssueKey is required'),
  outwardIssueKey: z.string().min(1, 'outwardIssueKey is required'),
});

const listLinkTypesSchema = z.object({});

const removeLinkSchema = z.object({
  linkId: z
    .string()
    .min(1, 'linkId is required')
    .describe('Issue link ID. Find it via jira_get_issue with fields: ["issuelinks"].'),
  confirm: z.boolean().describe('Must be true to confirm removal.'),
});

const listRemoteLinksSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
});

const createRemoteLinkSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  url: z.string().url('url must be a valid absolute URL'),
  title: z.string().min(1, 'title is required'),
  summary: z.string().optional().describe('Optional longer description of the link.'),
  relationship: z
    .string()
    .optional()
    .describe('How the link relates, e.g. "causes", "documented by". Shown in the Jira UI.'),
});

const deleteRemoteLinkSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  linkId: z.string().min(1, 'linkId is required'),
  confirm: z.boolean().describe('Must be true to confirm deletion.'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

interface LinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

interface RemoteLink {
  id: number;
  relationship?: string;
  object: { url: string; title: string; summary?: string };
}

export function createLinkTools(client: JiraClient) {
  return {
    jira_link_issues: {
      description:
        'Link two Jira issues. Common link types: "Blocks", "Relates", "Work item split", "Cloners", "Duplicate". ' +
        'The inward issue gets the inward description (e.g. "is blocked by") and the outward issue gets the outward description (e.g. "blocks").',
      inputSchema: linkIssuesSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = linkIssuesSchema.parse(args);
        const res = await client.post('/rest/api/3/issueLink', {
          type: { name: parsed.linkType },
          inwardIssue: { key: parsed.inwardIssueKey },
          outwardIssue: { key: parsed.outwardIssueKey },
        });
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          `Linked **${parsed.inwardIssueKey}** ← ${parsed.linkType} → **${parsed.outwardIssueKey}**`,
        );
      },
    },

    jira_list_link_types: {
      description: 'List all available issue link types (e.g. Blocks, Relates, Cloners).',
      inputSchema: listLinkTypesSchema,
      handler: async (_args: Record<string, unknown>): Promise<ToolResult> => {
        const res = await client.get<{ issueLinkTypes: LinkType[] }>('/rest/api/3/issueLinkType');
        if (!res.ok) return textResult(res.error!, true);

        const types = res.data!.issueLinkTypes;
        const lines = types.map(
          (t) => `- **${t.name}** — inward: "${t.inward}", outward: "${t.outward}"`,
        );
        return textResult(`Available link types:\n\n${lines.join('\n')}`);
      },
    },

    jira_remove_link: {
      description:
        'Remove a link between two Jira issues. Requires confirm: true. ' +
        'Get link IDs from jira_get_issue with fields: ["issuelinks"].',
      inputSchema: removeLinkSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = removeLinkSchema.parse(args);
        if (!parsed.confirm) {
          return textResult(
            'Removal aborted: you must pass confirm: true to remove an issue link.',
            true,
          );
        }
        const res = await client.delete(
          `/rest/api/3/issueLink/${encodeURIComponent(parsed.linkId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Issue link ${parsed.linkId} removed.`);
      },
    },

    jira_list_remote_links: {
      description:
        'List remote links on a Jira issue — external URLs such as Confluence pages, pull requests ' +
        'or documents attached as links rather than as issue-to-issue relationships.',
      inputSchema: listRemoteLinksSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listRemoteLinksSchema.parse(args);
        const res = await client.get<RemoteLink[]>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/remotelink`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const links = res.data ?? [];
        if (links.length === 0) {
          return textResult(`No remote links on ${parsed.issueKey}.`);
        }

        const lines = links.map((l) => {
          const rel = l.relationship ? ` _(${l.relationship})_` : '';
          const summary = l.object.summary ? `\n  ${l.object.summary}` : '';
          return `- **${l.object.title}**${rel} — ${l.object.url} (id: ${l.id})${summary}`;
        });
        return textResult(
          `Remote links on **${parsed.issueKey}** (${links.length}):\n\n${lines.join('\n')}`,
        );
      },
    },

    jira_create_remote_link: {
      description:
        'Attach an external URL to a Jira issue as a remote link — a Confluence page, pull request, ' +
        'dashboard or document. Use this instead of pasting a URL into a comment when the link is a ' +
        'first-class relationship.',
      inputSchema: createRemoteLinkSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = createRemoteLinkSchema.parse(args);
        const body: Record<string, unknown> = {
          object: {
            url: parsed.url,
            title: parsed.title,
            ...(parsed.summary ? { summary: parsed.summary } : {}),
          },
        };
        if (parsed.relationship) body.relationship = parsed.relationship;

        const res = await client.post<{ id: number }>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/remotelink`,
          body,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          `Remote link "${parsed.title}" added to **${parsed.issueKey}** (id: ${res.data?.id ?? 'unknown'}).`,
        );
      },
    },

    jira_delete_remote_link: {
      description: 'Delete a remote link from a Jira issue. Requires confirm: true.',
      inputSchema: deleteRemoteLinkSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = deleteRemoteLinkSchema.parse(args);
        if (!parsed.confirm) {
          return textResult(
            'Deletion aborted: you must pass confirm: true to delete a remote link.',
            true,
          );
        }
        const res = await client.delete(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/remotelink/${encodeURIComponent(parsed.linkId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Remote link ${parsed.linkId} deleted from **${parsed.issueKey}**.`);
      },
    },
  };
}

export type { JiraIssue };
