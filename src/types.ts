export type Scope = 'read:jira-work' | 'write:jira-work' | 'read:jira-user' | 'read:me';

export interface JiraConfig {
  instance: string;
  cloudId: string;
  apiToken: string;
  userEmail: string;
  scopes: Scope[];
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  retryAfter?: number;
}

export interface JiraIssue {
  key: string;
  id: string;
  fields: Record<string, unknown>;
}

export interface JiraSearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraComment {
  id: string;
  author: { displayName: string; accountId: string };
  body: unknown;
  created: string;
  updated: string;
}

export interface JiraCommentList {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  style: string;
}

export interface JiraProjectSearch {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraProject[];
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
  avatarUrls?: Record<string, string>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
