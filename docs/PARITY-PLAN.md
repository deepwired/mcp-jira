# Rovo Parity Plan

**Started 2026-09-20.** Branch: `feat/parity-phases-0-4`.

Goal: close the functional gap between `mcp-jira-scoped` and Atlassian's Rovo Jira connector, and go past it where the Jira Cloud REST API allows and Rovo doesn't bother.

Supporting research:
- [`research/scoped-tokens-api-reach.md`](research/scoped-tokens-api-reach.md) — what scoped tokens can actually call, and the scope gotchas
- [`research/tool-surface-scaling.md`](research/tool-surface-scaling.md) — why we gate tools behind toolsets instead of shipping ~50 always-on

---

## Current state

20 registered tools (the README's "14" is stale), single-site, 4 classic scopes, clean `auth` / `client` / `scopes` / `tools` separation. The architecture is sound; the surface is narrow.

---

## Phase 0 — Correctness defects found during review

These are bugs in shipped code, not missing features. They land first.

### 0.1 `jira_search` pagination is broken — `src/tools/search.ts:36`

The tool sends `startAt` to `/rest/api/3/search/jql`. **That endpoint dropped offset pagination.** It silently ignores `startAt` and returns the first page every time. Anything past the first 20 results is currently unreachable, and the `isLast` hint we print tells the model to "increase startAt", which does nothing.

Fix: switch to `nextPageToken`. The endpoint also does not return `total` — use `POST /search/approximate-count` (scope `read:issue-details:jira`) when a count is genuinely needed.

### 0.2 `parseScopes` silently registers zero tools — `src/auth.ts:76-79`

`parseScopes` filters out anything not in its 4-scope allowlist. Set `JIRA_SCOPES="read:issue:jira"` — a perfectly valid granular scope — and you get `[]`, which makes `getAvailableTools([])` return `[]`. **The server starts with no tools, no error, and no log line.**

Fix: reject unknown scopes loudly at startup. This becomes more urgent in Phase 2, where granular scopes become first-class.

### 0.3 `jira_update_issue` cannot clear a field — `src/tools/issues.ts:206-217`

Every assignment is guarded by `!== undefined`, so there is no path to send an explicit `null`. Rovo's `editJiraIssue` supports this and calls out the motivating case: clearing `resolution` is the standard fix for a reopened issue that refuses to transition.

### 0.4 Silent-empty guard (from research)

There is an unresolved, dated report of a granular-scoped token returning `[]` from `GET /project` while a classic token returns 148 projects — same site, same admin, no error. An empty array instead of a 401 is the worst failure mode for an MCP server, because the model reports "you have no projects" as fact.

Fix: when the token authenticates but a list endpoint returns empty, emit a diagnostic rather than a cheerful "No projects found."

### 0.5 Error decoder in `client.ts`

Consistent across every source reviewed, and it resolves most of what users would otherwise file issues about:

| Code | Real meaning |
|---|---|
| 401 `scope does not match` | Missing scope, **or wrong cloudId** |
| 403 | The *account* lacks permission/license — the scope check **passed** |
| 404 on a valid key | Wrong base URL (site URL instead of the `api.atlassian.com/ex/jira/{cloudId}` gateway) |

### 0.6 Minor

- `src/index.ts:49` hardcodes version `1.0.0`; `package.json` says 1.2.0.
- `client.request` drops the body for non-POST/PUT and has no PATCH support.
- 429 handling parses `Retry-After` but never retries.
- `jira_get_issue`'s default field list omits `parent` / `subtasks` / `fixVersions`, which `formatIssue`'s `STANDARD_FIELDS` is already prepared to render — so they never appear.
- README tool count (14 → 20).
- **The README's exclusivity claim is now false.** "The only MCP server for Jira that works with Atlassian's scoped API tokens" no longer holds — `criblio/ultra-jira-mcp` supports them too. The claim is publicly checkable and should be softened to something accurate and still differentiating (server-side scope enforcement and read-only-by-default remain genuinely uncommon).

---

## Phase 1 — Content fidelity (ADF)

**The single biggest quality gap versus Rovo**, and it improves nine existing tools without adding one to the surface.

Today `plainTextToAdf` emits only paragraphs plus links, and `extractTextFromAdf` flattens everything else. Headings, lists, code blocks, tables, panels, and blockquotes are destroyed in both directions. Reading a formatted description and writing it back is lossy.

**Verified against real data.** `TRAP-5466` on the BrowserStack instance has H2 headings, a blockquote, a 14-row markdown table, task-list checkboxes, inline code spans, and nested bold/italic. Under the current converter the table collapses into undelimited cell text and the headings, blockquote, and checkboxes vanish entirely. That issue is our reference fixture, and Rovo's own markdown rendering of it is the expected output to diff against.

Work:
- New `src/adf.ts` with a real bidirectional converter: headings, bold/italic/strike/code, bullet + ordered lists, task lists, code blocks, tables, blockquotes, panels, links, mentions, horizontal rules.
- A `format: 'markdown' | 'adf' | 'text'` parameter on `jira_get_issue`, `jira_list_comments`, `jira_add_comment`, `jira_update_comment`, `jira_create_issue`, `jira_update_issue` — mirroring Rovo's `contentFormat` / `responseContentFormat` split.

**Open decision:** hand-rolled converter vs a dependency. The package currently has exactly two runtime deps (`@modelcontextprotocol/sdk`, `zod`), and a lean dependency tree is part of the security positioning. Leaning hand-rolled.

---

## Phase 2 — Scope model rework

Must land **before** Phase 3, because every new tool needs scopes and gating.

1. **Accept granular scopes alongside classic.** The research doc has the full endpoint→scope mapping.
2. **Change `TOOL_SCOPE_MAP` semantics from "all required" to "each requirement satisfied by *any* acceptable scope"** — so `jira_get_issue` is satisfied by `read:jira-work` **or** `read:issue:jira`. Currently `required.every(...)` cannot express this.
3. **Add `JIRA_TOOLSETS` gating.** See `research/tool-surface-scaling.md` for the reasoning. Default to a lean ~20–25 tool subset; `all` as the escape hatch.
4. **Fail loudly on unknown scopes** (Phase 0.2).

**Scope budget matters.** Atlassian caps tokens at **50 scopes**, and granular scope sets are large — `POST /filter` alone requires `write:filter:jira` plus twelve reads. The README must ship a copy-pasteable scope list per toolset, because scopes **cannot be read back from a token or edited after creation**; changing them means minting a new token.

---

## Phase 3 — Rovo parity fill

| Tool | Endpoint | Notes |
|---|---|---|
| `jira_get_myself` | `/rest/api/3/myself` | whoami + cheapest connection healthcheck |
| `jira_get_create_meta` | `/issue/createmeta/{p}/issuetypes[/{id}]` | Required fields per project/issue type. Rovo has this; we only have a *global* field list, so `jira_create_issue` currently fails blind on required custom fields |
| `jira_get_changelog` | `/issue/{k}/changelog` | Needs `read:issue.changelog:jira` |
| Worklogs (list/add/update/delete) | `/issue/{k}/worklog` | Rovo has add+update only — we go further |
| Remote links (list/create/delete) | `/issue/{k}/remotelink` | `POST` also needs `write:issue:jira` |
| `jira_delete_comment` | `/issue/{k}/comment/{id}` | |
| `jira_assign_issue` | `/issue/{k}/assignee` | |
| `jira_remove_link` | `/issueLink/{id}` | |
| Generic `fields` map on update | — | Matches `editJiraIssue`; supersedes the fixed 5-field allowlist |
| `expand` support | — | Unlocks `renderedFields`, `changelog`, `names` |

After this we are at or ahead of Rovo on Jira Cloud platform, minus the two proprietary tools (Rovo Search, Teamwork Graph) which are not replicable.

---

## Phase 4 — Past parity, re-scoped by demand evidence

Revised after the competitive/demand research ([`research/competitive-landscape.md`](research/competitive-landscape.md)). The original Phase 4 list was built on what the REST API *offers*, not on what anyone *asks for*. Surveying 754 issues across the two leading servers changed three items.

### Cut

| Area | Why |
|---|---|
| **Watchers** | **The weakest signal in the entire survey** — 3 issues, **0 reactions total** across 754. sooperset shipped it and nobody reacted. Cost without demand |
| **Bulk operations** | **Exactly one issue, 0 reactions**, open since 2025-06 with the author saying *"might do it myself if I find time."* Atlassian's official v2 has no bulk tools either |
| Dashboards, webhooks, project admin, group management | **No evidence found** in 754 issues. Explicitly out of scope in sooperset's own gap analysis |

### Build

| Area | Demand | Notes |
|---|---|---|
| **Boards & sprints** | Moderate; demand sits **off**-GitHub (a 1,389-view community thread, never answered). Atlassian shipped 6 tools in v2 | `GET /rest/agile/1.0/board` needs `read:board-scope:jira-software` **and** `read:project:jira`. **Build issue listing against `/rest/software/1.0/`** — the agile backlog/board-issue/sprint-issue/epic-issue routes are deprecated |
| **Versions** | Moderate — [atlassian#66](https://github.com/atlassian/atlassian-mcp-server/issues/66) 6r/9c is the most-discussed version request found anywhere | Creates/updates need **`manage:jira-project`**. `GET /rest/api/3/version` **does not exist** — use `/project/{key}/version` |
| **Components** | Moderate-weak, but cheap alongside versions | |
| **Saved filters** | Weak demand, but a clean unmet gap both leaders have | `GET /rest/api/3/filter` **was removed** — use `/filter/search` and `/filter/my` |
| **Attachment download** | Completes our strongest area (see below) | |

### Add — not in the original plan, higher demand than things that were

| Area | Demand |
|---|---|
| **Labels** | [atlassian#83](https://github.com/atlassian/atlassian-mcp-server/issues/83) **19r/4c OPEN** — outranks sprints, worklogs, watchers, versions, components, filters and bulk ops individually |
| **`JIRA_PROJECTS` scoping** | [atlassian#79](https://github.com/atlassian/atlassian-mcp-server/issues/79) **29r/25c OPEN** — the single loudest unmet request found, unaddressed by *both* leaders, and architecturally identical to the scope-derived schema work in Phase 2. **This is the highest-leverage item on the whole plan** |

### Market, don't build

**Attachments are the #1 requested capability** — 25+ distinct issues, one with 40 reactions. sooperset has download only, **no upload**. We already ship add/list/delete. We are ahead of both leaders on the most-wanted capability in the category and the README doesn't mention it.

### Deferred

- **JSM** — strong demand (#4) and reachable with scoped tokens, but it's a product expansion with its own scope family. Own decision, own release.
- **Jira Assets / CMDB** — [atlassian#144](https://github.com/atlassian/atlassian-mcp-server/issues/144) 15r/4c. Real demand, large surface.

---

## Tool budget

| | Count |
|---|--:|
| Today | 20 |
| + Phase 3 (parity fill) | ~30 |
| + Phase 4 as originally scoped | ~52 |
| + Phase 4 re-scoped, with read/write pairing | **~42** |

~42 is past the documented 30–50 accuracy knee, so **gating is required regardless of consolidation**. Two mechanisms, both additive:

1. **Risk-tier pairing** instead of granular CRUD tools: `jira_worklog_read` / `jira_worklog_write` rather than four separate worklog tools. Roughly 12 tools saved.
2. **`JIRA_TOOLSETS` gating** with the default set to *today's surface plus Phases 0–3*, and all of Phase 4 opt-in.

**The default must never narrow.** sooperset shipped a 6-core default and reverted it to `all` the same day to avoid breaking upgrades — and two minor versions later still hasn't switched back. Gating gets introduced additively or not at all.

---

## Phase 5 — Deferred

**Multi-site** (`cloudId` per tool, env var as default). Out of scope for this branch, but every Phase 3/4 tool signature is being written so this stays an additive retrofit rather than a rewrite.

**Confluence / JSM.** Both are reachable with scoped tokens (research doc §3). Confluence is a product decision, not a parity item — if taken, it belongs in a sibling package sharing the auth/client layer, not bolted onto a server named `mcp-jira`.

---

## Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | **Build agile support** | The blocking claim was factually backwards. Confirmed on a live tenant 2026-09-20: granular-only token, 200 on board and sprint reads and writes. See research doc §1 |
| D2 | **Static toolset gating, lean default** | 50 tools sits inside the documented 30–50 degradation band and above Cursor's silent 40-tool truncation. See `tool-surface-scaling.md` |
| D3 | **No in-server dynamic tool discovery** | Mutating tool definitions invalidates the entire prompt cache; Claude Code already defers MCP tools; it wouldn't help Cursor anyway, which caps before our search tool could run |
| D4 | **Explicit `JIRA_SCOPES` config stays** | Scopes cannot be read back from a token or edited. Auto-detection is impossible |
| D5 | **Prefer granular scopes in docs** | Guaranteed present in the picker; classic scopes have a documented gap history (Atlassian ID-9094) |
| D6 | **Build against `/rest/software/1.0/`** for agile issue listing | The `/rest/agile/1.0/` equivalents are deprecated |
| D7 | **Cut watchers and bulk ops** | Watchers: 3 issues / 0 reactions across 754 surveyed — the weakest signal found. Bulk: exactly one issue, 0 reactions. Neither earns its maintenance |
| D8 | **Add labels and `JIRA_PROJECTS` scoping** | Both outrank most of the original Phase 4 on reaction count. `JIRA_PROJECTS` (29r) is the loudest unmet request in the category and plays directly to our positioning |
| D9 | **Risk-tier pairing, not action dispatch** | GitHub consolidated to `method`-dispatched tools, won ~50% tokens, then hit *"impossible to selectively enable individual operations — you either get all of `issue_write` or none of it"* and decomposed it back into 11 tools maintained as a parallel surface. Scope enforcement **is our product**; a bare `action` param would weaken the core claim. `jira_x_read` / `jira_x_write` keeps gating trivially correct with no dynamic-schema drift risk, at a cost of ~5 extra tools |
| D10 | **Gating is additive; the default never narrows** | sooperset shipped a narrowed default and reverted it the same day as a breaking change; still unreverted two minor versions later |
| D11 | **Ship a deprecated-alias map before any renaming** | GitHub's 27-entry silent-resolution map is what makes consolidation non-breaking. Cheap now, impossible to retrofit |
| D12 | **Market attachments** | The #1 requested capability in the category (25+ issues, one at 40r). sooperset has download only, no upload. We ship add/list/delete and don't mention it |

---

## Open questions / smoke tests

1. ~~**Agile reachability**~~ — **RESOLVED 2026-09-20.** A token carrying only
   the four `jira-software` scopes returned **200** from `/rest/agile/1.0/board`
   and `/board/{id}/sprint`, while every platform endpoint returned 401 for want
   of a classic scope. Create, update and move-issues all succeeded. The
   community claim that scoped tokens cannot reach the Software API is wrong.
   See `research/scoped-tokens-api-reach.md` §1.
2. ~~**POST behaviour on granular scopes**~~ — **DISPROVEN 2026-09-20.** The
   report claiming granular-scoped tokens 401 on every POST does not reproduce:
   `POST /rest/agile/1.0/sprint` and `POST /sprint/{id}/issue` both succeeded on
   a token holding only granular scopes.
3. **ADF converter: dependency or hand-rolled?** (Phase 1)
4. **Default toolset membership** — settled by D10: the default is today's 20 tools plus everything Phases 0–3 add. Phase 4 is opt-in.

## Cheap wins to fold in

Identified during research, all low-cost and independent of the phases:

- **Deterministic tool ordering.** MCP spec `2026-07-28`: *"Deterministic ordering enables clients to reliably cache the tool list and improves LLM prompt cache hit rates."*
- **Per-toolset server instructions** (GitHub's pattern) — each enabled toolset contributes prose to the `instructions` field. Directly mitigates the discoverability loss from gating.
- **README corrections** — tool count 14 → 20; soften the exclusivity claim; surface attachment support prominently (D12).
- **Response budgeting.** [atlassian#17](https://github.com/atlassian/atlassian-mcp-server/issues/17) — *"MCP tool responses too verbose — breaks context window"* — 23 reactions. Worth auditing our formatters against.

---

## Testing approach

The existing 91 tests are fully offline with mocked `fetch`. That pattern continues, with one upgrade: **fixtures captured from real Jira payloads** rather than invented ones.

Known limitation, stated plainly: offline tests prove the code does what we think it does. They cannot catch a wrong field name in a request body or a changed endpoint contract. Only a live smoke test catches those, and the two smoke tests above are the minimum before release.
