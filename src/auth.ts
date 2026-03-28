import { JiraConfig, Scope } from './types.js';

export function buildHeaders(email: string, token: string): Record<string, string> {
  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export function buildBaseUrl(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

export function sanitizeError(message: string, token: string): string {
  return message.replaceAll(token, '[REDACTED]');
}

export async function fetchCloudId(instance: string): Promise<string> {
  const url = `https://${instance}.atlassian.net/_edge/tenant_info`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Cloud ID from ${instance}.atlassian.net (status ${response.status}). ` +
        'Provide JIRA_CLOUD_ID manually or check your JIRA_INSTANCE value.',
    );
  }
  const data = (await response.json()) as { cloudId?: string };
  if (!data.cloudId) {
    throw new Error('Cloud ID not found in tenant_info response. Provide JIRA_CLOUD_ID manually.');
  }
  return data.cloudId;
}

export async function loadConfig(): Promise<JiraConfig> {
  const instance = process.env.JIRA_INSTANCE;
  if (!instance) {
    throw new Error(
      'JIRA_INSTANCE environment variable is required (e.g. "mycompany" for mycompany.atlassian.net)',
    );
  }

  const apiToken = process.env.JIRA_API_TOKEN;
  if (!apiToken) {
    throw new Error('JIRA_API_TOKEN environment variable is required (scoped API token)');
  }

  const userEmail = process.env.JIRA_USER_EMAIL;
  if (!userEmail) {
    throw new Error('JIRA_USER_EMAIL environment variable is required');
  }

  let cloudId = process.env.JIRA_CLOUD_ID;
  if (!cloudId) {
    cloudId = await fetchCloudId(instance);
  }

  const scopes = parseScopes(process.env.JIRA_SCOPES);

  return { instance, cloudId, apiToken, userEmail, scopes };
}

export function parseScopes(raw: string | undefined): Scope[] {
  const VALID_SCOPES: Set<string> = new Set([
    'read:jira-work',
    'write:jira-work',
    'read:jira-user',
    'read:me',
  ]);

  if (!raw || raw.trim() === '') {
    return ['read:jira-work'];
  }

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VALID_SCOPES.has(s)) as Scope[];
}
