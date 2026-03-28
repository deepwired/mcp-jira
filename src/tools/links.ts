import { z } from 'zod';
import { JiraClient } from '../client.js';
import { ToolResult } from '../types.js';

const linkIssuesSchema = z.object({
  linkType: z.string().min(1, 'linkType is required (e.g. "Blocks", "Relates", "Work item split")'),
  inwardIssueKey: z.string().min(1, 'inwardIssueKey is required'),
  outwardIssueKey: z.string().min(1, 'outwardIssueKey is required'),
});

const listLinkTypesSchema = z.object({});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

interface LinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
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
        const res = await client.get<{ issueLinkTypes: LinkType[] }>(
          '/rest/api/3/issueLinkType',
        );
        if (!res.ok) return textResult(res.error!, true);

        const types = res.data!.issueLinkTypes;
        const lines = types.map(
          (t) => `- **${t.name}** — inward: "${t.inward}", outward: "${t.outward}"`,
        );
        return textResult(`Available link types:\n\n${lines.join('\n')}`);
      },
    },
  };
}
