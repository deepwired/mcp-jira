# Competitive Landscape and Demand Evidence

**Researched 2026-09-20.** Star/fork counts via `gh api`; npm figures are last-30-days. Demand evidence is a survey of **754 issues** (573 issues + 104 discussions on `sooperset/mcp-atlassian`, 181 on `atlassian/atlassian-mcp-server`) plus ~30 third-party repos and community.atlassian.com.

---

## 1. The field

| Server | Stars | Downloads | Auth | Tools | Gating |
|---|--:|--:|---|--:|---|
| [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) | **5,917** | PyPI n/a | API token, PAT, OAuth 3LO, mTLS, multi-user | **98** (63 Jira + 35 Confluence) | 25 toolsets + `ENABLED_TOOLS` + `READ_ONLY_MODE` |
| [atlassian/atlassian-mcp-server](https://github.com/atlassian/atlassian-mcp-server) (Rovo, hosted) | 1,047 | n/a | OAuth 2.1, API token, service-account Bearer | **~215 total / 46 Jira / 21 advertised** | Primary+deferred split, admin permission groups |
| [nguyenvanduocit/jira-mcp](https://github.com/nguyenvanduocit/jira-mcp) | 97 | n/a (Go) | API token | 23 | `ENABLED_TOOLS` allowlist |
| [b1ff/atlassian-dc-mcp-jira](https://github.com/b1ff/atlassian-dc-mcp-jira) | ~95 *(unconfirmed)* | — | DC PAT | — | — |
| [aashari/mcp-server-atlassian-jira](https://github.com/aashari/mcp-server-atlassian-jira) | 77 | **50,911/mo** | API token | **5** (generic REST passthrough + JMESPath) | N/A by design |
| [George5562/Jira-MCP-Server](https://github.com/George5562/Jira-MCP-Server) | 64 | — | API token | — | none |
| [cosmix/jira-mcp](https://github.com/cosmix/jira-mcp) | 29 | — | — | — | **ARCHIVED** |
| [KS-GEN-AI/jira-mcp-server](https://github.com/KS-GEN-AI/jira-mcp-server) | 26 | — | API token | — | none |
| [freema/mcp-jira-stdio](https://github.com/freema/mcp-jira-stdio) | 14 | 483/wk | API token | 14 | none |
| [mmatczuk/jira-mcp](https://github.com/mmatczuk/jira-mcp) | 11 | n/a (Go) | API token | **4** — *"minimal context overhead"* | N/A by design |
| [criblio/ultra-jira-mcp](https://github.com/criblio/ultra-jira-mcp) | 5 | — | API token **+ scoped ATATT/ATSTT** | **16** consolidated | `JIRA_ENABLED_CATEGORIES` + `JIRA_DISABLED_ACTIONS` |
| [aaronsb/jira-cloud](https://github.com/aaronsb/jira-cloud) | 4 | 140/wk | API token | **7** mega-tools + MCP resources | N/A by design |
| **[deepwired/mcp-jira](https://github.com/deepwired/mcp-jira)** | **3** | **261/mo** | **Scoped tokens only** | **20** | `JIRA_SCOPES`, read-only default, `confirm:true` |

### Scoped API token support — verified

| Server | Scoped tokens? | Evidence |
|---|---|---|
| **mcp-jira-scoped (ours)** | Yes | The entire design |
| **criblio/ultra-jira-mcp** | **Yes** | README: `JIRA_CLOUD_ID` — *"Cloud ID for scoped (ATATT/ATSTT) tokens; auto-fetched if omitted"* |
| **sooperset/mcp-atlassian** | **No** | [Issue #968](https://github.com/sooperset/mcp-atlassian/issues/968) open since 2026-02-23, no implementation |
| Atlassian official | Different model (hosted gateway, OAuth 2.1) — not comparable | |
| Other 9 | **Not individually audited** | Stated plainly rather than guessed |

> **The README's exclusivity claim is no longer defensible.** One confirmed competitor exists — tiny and three weeks old, but the claim is publicly checkable. The differentiation (server-side scope enforcement, read-only default, scoped-token-only design) is intact; the word "only" is not.

### Where the industry is heading: **down**

- sooperset's [roadmap #1104](https://github.com/sooperset/mcp-atlassian/issues/1104) plans **73 tools → ~25** by v1.0.
- The three newest community servers launched at **16, 7, and 4** tools.
- Atlassian advertises **21 of ~215**.

Nobody is adding surface area. We should not be the exception.

---

## 2. Demand ranking — all 16 capabilities

Notation: `40r/20c` = 40 reactions / 20 comments.

| Rank | Capability | Strength | Key evidence | Ours? |
|--:|---|---|---|---|
| **1** | **Attachments (upload)** | **Very strong** | 25+ distinct issues. [atlassian#15](https://github.com/atlassian/atlassian-mcp-server/issues/15) **40r/20c OPEN**; [atlassian#63](https://github.com/atlassian/atlassian-mcp-server/issues/63) 25r/7c OPEN; + ~15 more. sooperset has **download only, no upload** | ✅ **add/list/delete — ahead of both leaders** |
| **2** | Epics / subtasks / links | Strong (reliability, not gap) | ~20 issues, mostly *bug reports on shipped features*. Gap: `jira_get_epic_issues` | Links ✅, no epic-children |
| **3** | Custom field discovery | Strong but satisfied | ~12 issues, mostly CLOSED | ✅ `jira_list_fields` |
| **4** | JSM / service desk | Strong, partly unmet | [sooperset#1165](https://github.com/sooperset/mcp-atlassian/issues/1165) 6r OPEN (Opsgenie EOL driving demand); [atlassian#139](https://github.com/atlassian/atlassian-mcp-server/issues/139) 3r/8c (internal comments) | ❌ |
| **5** | Versions / fixVersions | Moderate | [atlassian#66](https://github.com/atlassian/atlassian-mcp-server/issues/66) **6r/9c OPEN** — most-discussed version request found | ❌ |
| **6** | Worklogs | Moderate (breadth) | Max 4r on any issue, **but a dedicated 45★ server exists** ([tempo-mcp-server](https://github.com/ivelin-web/tempo-mcp-server)). [atlassian#180](https://github.com/atlassian/atlassian-mcp-server/issues/180) 4r OPEN | ❌ |
| **7** | **Boards / sprints** | **Moderate — demand is off-GitHub** | **Zero** feature requests on sooperset (shipped early). [Community thread, 1,389 views, never answered](https://community.atlassian.com/forums/Atlassian-Platform-questions/is-there-a-way-to-get-info-about-a-particular-sprint-using/qaq-p/3031611). Atlassian shipped 6 board/sprint tools in v2 | ❌ |
| **8** | Components | Moderate-weak | 7 issues, all ≤2r | ❌ |
| **9** | Changelog / history | Weak | 3 issues, ≤1r | ❌ |
| **10** | Saved filters | Weak demand / clear gap | 2 issues, **0 reactions**. [#1620](https://github.com/sooperset/mcp-atlassian/issues/1620): *"Entire Filters group missing"* | ❌ |
| **11** | **Bulk operations** | **Very weak** | **Exactly one issue** ([sooperset#510](https://github.com/sooperset/mcp-atlassian/issues/510), 0r/2c). Nothing in the official repo. Official v2 has **no bulk tools** | ❌ |
| **12** | **Watchers** | **Weakest on the list** | **3 issues, 0 reactions total** across 754 surveyed | ❌ |
| **13** | User / group mgmt | Very weak | Read side only; **group mgmt: no evidence** | ✅ read side |
| **14** | Project admin | **No evidence found** | Zero requests. Explicitly out of scope in [#1620](https://github.com/sooperset/mcp-atlassian/issues/1620) | ❌ |
| **15** | Dashboards | **No evidence found** | Zero requests in 754 surveyed | ❌ |
| **16** | Webhooks | **No evidence found** | Zero hits | ❌ |

### Three findings outside the requested list

1. **Two capabilities outrank nearly everything we planned.** [atlassian#83 Label Management](https://github.com/atlassian/atlassian-mcp-server/issues/83) **19r/4c OPEN** and [atlassian#144 Jira Assets/CMDB](https://github.com/atlassian/atlassian-mcp-server/issues/144) **15r/4c OPEN** — together more reaction support than sprints, worklogs, watchers, versions, components, filters, bulk ops, changelogs and dashboards **combined**. Also [JPD Insights](https://github.com/atlassian/atlassian-mcp-server/issues/120) 15r/2c.

2. **The loudest signals in both repos are about *constraining* the server, not extending it.**
   - [atlassian#79 "Restrict MCP to certain spaces and projects"](https://github.com/atlassian/atlassian-mcp-server/issues/79) — **29r/25c OPEN**
   - [atlassian#17 "MCP tool responses too verbose — breaks context window"](https://github.com/atlassian/atlassian-mcp-server/issues/17) — **23r CLOSED**
   - The top two issues in the official repo overall are auth: [#12](https://github.com/atlassian/atlassian-mcp-server/issues/12) **44r**, [#22](https://github.com/atlassian/atlassian-mcp-server/issues/22) **35r**

   **This is our thesis, validated by other people's issue trackers.** Scope enforcement, project restriction and response budgeting are what users are actually asking for.

3. **[sooperset#1620](https://github.com/sooperset/mcp-atlassian/issues/1620)** is a maintainer-quality gap analysis against the full REST surface. It independently corroborates filters, epic-issue listing, worklog update/delete, attachment upload and JSM approvals as the real gaps.

---

## 3. Prior art on gating

### sooperset — 25 toolsets, and a cautionary tale

Toolsets are **tags on the tool** (`@jira_mcp.tool(tags={"jira", "read", "toolset:jira_agile"})`), not a parallel registry. Read/write is an orthogonal tag, so `READ_ONLY_MODE` filters independently. `TOOLSETS` and `ENABLED_TOOLS` intersect. Unknown names are dropped with a warning — **fail-closed**.

Six core toolsets (35 tools) = `default`: `jira_issues` (10), `jira_fields` (2), `jira_comments` (2), `jira_transitions` (2), `confluence_pages` (14), `confluence_comments` (5).

> **The cautionary tale.** They shipped toolsets with a 6-core default in [PR #1041](https://github.com/sooperset/mcp-atlassian/pull/1041), then **reverted the default to `all` the same day** in [PR #1043](https://github.com/sooperset/mcp-atlassian/pull/1043) — *"preventing a breaking change for existing users upgrading."* **As of v0.23.1 the switch still hasn't happened**, two minor versions past its own deadline.
>
> **Lesson: introduce gating additively. Never narrow an existing default.**

Origin of the feature: [issue #259](https://github.com/sooperset/mcp-atlassian/issues/259) — *"Cursor currently has a limit of 40 tools, and this MCP server includes 28 tools by default."*

### Atlassian — discover/execute

~215 tools, 21 advertised. Deferred tools are found via a `discover` tool taking a natural-language description, then invoked through `executeRead` / `executeWrite` / `executeDestructive`. Claimed benefit: *"reducing context window consumption by >50%."*

Their **6 primary Jira tools** — Atlassian's own judgment of the irreducible core — map 1:1 onto tools we already have: `getJiraIssue`, `createJiraIssue`, `editJiraIssue`, `transitionJiraIssue`, `addOrEditJiraIssueComment`, `searchJiraIssuesUsingJql`. **We have all six.**

Costs: two extra round-trips per deferred call; natural-language dispatch fails as silent misroutes rather than type errors; schemas invisible up front so the model can't plan multi-step sequences; gateways needing a static manifest break (hence `?tools=all`); risk tiers are coarse.

### GitHub — 22 toolsets, and the consolidation reversal

Default is `context`, `repos`, `issues`, `pull_requests`, `users` (docs say 5; `pkg/github/tools.go` marks 6, including `copilot` — an unresolved discrepancy). Stated purpose: *"Enabling only the toolsets that you need can help the LLM with tool choice and reduce the context size."*

**They consolidated, measured a real win, then reversed it.**

| Change | Before → After |
|---|---|
| PR review tools | 4 → `pull_request_review_write` |
| Issue read tools | 4 → `issue_read` |
| Actions tools | **16 → 3** |
| Projects tools | **11 → 3** — *"reduced token usage by approximately 23,000 tokens (50%)"* |

Then [PR #2306](https://github.com/github/github-mcp-server/pull/2306), verbatim:

> The existing consolidated tools use a `method` parameter […] **This makes it impossible to selectively enable individual operations — you either get all of `issue_write` or none of it.**

`issue_write` was decomposed into **11** single-purpose tools; `pull_request_review_write` into **9**. They now maintain **both surfaces in parallel**, the granular one behind `--features` flags (`issues_granular`, `pull_requests_granular`).

**They also removed dynamic toolset discovery entirely** ([PR #2512](https://github.com/github/github-mcp-server/pull/2512), v1.1.0, 2026-05-20), deleting `enable_toolset` / `list_available_toolsets` / `get_toolset_tools` as *"tech debt cleanup."* A maintainer comment admits the security gap: the model could escape the operator's `--read-only`. Post-removal, `server.go` declares `listChanged: false`.

> Caveat for public citation: **no GitHub blog post or changelog ever announced dynamic discovery.** The only first-party rationale is [issue #275](https://github.com/github/github-mcp-server/issues/275) and PR #2512.

**Two patterns worth stealing:**
1. **Per-toolset server instructions** — each enabled toolset contributes prose to the `instructions` field, with cross-toolset conditionality.
2. **Deprecated tool aliases** — a 27-entry rename map, silently resolved. *This is the mechanism that makes consolidation non-breaking.*

---

## 4. The spec blesses credential-derived filtering

MCP spec `2026-07-28`, verbatim:

> This set **MAY** be empty and **MAY** change over time […] but **MUST NOT** vary per-connection or as a side effect of other requests on the connection. **The set MAY vary by the authorization presented on the request — for example, returning only the tools the caller's granted scopes permit — since credentials are per-request input, not connection state.**

Scope-derived tool and schema filtering — exactly what `JIRA_SCOPES` does — is explicitly permitted. Model-driven `enable_toolset` mutation is what the "side effect of other requests" clause rules out.

The spec also notes deterministic tool ordering *"enables clients to reliably cache the tool list and improves LLM prompt cache hit rates."*

---

## 5. Research gaps, stated plainly

- **PyPI downloads for sooperset**: not obtained (pypistats 429, pepy needs a key). Stars are the only adoption proxy.
- **Scoped-token support for 9 of 13 servers**: not individually audited.
- **Tool counts** for b1ff, George5562, KS-GEN-AI, vish288: not counted from source.
- **GitHub's `copilot` default discrepancy**: docs say 5, code says 6. Not resolved by running the binary.
- **Atlassian's ~215 total**: a row count of their reference page, not a published figure. The 46 Jira figure is firmer.
- **Cursor's 40-tool cap**: community forums only, **absent from [official Cursor docs](https://cursor.com/docs/context/mcp)**. Cite as "widely believed", not fact. VS Code's 128-tool cap *is* confirmed.
