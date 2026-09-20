# Prioritised Todo List

Status as of v2.0.0. See [docs/PARITY-PLAN.md](docs/PARITY-PLAN.md) for the
reasoning behind what was built and what was deliberately cut, and
[CHANGELOG.md](CHANGELOG.md) for the release history.

## Core Infrastructure
- [x] Scoped API token auth (Basic auth via `api.atlassian.com` gateway)
- [x] Auto Cloud ID resolution from instance name
- [x] Server-side scope enforcement (blocks before API call)
- [x] Classic **and** granular scopes, with any-of equivalence
- [x] `JIRA_TOOLSETS` capability gating
- [x] `JIRA_PROJECTS` project allowlist, enforced at a single dispatch point
- [x] Token sanitization (never logged or leaked)
- [x] Read-only default mode
- [x] Loud startup failure on unrecognised scopes
- [x] Zod input validation on all tools
- [x] Status-code decoder (401 / 403 / 404 mean non-obvious things on this gateway)
- [x] Deterministic tool ordering for client-side caching

## Content
- [x] Bidirectional Markdown ⇄ ADF (headings, emphasis, links, lists, task
      lists, code blocks, quotes, tables, rules, panels, mentions, smart links)
- [x] `format` parameter (`markdown` | `text` | `adf`) on every content tool
- [x] Verified against 300 real issue descriptions — zero content loss

## Issues
- [x] Get, create, update, delete, transition
- [x] Get with custom fields
- [x] Null-clearing on update (`undefined` leaves, `null` clears)
- [x] Transition metadata with required screen fields
- [x] Assign / unassign shortcut
- [x] Create metadata — required fields per project and issue type
- [x] Changelog / history, filterable by field

## Search
- [x] JQL search with token pagination (`nextPageToken`)
- [x] Approximate total count
- [x] Saved filters (list, get)

## Comments
- [x] List, add, update, delete
- [x] Link-aware conversion, round-trip safe

## Projects
- [x] List, get
- [x] Versions (list, create, update, release)
- [x] Components (list)
- [x] Labels (list)

## Users
- [x] Get by account ID, search, get myself

## Links
- [x] Link issues, list link types, remove link
- [x] Remote links (list, create, delete)

## Worklogs
- [x] List, add, update, delete

## Attachments
- [x] List, upload, download, delete

## Boards & Sprints
- [x] List boards, list sprints, sprint issues
- [x] Create / update / start / close sprint, move issues into sprint
- [ ] **Verify against a token carrying `jira-software` scopes** — this is the
      only untested surface in v2.0.0

## Deliberately not built
Cut after surveying 754 issues across the two leading Atlassian MCP servers
(see `docs/research/competitive-landscape.md`):

- **Watchers** — 3 issues and zero reactions across the entire survey
- **Bulk operations** — exactly one issue, zero reactions
- **Dashboards, webhooks, project admin, group management** — no demand evidence found

## Deferred
- **JSM / service desk** — real demand (#4 in the survey) and reachable with
  scoped tokens, but a product expansion with its own scope family
- **Jira Assets / CMDB** — 15 reactions, large surface
- **Multi-site** (`cloudId` per tool) — tool signatures were written to keep
  this an additive retrofit
- **Confluence** — belongs in a sibling package sharing the auth layer, not in
  a server named `mcp-jira`

## Registry & Distribution
- [x] npm package (`mcp-jira-scoped`)
- [x] MCP Registry config (`server.json`)
- [x] Smithery config (`smithery.yaml`)
- [x] Publish to npm (v1.1.0)
- [ ] Publish v2.0.0
- [ ] Register on MCP Registry
- [ ] Register on Smithery.ai
- [ ] Submit to awesome-mcp-servers list

## CI & Quality
- [x] GitHub Actions CI (Node 18, 20, 22)
- [x] Pre-commit hook (secret detection)
- [x] 260 offline tests passing
- [x] Registry integrity tests (every tool has a scope spec, and vice versa)
- [ ] Code coverage reporting
- [ ] Automated npm publish on tag
