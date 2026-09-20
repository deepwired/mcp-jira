import { buildHeaders, buildBaseUrl, sanitizeError } from './auth.js';
import { ApiResponse, JiraConfig } from './types.js';

const JSON_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 60000;

/**
 * Status-code semantics on the api.atlassian.com gateway are not what they look
 * like, and getting them wrong sends people hunting in the wrong place:
 *
 *   401 — the scope is missing, OR the cloudId is wrong.
 *   403 — the scope check PASSED; the account lacks permission or a licence.
 *   404 on a key you know exists — wrong base URL (site URL instead of the gateway).
 */
function describeStatus(status: number, retryAfter: string | null): string | undefined {
  switch (status) {
    case 401:
      return (
        'Authentication failed (401). Either the token is missing a required scope, or the ' +
        'Cloud ID is wrong. Scopes cannot be read back from an Atlassian token, so verify ' +
        'against the scopes you selected when creating it. If JIRA_CLOUD_ID is set manually, ' +
        'confirm it matches your site.'
      );
    case 403:
      return (
        'Permission denied (403). The token scope check passed — this is an account-level ' +
        'problem: the user lacks permission on this project or issue, or lacks the required ' +
        'product licence (e.g. a Jira Service Management agent seat).'
      );
    case 404:
      return (
        'Not found (404). Check the resource identifier. If you are certain it exists, the ' +
        'base URL is likely wrong — scoped tokens must go through ' +
        'https://api.atlassian.com/ex/jira/{cloudId}, not https://{site}.atlassian.net.'
      );
    case 429:
      return `Rate limited by Jira. Retry after ${retryAfter ?? 'unknown'} seconds.`;
    default:
      return undefined;
  }
}

export class JiraClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private token: string;
  private email: string;

  constructor(config: JiraConfig) {
    this.baseUrl = buildBaseUrl(config.cloudId);
    this.headers = buildHeaders(config.userEmail, config.apiToken);
    this.token = config.apiToken;
    this.email = config.userEmail;
  }

  private mapFetchError(err: unknown): ApiResponse {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, status: 0, error: 'Request timed out' };
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return { ok: false, status: 0, error: 'Network error — unable to reach Jira' };
    }
    return { ok: false, status: 0, error: sanitizeError(String(err), this.token, this.email) };
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { ok: true, status: response.status };
    }

    const retryAfter = response.headers.get('Retry-After');
    const described = describeStatus(response.status, retryAfter);
    if (described) {
      return {
        ok: false,
        status: response.status,
        error: described,
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      };
    }

    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      return {
        ok: false,
        status: response.status,
        error: `Invalid JSON response from Jira (status ${response.status})`,
      };
    }

    if (!response.ok) {
      const errorBody = data as Record<string, unknown>;
      const messages =
        Array.isArray(errorBody?.errorMessages) && errorBody.errorMessages.length > 0
          ? (errorBody.errorMessages as string[]).join('; ')
          : JSON.stringify(errorBody?.errors ?? data);
      return {
        ok: false,
        status: response.status,
        error: sanitizeError(`Jira API error (${response.status}): ${messages}`, this.token, this.email),
      };
    }

    return { ok: true, status: response.status, data };
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const options: RequestInit = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    };

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, options);
    } catch (err) {
      return this.mapFetchError(err) as ApiResponse<T>;
    }

    return this.handleResponse<T>(response);
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, body);
  }

  async postMultipart<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    // Omit Content-Type so fetch sets it with the multipart boundary.
    // X-Atlassian-Token: no-check is required to bypass XSRF protection on attachment endpoints.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { 'Content-Type': _ct, ...headersWithoutCT } = this.headers;
    const headers = { ...headersWithoutCT, 'X-Atlassian-Token': 'no-check' };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (err) {
      return this.mapFetchError(err) as ApiResponse<T>;
    }

    return this.handleResponse<T>(response);
  }

  /** Fetch raw bytes (attachment download). Bypasses JSON parsing. */
  async getBinary(path: string): Promise<ApiResponse<{ bytes: Uint8Array; contentType: string }>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: this.headers.Authorization },
        redirect: 'follow',
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (err) {
      return this.mapFetchError(err) as ApiResponse<{ bytes: Uint8Array; contentType: string }>;
    }

    const described = describeStatus(response.status, response.headers.get('Retry-After'));
    if (described) {
      return { ok: false, status: response.status, error: described };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Jira API error (${response.status}) downloading attachment`,
      };
    }

    const buf = new Uint8Array(await response.arrayBuffer());
    return {
      ok: true,
      status: response.status,
      data: {
        bytes: buf,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      },
    };
  }
}
