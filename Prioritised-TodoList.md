# Prioritised Todo List

## Core Infrastructure
- [x] Scoped API token auth (Basic auth via `api.atlassian.com` gateway)
- [x] Auto Cloud ID resolution from instance name
- [x] Server-side scope enforcement (blocks before API call)
- [x] Token sanitization (never logged or leaked)
- [x] Read-only default mode
- [x] Zod input validation on all tools
- [x] Error handling (401, 403, 404, 429, timeout, malformed JSON)

## Issue Tools
- [x] Get issue by key
- [x] Get issue with custom fields (`includeCustomFields: true` returns all `customfield_*` values)
- [x] Create issue (with custom fields support)
- [x] Update issue (with custom fields support)
- [x] Delete issue (with `confirm: true` safety guard)
- [x] Transition issue (list transitions + execute, with `fields` and `comment` for transition screens)
- [x] Get transition metadata with required screen fields (`jira_get_transitions` with `?expand=transitions.fields`)
- [ ] Assign issue (dedicated shortcut tool)
- [ ] Get create metadata (discover required fields per project/issue type)

## Search
- [x] JQL search with pagination (via `/search/jql`)
- [ ] Saved filters (list and execute)

## Comments
- [x] List comments on an issue
- [x] Add comment (plain text auto-converted to ADF)
- [ ] Edit comment
- [ ] Delete comment

## Projects
- [x] List projects
- [x] Get project details

## Users
- [x] Get user by account ID
- [x] Search users by name/email
- [ ] Get myself (whoami / connection check)

## Issue Links
- [x] Link two issues
- [x] List link types
- [ ] Remove issue link

## Watchers
- [ ] List watchers on an issue
- [ ] Add watcher
- [ ] Remove watcher

## Worklogs
- [ ] List worklogs on an issue
- [ ] Add worklog
- [ ] Delete worklog

## Attachments
- [x] List attachments on an issue (`jira_list_attachments`)
- [x] Upload attachment from local file path (`jira_add_attachment`)
- [x] Delete attachment with safety guard (`jira_delete_attachment`)
- [ ] Download attachment content

## Fields
- [x] List all fields including custom fields (`jira_list_fields`, optional `customOnly` filter)

## Boards & Sprints
- [ ] List boards
- [ ] Get board details
- [ ] List sprints for a board
- [ ] Get sprint issues
- [ ] Move issues between sprints

## Registry & Distribution
- [x] npm package (`mcp-jira-scoped`)
- [x] MCP Registry config (`server.json`)
- [x] Smithery config (`smithery.yaml`)
- [ ] Publish to npm
- [ ] Register on MCP Registry
- [ ] Register on Smithery.ai
- [ ] Submit to awesome-mcp-servers list

## CI & Quality
- [x] GitHub Actions CI (Node 18, 20, 22)
- [x] Pre-commit hook (secret detection)
- [x] 59 offline tests passing
- [ ] Code coverage reporting
- [ ] Automated npm publish on tag
