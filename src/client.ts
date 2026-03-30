import { buildHeaders, buildBaseUrl, sanitizeError } from './auth.js';
import { ApiResponse, JiraConfig } from './types.js';

export class JiraClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private token: string;

  constructor(config: JiraConfig) {
    this.baseUrl = buildBaseUrl(config.cloudId);
    this.headers = buildHeaders(config.userEmail, config.apiToken);
    this.token = config.apiToken;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(30000),
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return { ok: false, status: 0, error: 'Request timed out' };
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { ok: false, status: 0, error: 'Network error — unable to reach Jira' };
      }
      return {
        ok: false,
        status: 0,
        error: sanitizeError(String(err), this.token),
      };
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { ok: true, status: response.status };
    }

    if (response.status === 401) {
      return { ok: false, status: 401, error: 'Authentication failed — check your API token' };
    }

    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        error: 'Permission denied — check your token scopes in Atlassian',
      };
    }

    if (response.status === 404) {
      return { ok: false, status: 404, error: 'Not found — check the resource identifier' };
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return {
        ok: false,
        status: 429,
        error: `Rate limited by Jira. Retry after ${retryAfter ?? 'unknown'} seconds.`,
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
        error: sanitizeError(`Jira API error (${response.status}): ${messages}`, this.token),
      };
    }

    return { ok: true, status: response.status, data };
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

  async delete(path: string): Promise<ApiResponse> {
    return this.request('DELETE', path);
  }

  async postMultipart<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    // Omit Content-Type so fetch sets it with the multipart boundary.
    // X-Atlassian-Token: no-check is required to bypass XSRF protection on attachment endpoints.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { 'Content-Type': _ct, ...headersWithoutCT } = this.headers;
    const headers = { ...headersWithoutCT, 'X-Atlassian-Token': 'no-check' };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(60000),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return { ok: false, status: 0, error: 'Request timed out' };
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { ok: false, status: 0, error: 'Network error — unable to reach Jira' };
      }
      return { ok: false, status: 0, error: sanitizeError(String(err), this.token) };
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { ok: true, status: response.status };
    }
    if (response.status === 401) {
      return { ok: false, status: 401, error: 'Authentication failed — check your API token' };
    }
    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        error: 'Permission denied — check your token scopes in Atlassian',
      };
    }
    if (response.status === 404) {
      return { ok: false, status: 404, error: 'Not found — check the resource identifier' };
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return {
        ok: false,
        status: 429,
        error: `Rate limited by Jira. Retry after ${retryAfter ?? 'unknown'} seconds.`,
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
        error: sanitizeError(`Jira API error (${response.status}): ${messages}`, this.token),
      };
    }

    return { ok: true, status: response.status, data };
  }
}
