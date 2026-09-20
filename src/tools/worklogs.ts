import { z } from 'zod';
import { JiraClient } from '../client.js';
import { ToolResult } from '../types.js';
import { toAdf, fromAdf } from '../adf.js';

const formatIn = z.enum(['markdown', 'text', 'adf']).optional().default('markdown');

const listWorklogsSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required (e.g. PROJ-123)'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

const addWorklogSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  timeSpent: z
    .string()
    .min(1, 'timeSpent is required')
    .describe('Time spent in Jira duration format, e.g. "2h", "30m", "1d 4h".'),
  started: z
    .string()
    .optional()
    .describe(
      'When the work started, ISO 8601 with offset, e.g. "2026-09-20T09:00:00.000+0000". ' +
        'Defaults to now.',
    ),
  comment: z.string().optional().describe('Optional worklog comment.'),
  format: formatIn,
});

const updateWorklogSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  worklogId: z.string().min(1, 'worklogId is required'),
  timeSpent: z.string().optional().describe('New time spent, e.g. "3h".'),
  started: z.string().optional().describe('New start time, ISO 8601 with offset.'),
  comment: z.string().optional().describe('Replacement comment.'),
  format: formatIn,
});

const deleteWorklogSchema = z.object({
  issueKey: z.string().min(1, 'issueKey is required'),
  worklogId: z.string().min(1, 'worklogId is required'),
  confirm: z.boolean().describe('Must be true to confirm deletion. This action is irreversible.'),
});

interface JiraWorklog {
  id: string;
  author?: { displayName?: string };
  timeSpent?: string;
  timeSpentSeconds?: number;
  started?: string;
  comment?: unknown;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return [h > 0 ? `${h}h` : null, m > 0 ? `${m}m` : null].filter(Boolean).join(' ') || '0m';
}

export function createWorklogTools(client: JiraClient) {
  return {
    jira_list_worklogs: {
      description:
        'List work logs on a Jira issue, with author, time spent, start time and comment. ' +
        'Also reports the total time logged across the returned entries.',
      inputSchema: listWorklogsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listWorklogsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        const res = await client.get<{ worklogs: JiraWorklog[]; total: number }>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/worklog?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const worklogs = res.data?.worklogs ?? [];
        if (worklogs.length === 0) {
          return textResult(`No work logged on ${parsed.issueKey}.`);
        }

        const totalSeconds = worklogs.reduce((sum, w) => sum + (w.timeSpentSeconds ?? 0), 0);
        const lines = worklogs.map((w) => {
          const who = w.author?.displayName ?? 'Unknown';
          const when = w.started ?? 'unknown date';
          const note = w.comment ? ` — ${fromAdf(w.comment, 'text').replace(/\n+/g, ' ')}` : '';
          return `- **${w.timeSpent ?? '?'}** by ${who} on ${when} (id: ${w.id})${note}`;
        });

        return textResult(
          `${res.data?.total ?? worklogs.length} worklog(s) on **${parsed.issueKey}** — ` +
            `${formatDuration(totalSeconds)} shown:\n\n${lines.join('\n')}`,
        );
      },
    },

    jira_add_worklog: {
      description:
        'Log work against a Jira issue. Time is given in Jira duration format such as "2h" or "1d 4h". ' +
        'Defaults to logging at the current time unless started is supplied.',
      inputSchema: addWorklogSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = addWorklogSchema.parse(args);
        const body: Record<string, unknown> = { timeSpent: parsed.timeSpent };
        if (parsed.started) body.started = parsed.started;
        if (parsed.comment) body.comment = toAdf(parsed.comment, parsed.format);

        const res = await client.post<JiraWorklog>(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/worklog`,
          body,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          `Logged ${parsed.timeSpent} on **${parsed.issueKey}** (worklog id: ${res.data?.id ?? 'unknown'}).`,
        );
      },
    },

    jira_update_worklog: {
      description:
        'Update an existing work log entry on a Jira issue. Only the supplied fields change. ' +
        'Use jira_list_worklogs to find worklog IDs.',
      inputSchema: updateWorklogSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = updateWorklogSchema.parse(args);
        const body: Record<string, unknown> = {};
        if (parsed.timeSpent !== undefined) body.timeSpent = parsed.timeSpent;
        if (parsed.started !== undefined) body.started = parsed.started;
        if (parsed.comment !== undefined) body.comment = toAdf(parsed.comment, parsed.format);

        if (Object.keys(body).length === 0) {
          return textResult(
            'No changes supplied — provide timeSpent, started or comment.',
            true,
          );
        }

        const res = await client.put(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/worklog/${encodeURIComponent(parsed.worklogId)}`,
          body,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Worklog ${parsed.worklogId} updated on **${parsed.issueKey}**.`);
      },
    },

    jira_delete_worklog: {
      description:
        'Delete a work log entry from a Jira issue. Requires confirm: true as a safety guard.',
      inputSchema: deleteWorklogSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = deleteWorklogSchema.parse(args);
        if (!parsed.confirm) {
          return textResult(
            'Deletion aborted: you must pass confirm: true to delete a worklog. This is a safety guard.',
            true,
          );
        }
        const res = await client.delete(
          `/rest/api/3/issue/${encodeURIComponent(parsed.issueKey)}/worklog/${encodeURIComponent(parsed.worklogId)}`,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(`Worklog ${parsed.worklogId} deleted from **${parsed.issueKey}**.`);
      },
    },
  };
}
