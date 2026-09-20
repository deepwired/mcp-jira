import { z } from 'zod';
import { JiraClient } from '../client.js';
import { ToolResult } from '../types.js';

/**
 * Versions and components.
 *
 * Note GET /rest/api/3/version does not exist — versions are listed per project
 * at /rest/api/3/project/{key}/version. Creating or updating a version or
 * component needs manage:jira-project, a tier above write:jira-work.
 */

const listVersionsSchema = z.object({
  projectKey: z.string().min(1, 'projectKey is required'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
  released: z
    .enum(['all', 'released', 'unreleased'])
    .optional()
    .default('all')
    .describe('Filter by release state.'),
});

const manageVersionSchema = z.object({
  action: z.enum(['create', 'update', 'release']).describe('What to do with the version.'),
  projectKey: z.string().optional().describe('Required for action "create".'),
  versionId: z.string().optional().describe('Required for "update" and "release".'),
  name: z.string().optional().describe('Version name, e.g. "2.1.0".'),
  description: z.string().optional(),
  startDate: z.string().optional().describe('YYYY-MM-DD.'),
  releaseDate: z.string().optional().describe('YYYY-MM-DD.'),
  archived: z.boolean().optional(),
});

const listComponentsSchema = z.object({
  projectKey: z.string().min(1, 'projectKey is required'),
});

interface Version {
  id: string;
  name: string;
  description?: string;
  released?: boolean;
  archived?: boolean;
  releaseDate?: string;
}

interface Component {
  id: string;
  name: string;
  description?: string;
  lead?: { displayName?: string };
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

export function createVersionTools(client: JiraClient) {
  return {
    jira_list_versions: {
      description:
        'List versions (fixVersions) for a Jira project, with release state and dates. ' +
        'Use this to find the version ID or exact name needed when setting fixVersions on an issue.',
      inputSchema: listVersionsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listVersionsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });

        const res = await client.get<{ values: Version[]; total: number }>(
          `/rest/api/3/project/${encodeURIComponent(parsed.projectKey)}/version?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        let versions = res.data?.values ?? [];
        if (parsed.released === 'released') versions = versions.filter((v) => v.released);
        if (parsed.released === 'unreleased') versions = versions.filter((v) => !v.released);

        if (versions.length === 0) {
          return textResult(`No ${parsed.released === 'all' ? '' : parsed.released + ' '}versions in ${parsed.projectKey}.`);
        }

        const lines = versions.map((v) => {
          const state = v.released ? 'released' : 'unreleased';
          const archived = v.archived ? ', archived' : '';
          const date = v.releaseDate ? ` — ${v.releaseDate}` : '';
          return `- **${v.name}** (id: ${v.id}, ${state}${archived})${date}`;
        });
        return textResult(
          `${versions.length} version(s) in **${parsed.projectKey}**:\n\n${lines.join('\n')}`,
        );
      },
    },

    jira_manage_version: {
      description:
        'Create a project version, update one, or mark it released. ' +
        'Requires manage:jira-project (or write:project-version:jira) — a higher tier than write:jira-work.',
      inputSchema: manageVersionSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = manageVersionSchema.parse(args);

        if (parsed.action === 'create') {
          if (!parsed.projectKey) {
            return textResult('projectKey is required to create a version.', true);
          }
          if (!parsed.name) return textResult('name is required to create a version.', true);

          const body: Record<string, unknown> = {
            name: parsed.name,
            project: parsed.projectKey,
          };
          if (parsed.description) body.description = parsed.description;
          if (parsed.startDate) body.startDate = parsed.startDate;
          if (parsed.releaseDate) body.releaseDate = parsed.releaseDate;

          const res = await client.post<Version>('/rest/api/3/version', body);
          if (!res.ok) return textResult(res.error!, true);
          return textResult(
            `Version "${parsed.name}" created in ${parsed.projectKey} (id: ${res.data?.id ?? 'unknown'}).`,
          );
        }

        if (!parsed.versionId) {
          return textResult(`versionId is required for action "${parsed.action}".`, true);
        }

        const body: Record<string, unknown> = {};
        if (parsed.action === 'release') {
          body.released = true;
          body.releaseDate = parsed.releaseDate ?? new Date().toISOString().slice(0, 10);
        } else {
          if (parsed.name !== undefined) body.name = parsed.name;
          if (parsed.description !== undefined) body.description = parsed.description;
          if (parsed.startDate !== undefined) body.startDate = parsed.startDate;
          if (parsed.releaseDate !== undefined) body.releaseDate = parsed.releaseDate;
          if (parsed.archived !== undefined) body.archived = parsed.archived;

          if (Object.keys(body).length === 0) {
            return textResult('No changes supplied for the version update.', true);
          }
        }

        const res = await client.put(
          `/rest/api/3/version/${encodeURIComponent(parsed.versionId)}`,
          body,
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          parsed.action === 'release'
            ? `Version ${parsed.versionId} marked released (${body.releaseDate}).`
            : `Version ${parsed.versionId} updated.`,
        );
      },
    },

    jira_list_components: {
      description:
        'List components for a Jira project, with their leads. ' +
        'Use this to find the exact component name needed when setting components on an issue.',
      inputSchema: listComponentsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listComponentsSchema.parse(args);
        const res = await client.get<Component[]>(
          `/rest/api/3/project/${encodeURIComponent(parsed.projectKey)}/components`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const components = res.data ?? [];
        if (components.length === 0) {
          return textResult(`No components defined in ${parsed.projectKey}.`);
        }

        const lines = components.map((c) => {
          const lead = c.lead?.displayName ? ` — lead: ${c.lead.displayName}` : '';
          const desc = c.description ? `\n  ${c.description}` : '';
          return `- **${c.name}** (id: ${c.id})${lead}${desc}`;
        });
        return textResult(
          `${components.length} component(s) in **${parsed.projectKey}**:\n\n${lines.join('\n')}`,
        );
      },
    },
  };
}
