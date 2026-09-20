# mcp-jira-scoped

[![npm version](https://img.shields.io/npm/v/mcp-jira-scoped.svg)](https://www.npmjs.com/package/mcp-jira-scoped)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

**A Jira MCP server built around Atlassian's scoped API tokens, with scope enforcement in the server itself.**

Most Jira MCP servers use classic (unscoped) API tokens with basic auth against `yoursite.atlassian.net` — including the most popular one, which [still has scoped-token support open as a feature request](https://github.com/sooperset/mcp-atlassian/issues/968). Atlassian is moving away from classic tokens. This server is built for scoped tokens against the modern `api.atlassian.com` gateway, and enforces your granted scopes server-side before any API call is made — the AI is never trusted to restrain itself.

> **v2.0 is a breaking change.** Default content format is now Markdown, `jira_search` paginates on `nextPageToken` instead of `startAt`, and an unrecognised `JIRA_SCOPES` value now fails at startup instead of being silently dropped. See [CHANGELOG.md](CHANGELOG.md) before upgrading.

## What You Can Do

- *"What's the status of PROJ-1234?"*
- *"Search for all open bugs assigned to me in the BACKEND project"*
- *"What fields do I need to create a Bug in PROJ?"*
- *"Create a story for the database migration under epic PROJ-100"*
- *"Log 2 hours against PROJ-1234 for the review"*
- *"Attach this screenshot to PROJ-1234"*
- *"Who changed the status of PROJ-1234, and when?"*
- *"What's in the active sprint on the Platform board?"*

## Why This Server

| | mcp-jira-scoped | Typical Jira MCP server |
|---|---|---|
| **Token type** | Scoped (`ATATT` prefix), via `api.atlassian.com` | Classic, via `yoursite.atlassian.net` |
| **Scope enforcement** | Server-side, before every API call | None — relies on AI self-restraint |
| **Default mode** | Read-only unless write scopes are granted | Full access |
| **Project restriction** | `JIRA_PROJECTS` allowlist, enforced server-side | Not available |
| **Tool surface** | 34 by default, 44 available, gated by toolset | All tools, always on |
| **Content fidelity** | Markdown ⇄ ADF, tables and code blocks preserved | Usually plain-text flattening |
| **Attachments** | Upload, download, list, delete | Often read-only or absent |
| **Destructive ops** | Every one requires `confirm: true` | Usually unguarded |

## Quick Start

### 1. Create a scoped API token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token with scopes"** — *not* plain "Create API token", which produces a classic token that will not work
3. Select app: **Jira**
4. The scope picker is a **searchable box**, not a list. Paste each scope string in and select the match.

A good starting set:

```
read:jira-work      write:jira-work      read:jira-user      read:me
```

That covers every default toolset. See [Scopes](#scopes) for the opt-in toolsets.

> Atlassian gives no way to read a token's scopes back after creation, and no way to edit them — changing scopes means minting a new token. Name your tokens descriptively; the name is the only record of what they can do.

### 2. Add to your AI client

**Claude Desktop / Claude Code** — add to `.mcp.json`:

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

**Cursor** — the same config under Settings → MCP Servers.

**VS Code (Copilot)** — the same, in `.vscode/mcp.json` under `servers`.

## Configuration

| Env Var | Required | Description |
|---|---|---|
| `JIRA_INSTANCE` | Yes | Instance name (e.g. `mycompany` for `mycompany.atlassian.net`) |
| `JIRA_API_TOKEN` | Yes | Scoped API token (`ATATT...` prefix) |
| `JIRA_USER_EMAIL` | Yes | Email associated with the token |
| `JIRA_SCOPES` | No | Comma-separated. Defaults to `read:jira-work` (read-only). **Unrecognised values fail at startup.** |
| `JIRA_TOOLSETS` | No | Which capability groups to register. Defaults to the six default toolsets. Accepts `all` and `default`. |
| `JIRA_PROJECTS` | No | Restrict the whole server to an allowlist of project keys, e.g. `PROJ,OPS` |
| `JIRA_CLOUD_ID` | No | Auto-fetched from `https://yoursite.atlassian.net/_edge/tenant_info` if unset |

### Restricting to specific projects

```
JIRA_PROJECTS=PROJ,OPS
```

Any request naming a different project is refused **before** the API call, and every JQL search is wrapped so it cannot reach outside the list — an `OR` in the query can't escape it. This is a blast-radius control for agent use, not a replacement for Jira permissions: it constrains what the server will ask for, and can't widen what the token already allows.

## Toolsets

44 tools is past the point where model tool-selection [starts to degrade](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool), and some clients silently truncate long tool lists. So tools are grouped, and only the common ones load by default.

```bash
JIRA_TOOLSETS=default              # the six default groups (34 tools) — this is the default
JIRA_TOOLSETS=default,agile        # add boards and sprints
JIRA_TOOLSETS=all                  # everything (44 tools)
JIRA_TOOLSETS=core,users           # a minimal surface
```

The choice is made once at startup. Disabled toolsets are named in the server's instructions, so the model knows they exist and can tell you how to enable them.

| Toolset | Default | Tools | Covers |
|---|:---:|--:|---|
| `core` | ✅ | 15 | Issues, search, comments, transitions, projects, fields |
| `users` | ✅ | 3 | User lookup and the authenticated account |
| `attachments` | ✅ | 4 | List, upload, download, delete |
| `links` | ✅ | 6 | Issue links and remote (external) links |
| `worklogs` | ✅ | 4 | Read and write work logs |
| `metadata` | ✅ | 2 | Create metadata and issue changelogs |
| `agile` | — | 4 | Boards and sprints (needs `jira-software` scopes) |
| `versions` | — | 3 | Project versions and components |
| `filters` | — | 2 | Saved filters |
| `labels` | — | 1 | Label discovery |

## Available Tools (44)

### core

| Tool | Description |
|---|---|
| `jira_get_issue` | Get an issue by key. `includeCustomFields: true` returns all custom fields |
| `jira_search` | JQL search, paginated with `nextPageToken`. `includeTotal` adds an approximate count |
| `jira_list_comments` | List comments with IDs, authors and timestamps |
| `jira_list_projects` | List accessible projects |
| `jira_get_project` | Project details by key |
| `jira_list_fields` | All fields including custom — discover `customfield_*` IDs |
| `jira_get_transitions` | Available transitions with their required screen fields |
| `jira_create_issue` | Create an issue, with custom field support |
| `jira_update_issue` | Update fields. Omit a field to leave it; pass `null` to clear it |
| `jira_assign_issue` | Assign, or unassign with `accountId: null` |
| `jira_transition_issue` | Move to a new status, with optional fields and comment |
| `jira_delete_issue` | Delete an issue (`confirm: true`) |
| `jira_add_comment` | Add a comment (Markdown by default) |
| `jira_update_comment` | Edit an existing comment |
| `jira_delete_comment` | Delete a comment (`confirm: true`) |

### users

| Tool | Description |
|---|---|
| `jira_get_myself` | The authenticated account. Resolves "me", and the cheapest connection check |
| `jira_get_user` | User info by account ID |
| `jira_search_users` | Find users by name or email |

### attachments

| Tool | Description |
|---|---|
| `jira_list_attachments` | Filename, size, MIME type, uploader, download URL |
| `jira_add_attachment` | Upload a local file |
| `jira_download_attachment` | Download to a local path |
| `jira_delete_attachment` | Delete by ID (`confirm: true`) |

### links

| Tool | Description |
|---|---|
| `jira_list_link_types` | Available link types (Blocks, Relates, Cloners…) |
| `jira_link_issues` | Link two issues |
| `jira_remove_link` | Remove an issue link (`confirm: true`) |
| `jira_list_remote_links` | External URLs attached to an issue |
| `jira_create_remote_link` | Attach an external URL (Confluence page, PR, doc) |
| `jira_delete_remote_link` | Remove one (`confirm: true`) |

### worklogs

| Tool | Description |
|---|---|
| `jira_list_worklogs` | Entries with author, time and comment, plus the total shown |
| `jira_add_worklog` | Log work (`"2h"`, `"1d 4h"`) |
| `jira_update_worklog` | Change time, start or comment |
| `jira_delete_worklog` | Delete an entry (`confirm: true`) |

### metadata

| Tool | Description |
|---|---|
| `jira_get_create_meta` | **What's required to create an issue here.** Lists issue types, then the required fields and their allowed values |
| `jira_get_changelog` | Change history, optionally filtered to one field |

### agile *(opt-in)*

| Tool | Description |
|---|---|
| `jira_list_boards` | Boards, optionally filtered by project |
| `jira_list_sprints` | Sprints on a board, filterable by state |
| `jira_get_sprint_issues` | Issues in a sprint, with optional extra JQL |
| `jira_manage_sprint` | Create, update (including start/close) or move issues into a sprint |

### versions *(opt-in)*

| Tool | Description |
|---|---|
| `jira_list_versions` | Project versions with release state |
| `jira_manage_version` | Create, update or release a version |
| `jira_list_components` | Project components and their leads |

### filters *(opt-in)*

| Tool | Description |
|---|---|
| `jira_list_filters` | Your filters and favourites, or search all visible |
| `jira_get_filter` | One filter with its full JQL |

### labels *(opt-in)*

| Tool | Description |
|---|---|
| `jira_list_labels` | Labels defined across the site |

## Content format

Every content tool takes a `format` parameter — `markdown` (default), `text`, or `adf`.

Markdown is preserved in both directions: headings, bold/italic/strike, inline code, links, bullet/ordered/task lists, fenced code blocks with language, blockquotes, tables, rules, panels and mentions. Verified against 300 real issue descriptions with zero content loss.

- `markdown` — full structure. What you want almost always.
- `text` — the pre-2.0 behaviour: literal, with URLs auto-linked and `[label|url]` wiki markup.
- `adf` — raw [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) JSON, in and out, for full programmatic fidelity.

## Scopes

Most Jira platform endpoints accept **either** a classic scope **or** its granular equivalent — `read:jira-work` or `read:issue:jira`. This server accepts both.

**Jira Software is the exception.** It publishes no classic scopes at all, so the `agile` toolset needs granular ones and cannot be satisfied by `read:jira-work`. Note `read:project:jira` is required alongside the board scope; without it `/rest/agile/1.0/board` returns 401 in a way that looks like a different problem entirely.

> You may find community answers claiming scoped API tokens cannot reach the Jira Software API at all. **That is incorrect**, and we verified it: a token carrying only `read:board-scope:jira-software`, `read:sprint:jira-software`, `write:sprint:jira-software` and `read:project:jira` reads boards and sprints and creates sprints successfully, while returning 401 on every platform endpoint. Details in [docs/research/scoped-tokens-api-reach.md](docs/research/scoped-tokens-api-reach.md).

| Toolset | Classic | Granular alternative |
|---|---|---|
| `core` | `read:jira-work`, `write:jira-work` | `read:issue:jira`, `write:issue:jira`, `read:comment:jira`, `write:comment:jira`, `read:project:jira`, `read:field:jira`, `read:issue-details:jira` |
| `users` | `read:jira-user`, `read:me` | `read:user:jira` |
| `attachments` | `read:jira-work`, `write:jira-work` | `read:attachment:jira`, `write:attachment:jira`, `delete:attachment:jira` |
| `links` | `read:jira-work`, `write:jira-work` | `read:issue.remote-link:jira`, `write:issue.remote-link:jira` |
| `worklogs` | `read:jira-work`, `write:jira-work` | `read:issue-worklog:jira`, `write:issue-worklog:jira` |
| `metadata` | `read:jira-work` | `read:issue-meta:jira`, `read:issue.changelog:jira` |
| `agile` | **none — granular only** | `read:board-scope:jira-software`, `read:sprint:jira-software`, `write:sprint:jira-software`, **plus `read:project:jira`** |
| `versions` | `read:jira-work`, `manage:jira-project` | `read:project-version:jira`, `write:project-version:jira`, `read:project.component:jira` |
| `filters` | `read:jira-work` | `read:filter:jira` |
| `labels` | `read:jira-work` | `read:label:jira` |

Tokens are capped at 50 scopes, so grant what you need rather than everything.

## Safety

1. **Scope enforcement** — a tool whose scope isn't granted is never registered, and is blocked again at call time. The API call never happens.
2. **Read-only default** — with no `JIRA_SCOPES`, only read tools exist.
3. **Project allowlist** — `JIRA_PROJECTS` refuses out-of-scope requests and constrains JQL server-side.
4. **Confirmation on every destructive operation** — issues, comments, worklogs, attachments, links.
5. **No token logging** — tokens are redacted from all error messages.
6. **No admin operations** — no project creation/deletion, workflow changes, or webhook management. Ever.
7. **Loud failures** — a bad scope name stops the server at startup instead of silently registering nothing.

## Troubleshooting

### What the status codes actually mean

On the `api.atlassian.com` gateway these don't mean what they usually mean:

| Code | Real cause |
|---|---|
| **401** | Missing scope, **or the wrong Cloud ID** |
| **403** | The scope check *passed*. The account lacks permission or a product licence |
| **404** on a key you know exists | Wrong base URL — the site URL was used instead of the gateway |

The server's error messages say this, so you shouldn't have to remember it.

### "No projects found" but you can see projects in Jira

There is an unresolved Atlassian defect where a granular-scoped token returns an empty project list instead of a 401. The server flags this rather than reporting it as fact. Check the token has a project-read scope.

### Required custom fields make `jira_create_issue` fail

Ask for `jira_get_create_meta` first. It lists the creatable issue types, then the required fields for one, with allowed values. Most "create failed" reports are a required custom field the model couldn't see.

### Transitions that fail despite `jira_get_transitions`

`jira_get_transitions` reports the fields Jira *declares* for a transition screen. Jira workflows can also carry **validators** that require fields the API never declares (for example "select a team"). Those only surface as a 400 when you attempt the transition. This is an Atlassian API limitation, not something the server can discover in advance.

### Token scopes vs server scopes

Two layers. **Atlassian's scopes** are fixed when the token is created and control what the API allows. **`JIRA_SCOPES`** controls which tools this server exposes, and can only be *more* restrictive. A 403 from Atlassian means the token lacks a scope; a scope-enforcement error from the server means `JIRA_SCOPES` does.

## Development

```bash
git clone https://github.com/deepwired/mcp-jira.git
cd mcp-jira
npm install
npm run build
npm test
```

260 offline tests, no network required. See [CONTRIBUTING.md](CONTRIBUTING.md) for adding tools, and [docs/PARITY-PLAN.md](docs/PARITY-PLAN.md) for the roadmap and the research behind it.

## Note on Package Naming

The GitHub repo is `mcp-jira` but the npm package is `mcp-jira-scoped`. We plan to unify under `mcp-jira` in a future release. For now, use `npx -y mcp-jira-scoped`.

## License

Apache 2.0 — see [LICENSE](LICENSE).
