import { JiraConfig, Scope } from './types.js';
import { KNOWN_SCOPES, parseToolsets } from './scope-catalog.js';

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
  const toolsets = parseToolsets(process.env.JIRA_TOOLSETS);

  return { instance, cloudId, apiToken, userEmail, scopes, toolsets };
}

export function parseScopes(raw: string | undefined): Scope[] {
  if (!raw || raw.trim() === '') {
    return ['read:jira-work'];
  }

  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  if (requested.length === 0) {
    return ['read:jira-work'];
  }

  // Fail loudly. Silently dropping unrecognised scopes used to leave the server
  // with an empty scope list, which registers zero tools with no error at all.
  const unknown = requested.filter((s) => !KNOWN_SCOPES.has(s));
  if (unknown.length > 0) {
    throw new Error(
      `Unrecognised scope(s) in JIRA_SCOPES: ${unknown.join(', ')}.\n` +
        `Supported scopes: ${[...KNOWN_SCOPES].sort().join(', ')}.\n` +
        'Check for typos. Note that scopes cannot be read back from an Atlassian token, ' +
        'so this server cannot verify them against the token itself — JIRA_SCOPES must ' +
        'match what you selected when the token was created.',
    );
  }

  return [...new Set(requested)] as Scope[];
}
