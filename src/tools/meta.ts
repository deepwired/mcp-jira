import { z } from 'zod';
import { JiraClient } from '../client.js';
import { ToolResult } from '../types.js';

const createMetaSchema = z.object({
  projectKey: z.string().min(1, 'projectKey is required'),
  issueTypeId: z
    .string()
    .optional()
    .describe(
      'Issue type ID. Omit to list the available issue types for the project; ' +
        'supply it to get the fields required to create that type.',
    ),
  requiredOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe('When true (default), return only required fields. Set false for all fields.'),
});

const changelogSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
  field: z
    .string()
    .optional()
    .describe('Only show changes to this field, e.g. "status" or "assignee".'),
});

interface IssueTypeMeta {
  id: string;
  name: string;
  description?: string;
  subtask?: boolean;
}

interface FieldMeta {
  required: boolean;
  name: string;
  fieldId?: string;
  hasDefaultValue?: boolean;
  allowedValues?: Array<Record<string, unknown>>;
  schema?: { type?: string; custom?: string };
}

interface ChangelogEntry {
  id: string;
  created: string;
  author?: { displayName?: string };
  items?: Array<{ field: string; fromString?: string | null; toString?: string | null }>;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createMetaTools(client: JiraClient) {
  return {
    jira_get_create_meta: {
      description:
        'Discover what is needed to create an issue in a project. Without issueTypeId, lists the ' +
        'available issue types. With it, lists the fields required to create that type, including ' +
        'allowed values for select fields. Call this before jira_create_issue when a project has ' +
        'required custom fields, otherwise creation fails on fields you cannot see.',
      inputSchema: createMetaSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = createMetaSchema.parse(args);
        const project = encodeURIComponent(parsed.projectKey);

        if (!parsed.issueTypeId) {
          const res = await client.get<{ issueTypes: IssueTypeMeta[] }>(
            `/rest/api/3/issue/createmeta/${project}/issuetypes`,
          );
          if (!res.ok) return textResult(res.error!, true);

          const types = res.data?.issueTypes ?? [];
          if (types.length === 0) {
            return textResult(
              `No creatable issue types returned for ${parsed.projectKey}. The request ` +
                'authenticated, so this may be a project-permission problem rather than an empty project.',
            );
          }
          const lines = types.map(
            (t) => `- **${t.name}** (id: \`${t.id}\`)${t.subtask ? ' _[subtask]_' : ''}`,
          );
          return textResult(
            `Issue types creatable in **${parsed.projectKey}**:\n\n${lines.join('\n')}\n\n` +
              'Call again with issueTypeId to see the fields required for one of these.',
          );
        }

        const params = new URLSearchParams({ maxResults: '200' });
        const res = await client.get<{ fields: FieldMeta[] }>(
          `/rest/api/3/issue/createmeta/${project}/issuetypes/${encodeURIComponent(parsed.issueTypeId)}?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const all = res.data?.fields ?? [];
        const fields = parsed.requiredOnly ? all.filter((f) => f.required) : all;
        if (fields.length === 0) {
          return textResult(
            parsed.requiredOnly
              ? `No required fields beyond the defaults for issue type ${parsed.issueTypeId} in ${parsed.projectKey}.`
              : `No fields returned for issue type ${parsed.issueTypeId} in ${parsed.projectKey}.`,
          );
        }

        const lines: string[] = [];
        for (const f of fields) {
          const id = f.fieldId ?? 'unknown';
          const req = f.required ? '**required**' : 'optional';
          const type = f.schema?.type ?? 'unknown';
          lines.push(`- \`${id}\` — ${f.name} (${req}, type: ${type})`);
          if (f.allowedValues && f.allowedValues.length > 0) {
            const vals = f.allowedValues
              .slice(0, 15)
              .map((v) => v.name ?? v.value ?? v.id ?? JSON.stringify(v))
              .join(', ');
            const more = f.allowedValues.length > 15 ? `, …(+${f.allowedValues.length - 15})` : '';
            lines.push(`  Allowed: ${vals}${more}`);
          }
        }

        return textResult(
          `# Fields for issue type \`${parsed.issueTypeId}\` in **${parsed.projectKey}**\n` +
            `_Showing ${parsed.requiredOnly ? 'required fields only' : 'all fields'} (${fields.length} of ${all.length})._\n\n` +
            lines.join('\n'),
        );
      },
    },

    jira_get_changelog: {
      description:
        'Get the change history of a Jira issue — who changed which field, from what to what, and when. ' +
        'Optionally filter to a single field such as "status" to trace a workflow.',
      inputSchema: changelogSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = changelogSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<{ values: ChangelogEntry[]; total: number }>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/changelog?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const entries = res.data?.values ?? [];
        const filter = parsed.field?.toLowerCase();

        const lines: string[] = [];
        for (const entry of entries) {
          const items = (entry.items ?? []).filter(
            (i) => !filter || i.field.toLowerCase() === filter,
          );
          if (items.length === 0) continue;
          const who = entry.author?.displayName ?? 'Unknown';
          lines.push(`**${entry.created}** — ${who}`);
          for (const i of items) {
            lines.push(`  - ${i.field}: ${i.fromString ?? '(none)'} → ${i.toString ?? '(none)'}`);
          }
        }

        if (lines.length === 0) {
          return textResult(
            filter
              ? `No changes to "${parsed.field}" found on ${parsed.issueKey}.`
              : `No change history on ${parsed.issueKey}.`,
          );
        }

        const scope = filter ? ` (field: ${parsed.field})` : '';
        return textResult(
          `Change history for **${parsed.issueKey}**${scope} — ${res.data?.total ?? entries.length} total entries:\n\n${lines.join('\n')}`,
        );
      },
    },
  };
}
