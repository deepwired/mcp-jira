import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraIssue, ToolResult } from '../types.js';

const getIssueSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
  fields: z
    .array(z.string())
    .optional()
    .describe('Specific fields to return. Defaults to common fields.'),
  includeCustomFields: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, fetches all fields (including customfield_*) and appends them to the output.',
    ),
});

const createIssueSchema = z.object({
  projectKey: z.string().min(1, 'projectKey is required'),
  summary: z.string().min(1, 'summary is required'),
  issueType: z.string().default('Task').describe('Issue type: Task, Bug, Story, Epic, etc.'),
  description: z.string().optional().describe('Plain text description'),
  assigneeAccountId: z.string().optional(),
  priority: z.string().optional().describe('Priority name: Highest, High, Medium, Low, Lowest'),
  labels: z.array(z.string()).optional(),
  epicKey: z.string().optional().describe('Epic link (parent issue key)'),
  customFields: z
    .record(z.unknown())
    .optional()
    .describe('Custom fields as key-value pairs, e.g. {"customfield_10104": {"value": "Product"}}'),
});

const updateIssueSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  summary: z.string().optional(),
  description: z.string().optional(),
  assigneeAccountId: z.string().optional(),
  priority: z.string().optional(),
  labels: z.array(z.string()).optional(),
  customFields: z
    .record(z.unknown())
    .optional()
    .describe('Custom fields as key-value pairs, e.g. {"customfield_10016": 2}'),
});

const transitionIssueSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  transitionId: z
    .string()
    .optional()
    .describe('Transition ID. If omitted, lists available transitions.'),
  fields: z
    .record(z.unknown())
    .optional()
    .describe(
      'Fields required by the transition screen, e.g. {"resolution": {"name": "Fixed"}}. Use jira_get_transitions to discover required fields.',
    ),
  comment: z.string().optional().describe('Optional comment to add when transitioning.'),
});

const getTransitionsSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
});

const deleteIssueSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  confirm: z.boolean().describe('Must be true to confirm deletion. Safety guard.'),
});

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

const STANDARD_FIELDS = new Set([
  'summary',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'reporter',
  'description',
  'labels',
  'components',
  'comment',
  'attachment',
  'created',
  'updated',
  'parent',
  'subtasks',
  'fixVersions',
  'versions',
  'project',
  'watches',
  'votes',
  'resolutiondate',
  'resolution',
]);

function formatIssue(issue: JiraIssue, includeCustomFields = false): string {
  const f = issue.fields;
  const lines = [
    `**${issue.key}**: ${f.summary ?? 'No summary'}`,
    `Status: ${(f.status as Record<string, unknown>)?.name ?? 'Unknown'}`,
    `Type: ${(f.issuetype as Record<string, unknown>)?.name ?? 'Unknown'}`,
    `Priority: ${(f.priority as Record<string, unknown>)?.name ?? 'None'}`,
    `Assignee: ${(f.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned'}`,
    `Reporter: ${(f.reporter as Record<string, unknown>)?.displayName ?? 'Unknown'}`,
    `Labels: ${Array.isArray(f.labels) && f.labels.length > 0 ? (f.labels as string[]).join(', ') : 'None'}`,
  ];

  if (f.description) {
    lines.push(
      `\nDescription:\n${typeof f.description === 'string' ? f.description : JSON.stringify(f.description, null, 2)}`,
    );
  }

  if (includeCustomFields) {
    const customEntries = Object.entries(f).filter(
      ([key, val]) => !STANDARD_FIELDS.has(key) && val !== null && val !== undefined,
    );
    if (customEntries.length > 0) {
      lines.push('\n## Custom Fields');
      for (const [key, val] of customEntries) {
        const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
        lines.push(`${key}: ${display}`);
      }
    }
  }

  return lines.join('\n');
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

export function createIssueTools(client: JiraClient) {
  return {
    jira_get_issue: {
      description:
        'Get a Jira issue by key (e.g. PROJ-123). Returns summary, status, assignee, description, comments. Pass includeCustomFields: true to also return all custom fields.',
      inputSchema: getIssueSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = getIssueSchema.parse(args);
        let fields: string;
        if (parsed.fields && parsed.fields.length > 0) {
          fields = parsed.fields.join(',');
        } else if (parsed.includeCustomFields) {
          fields = '*all';
        } else {
          fields =
            'summary,status,issuetype,priority,assignee,reporter,description,labels,components,comment';
        }
        const res = await client.get<JiraIssue>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}?fields=${fields}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(formatIssue(res.data!, parsed.includeCustomFields));
      },
    },

    jira_create_issue: {
      description:
        'Create a new Jira issue. Requires project key, summary, and issue type. Optionally set description, assignee, priority, labels, epic link.',
      inputSchema: createIssueSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = createIssueSchema.parse(args);
        const fields: Record<string, unknown> = {
          project: { key: parsed.projectKey },
          summary: parsed.summary,
          issuetype: { name: parsed.issueType },
        };

        if (parsed.description) {
          fields.description = plainTextToAdf(parsed.description);
        }
        if (parsed.assigneeAccountId) {
          fields.assignee = { accountId: parsed.assigneeAccountId };
        }
        if (parsed.priority) {
          fields.priority = { name: parsed.priority };
        }
        if (parsed.labels) {
          fields.labels = parsed.labels;
        }
        if (parsed.epicKey) {
          fields.parent = { key: parsed.epicKey };
        }
        if (parsed.customFields) {
          Object.assign(fields, parsed.customFields);
        }

        const res = await client.post<JiraIssue>('/rest/api/3/issue', { fields });
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Issue created: **${res.data!.key}** (id: ${res.data!.id})`);
      },
    },

    jira_update_issue: {
      description:
        'Update fields on an existing Jira issue. Partial update — only specified fields are changed.',
      inputSchema: updateIssueSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = updateIssueSchema.parse(args);
        const fields: Record<string, unknown> = {};

        if (parsed.summary !== undefined) fields.summary = parsed.summary;
        if (parsed.description !== undefined) {
          fields.description = plainTextToAdf(parsed.description);
        }
        if (parsed.assigneeAccountId !== undefined) {
          fields.assignee = { accountId: parsed.assigneeAccountId };
        }
        if (parsed.priority !== undefined) fields.priority = { name: parsed.priority };
        if (parsed.labels !== undefined) fields.labels = parsed.labels;
        if (parsed.customFields) {
          Object.assign(fields, parsed.customFields);
        }

        if (Object.keys(fields).length === 0) {
          return textResult('No fields to update — provide at least one field.', true);
        }

        const res = await client.put(`/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}`, {
          fields,
        });
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Issue **${parsed.issueKey}** updated successfully.`);
      },
    },

    jira_transition_issue: {
      description:
        'Transition a Jira issue to a new status. If no transitionId is provided, lists available transitions. Pass fields to satisfy required transition screen fields (use jira_get_transitions to discover them).',
      inputSchema: transitionIssueSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = transitionIssueSchema.parse(args);
        const issueKey = encodeURIComponent(parsed.issueKey);

        if (!parsed.transitionId) {
          const res = await client.get<{
            transitions: Array<{ id: string; name: string; to: { name: string } }>;
          }>(`/rest/api/3/issue/${issueKey}/transitions`);
          if (!res.ok) return textResult(res.error!, true);
          const transitions = res.data!.transitions;
          if (transitions.length === 0) {
            return textResult('No transitions available for this issue.');
          }
          const lines = transitions.map((t) => `- **${t.name}** (id: ${t.id}) → ${t.to.name}`);
          return textResult(
            `Available transitions for ${parsed.issueKey}:\n${lines.join('\n')}\n\nTip: use jira_get_transitions to see required fields for each transition.`,
          );
        }

        const body: Record<string, unknown> = { transition: { id: parsed.transitionId } };
        if (parsed.fields && Object.keys(parsed.fields).length > 0) {
          body.fields = parsed.fields;
        }
        if (parsed.comment) {
          body.update = {
            comment: [{ add: { body: plainTextToAdf(parsed.comment) } }],
          };
        }

        const res = await client.post(`/rest/api/3/issue/${issueKey}/transitions`, body);
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Issue **${parsed.issueKey}** transitioned successfully.`);
      },
    },

    jira_get_transitions: {
      description:
        'Get available transitions for a Jira issue with their required field definitions. Use this before calling jira_transition_issue to discover which fields are required by the transition screen.',
      inputSchema: getTransitionsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = getTransitionsSchema.parse(args);
        const issueKey = encodeURIComponent(parsed.issueKey);

        const res = await client.get<{
          transitions: Array<{
            id: string;
            name: string;
            to: { id: string; name: string };
            fields: Record<
              string,
              {
                required: boolean;
                name: string;
                allowedValues?: unknown[];
                schema?: Record<string, unknown>;
              }
            >;
          }>;
        }>(`/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`);

        if (!res.ok) return textResult(res.error!, true);
        const transitions = res.data!.transitions;

        if (transitions.length === 0) {
          return textResult(`No transitions available for ${parsed.issueKey}.`);
        }

        const lines: string[] = [`# Available transitions for **${parsed.issueKey}**\n`];
        for (const t of transitions) {
          lines.push(`## ${t.name} (id: \`${t.id}\`) → ${t.to.name}`);
          const fieldEntries = Object.entries(t.fields ?? {});
          if (fieldEntries.length === 0) {
            lines.push('_No screen fields required._');
          } else {
            for (const [fieldId, meta] of fieldEntries) {
              const req = meta.required ? '**required**' : 'optional';
              const type = (meta.schema as Record<string, unknown> | undefined)?.type ?? 'unknown';
              lines.push(`- \`${fieldId}\` — ${meta.name} (${req}, type: ${type})`);
              if (meta.allowedValues && (meta.allowedValues as unknown[]).length > 0) {
                const vals = (meta.allowedValues as Array<Record<string, unknown>>)
                  .slice(0, 10)
                  .map((v) => v.name ?? v.value ?? v.id ?? JSON.stringify(v))
                  .join(', ');
                lines.push(`  Allowed values: ${vals}`);
              }
            }
          }
          lines.push('');
        }

        return textResult(lines.join('\n'));
      },
    },

    jira_delete_issue: {
      description:
        'Delete a Jira issue. Requires confirm: true as a safety guard. This action is irreversible.',
      inputSchema: deleteIssueSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = deleteIssueSchema.parse(args);

        if (!parsed.confirm) {
          return textResult(
            'Deletion aborted: you must pass confirm: true to delete an issue. This is a safety guard.',
            true,
          );
        }

        const res = await client.delete(`/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}`);
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Issue **${parsed.issueKey}** deleted successfully.`);
      },
    },
  };
}
