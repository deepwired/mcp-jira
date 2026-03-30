import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraField, ToolResult } from '../types.js';

const listFieldsSchema = z.object({
  customOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, only return custom fields (those with custom: true). Default: false (all fields).',
    ),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createFieldTools(client: JiraClient) {
  return {
    jira_list_fields: {
      description:
        'List all fields available in Jira, including custom fields. Use this to discover custom field IDs (e.g. customfield_10104) needed for jira_get_issue, jira_create_issue, and jira_update_issue.',
      inputSchema: listFieldsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listFieldsSchema.parse(args);
        const res = await client.get<JiraField[]>('/rest/api/3/field');
        if (!res.ok) return textResult(res.error!, true);

        const fields = parsed.customOnly ? res.data!.filter((f) => f.custom) : res.data!;

        if (fields.length === 0) {
          return textResult('No fields found.');
        }

        // Group: system fields first, then custom fields
        const system = fields.filter((f) => !f.custom);
        const custom = fields.filter((f) => f.custom);

        const lines: string[] = [];

        if (!parsed.customOnly && system.length > 0) {
          lines.push(`## System Fields (${system.length})`);
          for (const f of system.sort((a, b) => a.name.localeCompare(b.name))) {
            const type = f.schema?.type ?? 'unknown';
            lines.push(`- **${f.name}** \`${f.id}\` — type: ${type}`);
          }
        }

        if (custom.length > 0) {
          lines.push(`\n## Custom Fields (${custom.length})`);
          for (const f of custom.sort((a, b) => a.name.localeCompare(b.name))) {
            const type = f.schema?.type ?? 'unknown';
            const customType = f.schema?.custom ? ` (${f.schema.custom.split(':').pop()})` : '';
            lines.push(`- **${f.name}** \`${f.id}\` — type: ${type}${customType}`);
          }
        }

        const total = parsed.customOnly
          ? `${custom.length} custom fields`
          : `${fields.length} fields total (${system.length} system, ${custom.length} custom)`;

        return textResult(`# Jira Fields — ${total}\n\n${lines.join('\n')}`);
      },
    },
  };
}
