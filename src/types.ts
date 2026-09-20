import type { Toolset } from './scope-catalog.js';

/**
 * A scope string. Deliberately not a union: Atlassian publishes ~170 granular
 * Jira scopes and adds more over time. Validation happens at runtime against
 * KNOWN_SCOPES in scope-catalog.ts, which is the single place to update.
 */
export type Scope = string;

export interface JiraConfig {
  instance: string;
  cloudId: string;
  apiToken: string;
  userEmail: string;
  scopes: Scope[];
  toolsets?: Toolset[];
  projects?: string[] | null;
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
  fields?: Record<string, JiraFieldMeta>;
}

export interface JiraFieldMeta {
  required: boolean;
  name: string;
  schema?: Record<string, unknown>;
  allowedValues?: unknown[];
}

export interface JiraAttachment {
  id: string;
  filename: string;
  author: { displayName: string; accountId: string };
  created: string;
  size: number;
  mimeType: string;
  content: string;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  orderable: boolean;
  navigable: boolean;
  searchable: boolean;
  schema?: {
    type: string;
    custom?: string;
    customId?: number;
  };
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
