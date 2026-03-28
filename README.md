# mcp-jira-scoped

[![npm version](https://img.shields.io/npm/v/mcp-jira-scoped.svg)](https://www.npmjs.com/package/mcp-jira-scoped)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

**The only MCP server for Jira that works with Atlassian's scoped API tokens.**

Every other Jira MCP server uses classic (unscoped) API tokens with basic auth against `yoursite.atlassian.net`. Atlassian is deprecating those. This server uses scoped tokens with the modern `api.atlassian.com` gateway — the way Atlassian intends these tokens to be used.

## What You Can Do

Once connected, you can ask your AI assistant things like:

- *"What's the status of PROJ-1234?"*
- *"Search for all open bugs assigned to me in the BACKEND project"*
- *"Create a story in PROJ for the database migration, priority P2, under epic PROJ-100"*
- *"Move PROJ-1234 to In Progress"*
- *"Add a comment to PROJ-1234 saying the fix is deployed to staging"*
- *"Link PROJ-1234 as blocking PROJ-5678"*
- *"Find all issues with 'auth' in the summary updated this week"*

## Why This Server

| | mcp-jira-scoped | Other Jira MCP servers |
|---|---|---|
| **Token type** | Scoped (modern, `ATATT` prefix) | Classic (being deprecated) |
| **Auth gateway** | `api.atlassian.com` | `yoursite.atlassian.net` |
| **Scope enforcement** | Server-side, before every API call | None — relies on AI self-restraint |
| **Default mode** | Read-only (write must be explicitly granted) | Full access |
| **Delete safety** | Requires `confirm: true` parameter | No guard |

## Quick Start

### 1. Create a Scoped API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token with scopes"**
3. Grant the scopes you need:
   - `read:jira-work` — read issues, search, comments, projects
   - `write:jira-work` — create/update/delete issues, add comments
   - `read:jira-user` — look up users
   - `read:me` — read your own profile

### 2. Add to Your AI Client

#### Claude Desktop / Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-scoped"],
      "env": {
        "JIRA_INSTANCE": "yourcompany",
        "JIRA_USER_EMAIL": "you@yourcompany.com",
        "JIRA_API_TOKEN": "<your-scoped-token>",
        "JIRA_SCOPES": "read:jira-work,write:jira-work"
      }
    }
  }
}
```

#### Cursor

Add the same config to Cursor's MCP settings (Settings > MCP Servers).

#### VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-scoped"],
      "env": {
        "JIRA_INSTANCE": "yourcompany",
        "JIRA_USER_EMAIL": "you@yourcompany.com",
        "JIRA_API_TOKEN": "<your-scoped-token>",
        "JIRA_SCOPES": "read:jira-work,write:jira-work"
      }
    }
  }
}
```

## Configuration

| Env Var | Required | Description |
|---------|----------|-------------|
| `JIRA_INSTANCE` | Yes | Instance name (e.g. `mycompany` for `mycompany.atlassian.net`) |
| `JIRA_API_TOKEN` | Yes | Scoped API token (`ATATT...` prefix) |
| `JIRA_USER_EMAIL` | Yes | Email associated with the token |
| `JIRA_SCOPES` | No | Comma-separated scopes. Defaults to `read:jira-work` (read-only) |
| `JIRA_CLOUD_ID` | No | Atlassian Cloud ID. Auto-fetched if not set. Find it at `https://yoursite.atlassian.net/_edge/tenant_info` |

## Available Tools (14)

### Read Tools (`read:jira-work`)

| Tool | Description |
|------|-------------|
| `jira_get_issue` | Get issue by key (e.g. PROJ-123) — returns summary, status, assignee, description |
| `jira_search` | Search issues via JQL with pagination |
| `jira_list_comments` | List comments on an issue |
| `jira_list_projects` | List accessible projects |
| `jira_get_project` | Get project details by key |
| `jira_list_link_types` | List available issue link types |

### Write Tools (`write:jira-work`)

| Tool | Description |
|------|-------------|
| `jira_create_issue` | Create an issue (task, bug, story, epic). Supports custom fields |
| `jira_update_issue` | Update fields on an issue. Supports custom fields |
| `jira_add_comment` | Add a comment (plain text auto-converted to ADF) |
| `jira_transition_issue` | Move an issue to a new status. Lists transitions if no ID given |
| `jira_delete_issue` | Delete an issue (requires `confirm: true` safety guard) |
| `jira_link_issues` | Link two issues (blocks, relates, split, clone, etc.) |

### User Tools (`read:jira-user`)

| Tool | Description |
|------|-------------|
| `jira_get_user` | Get user info by account ID |
| `jira_search_users` | Search users by name or email |

## Safety

1. **Scope enforcement** — tools are blocked server-side if their required scope isn't granted. The API call never happens.
2. **Read-only default** — if `JIRA_SCOPES` is not set, only read tools are even registered.
3. **Delete confirmation** — `jira_delete_issue` requires `confirm: true`.
4. **No token logging** — tokens are redacted from all error messages via `sanitizeError`.
5. **No admin operations** — no project creation/deletion, workflow changes, or webhook management. Ever.

## Troubleshooting

### "Client must be authenticated" (401)

You're probably using a **scoped** token against the old `yoursite.atlassian.net` URL. Scoped tokens (`ATATT...` prefix) only work via `api.atlassian.com`. This server handles this automatically — make sure you're using `mcp-jira-scoped`, not another Jira MCP server.

### "Failed to parse Connect Session Auth Token" (403)

You're sending a scoped token as a `Bearer` token. Scoped tokens use Basic auth (email:token) via the `api.atlassian.com` gateway. Again, this server handles it — this error means you're using a different server.

### Token scopes vs server scopes

There are two layers of scope enforcement:

1. **Atlassian's scopes** — set when you create the token. These control what Atlassian's API allows.
2. **Server scopes** (`JIRA_SCOPES` env var) — control what tools this MCP server makes available. These can only be *more* restrictive, never less.

If you get a 403 from Atlassian, check that your token has the required scope. If you get a scope enforcement error from the MCP server, check your `JIRA_SCOPES` env var.

### Custom fields

Jira projects often have required custom fields (e.g. "Work Category", "Story Point Estimate"). Use the `customFields` parameter on `jira_create_issue` and `jira_update_issue`:

```
Create an issue in PROJ with summary "Fix login bug" and set customfield_10016 to 3
```

The AI will pass `{"customFields": {"customfield_10016": 3}}`. To find custom field IDs, check your Jira project's field configuration.

### Cloud ID

The server auto-fetches your Cloud ID from `https://yourinstance.atlassian.net/_edge/tenant_info`. If this fails (e.g. corporate firewall), set `JIRA_CLOUD_ID` manually.

## Roadmap

See [Prioritised-TodoList.md](Prioritised-TodoList.md) for the full feature checklist — what's built, what's next, and where contributions are welcome. Key areas open for contribution:

- **Issue tools** — assign shortcut, create/transition metadata discovery
- **Comments** — edit and delete
- **Watchers & Worklogs** — full CRUD
- **Boards & Sprints** — Agile workflow support
- **Attachments** — list, download, upload

## Development

```bash
git clone https://github.com/deepwired/mcp-jira.git
cd mcp-jira
npm install
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on adding tools and submitting PRs.

## Note on Package Naming

The GitHub repo is `mcp-jira` but the npm package is `mcp-jira-scoped`. We plan to unify under `mcp-jira` in a future release. For now, use `npx -y mcp-jira-scoped` to run the server.

## License

Apache 2.0 — see [LICENSE](LICENSE).
