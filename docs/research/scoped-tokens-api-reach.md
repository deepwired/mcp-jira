# What Scoped API Tokens Can Actually Reach

**Researched 2026-09-20.** Sources are Atlassian's live OpenAPI specs (the documents that generate the "OAuth scopes required" boxes on developer.atlassian.com) plus dated, empirically-confirmed community reports.

This document exists because the most-cited community answer on this topic is wrong, and that wrong answer nearly cost this project its agile feature set.

---

## TL;DR

| Question | Answer | Confidence |
|---|---|---|
| Scoped token → `/rest/agile/1.0/*` (boards, sprints)? | **Yes — confirmed empirically 2026-09-20.** The widely-repeated "no" is factually backwards. | **Verified** |
| Scoped token → `/rest/servicedeskapi/*` (JSM)? | **Yes.** Both classic and granular scopes documented. | Medium-high |
| Is there a published list of picker-selectable scopes? | **No.** The picker draws from the OAuth 2.0 3LO/Forge catalogs. | Medium-high |
| Do worklogs / watchers / remote links / createmeta / filters / versions / components / bulk / changelog work? | **Yes**, all of them — with gotchas below. | High (docs), Medium (untested live) |
| Rate-limit difference vs classic tokens? | **No documented difference** today. | High |

---

## 1. The agile question, settled

The claim circulating in Atlassian Community — *"The Software API has no granular scopes, so you can't use a scoped API token with the software API endpoint"* — is the **exact inverse of reality**.

Atlassian's own documentation states verbatim:

> Jira Software doesn't support classic scopes. Use granular scopes instead.

Verified structurally: **every one of the 78 `/rest/agile/1.0/*` and `/rest/software/1.0/*` operations** in the Jira Software OpenAPI spec carries granular scopes in its `security` block. There is no classic/granular split because there are no classic scopes to split from. (The only scope-less operations in that spec are the Connect/Forge-only DevOps ingestion APIs.)

### Scopes by endpoint

| Endpoint | Scopes |
|---|---|
| `GET /rest/agile/1.0/board` | `read:board-scope:jira-software`, `read:project:jira` |
| `GET /board/{id}/configuration` | `read:board-scope.admin:jira-software`, `read:project:jira` |
| `GET /board/{id}/sprint` | `read:sprint:jira-software` |
| `GET /board/{id}/epic` | `read:epic:jira-software` |
| `GET /board/{id}/version` | `read:board-scope:jira-software` |
| `GET /sprint/{id}` | `read:sprint:jira-software` |
| `POST /sprint`, `POST/PUT /sprint/{id}`, `POST /sprint/{id}/issue` | `write:sprint:jira-software` |
| `DELETE /sprint/{id}` | `delete:sprint:jira-software` |
| `PUT /rest/agile/1.0/issue/rank` | `write:issue:jira-software` |
| `PUT /epic/{key}/rank`, `POST /epic/{key}/issue` | `write:epic:jira-software` |
| `POST /rest/agile/1.0/backlog/issue` | `write:board-scope:jira-software` |
| `POST /board/{id}/issue` | `write:board-scope:jira-software` |
| `GET /rest/agile/1.0/issue/{key}` | `read:issue:jira-software` |
| `PUT /issue/{key}/estimation` | `write:issue:jira-software`, `read:issue-details:jira` |

### Confirmed on a live tenant, 2026-09-20

We settled this ourselves rather than relying on the record. A scoped API token
was minted against `browserstack.atlassian.net` carrying **only** these four
scopes — no classic scopes at all:

```
read:board-scope:jira-software   read:sprint:jira-software
write:sprint:jira-software       read:project:jira
```

Results through `https://api.atlassian.com/ex/jira/{cloudId}`:

| Request | Status |
|---|---|
| `GET /rest/agile/1.0/board` | **200** |
| `GET /rest/agile/1.0/board/{id}/sprint` | **200** |
| `POST /rest/agile/1.0/sprint` (create) | **200** |
| `POST /rest/agile/1.0/sprint/{id}` (update) | **200** |
| `POST /rest/agile/1.0/sprint/{id}/issue` (move issues) | **200** |
| `GET /rest/agile/1.0/board/{id}` (board config) | 401 — needs `read:board-scope.admin:jira-software` |
| `GET /rest/software/1.0/board/{id}/issue` | 401 — needs `read:issue-details:jira` |
| `DELETE /rest/agile/1.0/sprint/{id}` | 401 — needs `delete:sprint:jira-software` |
| `GET /rest/api/3/myself` | 401 — no classic scope on this token |
| `GET /rest/api/3/issue/{key}` | 401 — no classic scope on this token |

The platform 401s are the control: they prove the agile 200s came from the
`jira-software` scopes and nothing else. The three scope-specific 401s prove
enforcement is granular and exactly as documented.

**The picker does offer jira-software scopes.** All four were selectable when
creating an "API token with scopes" with Jira as the app — which also resolves
the open question in §2 below.

### Earlier empirical confirmations from the record

- **2025-11-21** — A service-account scoped token successfully hits `/rest/agile/1.0/board`. The reporter had `read:board-scope.admin:jira-software` + `read:board-scope:jira-software` and got 401 until adding **`read:project:jira`** — exactly matching the spec. The same thread shows the admin token-listing API returning those jira-software scopes, proving they are mintable on a scoped token.
- **2026-04-20/21** — A second Community Champion replies to the "no granular scopes" claim with *"I tested and it works for me when I will add right scopes selected."* The OP confirms with a working request against `/board/{id}/sprint?state=active` using `read:board-scope:jira-software`, `read:issue-details:jira`, `read:sprint:jira-software`.
- **2026-08-14** — A commercial vendor ships a production 16-scope list for scoped tokens including six jira-software scopes, with instructions to search for them in the token picker.

### Did the behaviour change over time?

No. There is **no entry in the Atlassian OAuth 2.0 changelog** about scoped API tokens, the `api.atlassian.com/ex/jira` gateway, or jira-software scope availability. The capability appears to have worked since at least Nov 2025. The conflict is a documentation vacuum being filled by a confidently-wrong community answer, not a behaviour change — the original Oct 2025 claim was already contradicted by a working report within a month.

### Deprecation gotcha

These are all marked `deprecated: true`:

- `GET /rest/agile/1.0/board/{id}/backlog`
- `GET /rest/agile/1.0/board/{id}/issue`
- `GET /rest/agile/1.0/sprint/{id}/issue`
- `GET /rest/agile/1.0/epic/{key}/issue`

Use the `/rest/software/1.0/` equivalents (same scopes, plus `read:issue-details:jira` and `read:jql:jira`). Those also add `.../approximate-count` variants. **Build issue listing against `/rest/software/1.0/`.**

---

## 2. Which scopes are selectable in the token picker

**No authoritative published list exists.** Atlassian's support pages say only "view, write, and delete content in Jira and Confluence", offer `read:jira-work` / `write:jira-work` as "typical", and link out to the OAuth 2.0 3LO/Forge scope catalogs. Those catalogs are the closest thing to authoritative — the picker is fed from them:

- Jira platform: 6 classic + ~170 granular
- Jira Software: granular only
- JSM: 3 classic + granular

The picker is a **searchable free-text box**, not a browsable tree, which is why people conclude scopes are "missing" when they simply didn't search the right string.

### There is a real history of picker gaps

Atlassian bug **ID-9094** (*"JSM classic scopes are unavailable during credential creation for API/service account scopes"*) was created 2025-09-24 and **resolved Fixed 2025-11-24**. So: Sept–Nov 2025 the picker genuinely had gaps, which produced a wave of "JSM isn't an option" reports that are still cited today. Fixed since Nov 2025. A May 2026 report confirms `read:servicedesk-request` visible in the picker.

**Treat any "scope X isn't in the picker" report as a possible transient Atlassian-side gap, not a hard limit.**

### Two constraints that shape the design

1. **Scopes cannot be read back after token creation** — not from the GUI, not from any API. (Open feature request AX-1687.)
2. **Scopes cannot be edited.** A scope change means minting a new token.

Together these mean **scope auto-detection is impossible**, which retroactively justifies this project's explicit `JIRA_SCOPES` configuration model. There is also a **50-scope-per-token ceiling**, and granular scope sets are large enough that this is a real budget — see the scope-budget note in `docs/PARITY-PLAN.md`.

---

## 3. JSM (`/rest/servicedeskapi/*`)

Works. Most operations carry both a classic and a granular set.

| Endpoint | Classic | Granular |
|---|---|---|
| `GET /servicedeskapi/servicedesk` | `read:servicedesk-request` | `read:servicedesk:jira-service-management` |
| `GET /servicedesk/{id}/requesttype` | `read:servicedesk-request` | `read:requesttype:jira-service-management` |
| `GET /servicedeskapi/request` | `read:servicedesk-request` | `read:request:jira-service-management`, `read:user:jira` |
| `POST /servicedeskapi/request` | `write:servicedesk-request` | `read:request:…`, `write:request:jira-service-management`, `read:user:jira` |
| `GET/POST /request/{key}/comment` | `read:`/`write:servicedesk-request` | `read:`/`write:request.comment:jira-service-management`, `read:user:jira` |
| `GET/POST /request/{key}/transition` | `read:`/`write:servicedesk-request` | `read:`/`write:request.status:jira-service-management`, `read:user:jira` |
| `GET /servicedesk/{id}/queue` | **`read:jira-work`** | `read:queue:jira-service-management`, `read:user:jira`, `read:jql:jira` |

**Always include `read:user:jira`** with the granular set — there are multiple dated reports of 401/empty responses that were resolved by adding exactly that scope.

**Confirmed 2026-02-18:** a scoped service-account token with `read:jira-work` + `read:servicedesk-request` called `/rest/servicedeskapi/request/KAN-1` on the gateway. The initial 404 was caused by using the site URL; on the gateway it returned **403**, then worked once the service desk roles were configured. A 403 rather than 401 is the tell that the scope check passed.

Prefer **granular** JSM scopes: they are guaranteed present in the picker, whereas the classic ones have the ID-9094 gap history.

---

## 4. Platform endpoint scopes

| Endpoint | Granular | Classic |
|---|---|---|
| `GET /issue/{k}/worklog` | `read:issue-worklog:jira`, `read:issue-worklog.property:jira`, + `read:group/project-role/user/avatar:jira` | `read:jira-work` |
| `POST /issue/{k}/worklog` | `write:issue-worklog:jira`, `write:issue-worklog.property:jira` + the reads above | `write:jira-work` |
| `GET /issue/{k}/watchers` | `read:issue.watcher:jira`, `read:user:jira`, `read:avatar:jira` | `read:jira-work` |
| `POST`/`DELETE /issue/{k}/watchers` | `write:issue.watcher:jira` | `write:jira-work` |
| `GET /issue/{k}/remotelink` | `read:issue.remote-link:jira`, `read:status:jira` | `read:jira-work` |
| `POST /issue/{k}/remotelink` | `write:issue.remote-link:jira`, `read:issue.remote-link:jira`, **`write:issue:jira`** | `write:jira-work` |
| `GET /issue/createmeta/{p}/issuetypes[/{id}]` | `read:issue-meta:jira`, `read:avatar:jira`, `read:field-configuration:jira` | `read:jira-work` |
| `GET /filter/search`, `/filter/my`, `/filter/{id}` | `read:filter:jira`, `read:jql:jira`, + 7 more reads | `read:jira-work` |
| `POST /filter` | `write:filter:jira` + 12 reads | `write:jira-work` |
| `GET /project/{p}/version[s]`, `GET /version/{id}` | `read:project-version:jira` | `read:jira-work` |
| `POST /version`, `PUT /version/{id}` | `write:project-version:jira`, `read:project-version:jira` | **`manage:jira-project`** |
| `GET /component` | `read:project.component:jira`, + 5 more reads | `read:jira-work` |
| `POST /component` | `write:project.component:jira` + the reads | **`manage:jira-project`** |
| `GET /bulk/issues/fields`, `/bulk/issues/transition` | `read:issue:jira` | `read:jira-work` |
| `POST /bulk/issues/{fields,move,transition,delete,watch,unwatch}` | `write:issue:jira`, `read:issue:jira` | `write:jira-work` |
| `POST /search/approximate-count` | **`read:issue-details:jira`**, `read:field:jira`, + 3 more | `read:jira-work` |
| `GET /issue/{k}` (incl. `?expand=changelog`) | `read:issue:jira`, `read:issue.changelog:jira`, `read:issue-meta:jira`, + 6 more | `read:jira-work` |
| `GET /issue/{k}/changelog` | `read:issue.changelog:jira`, `read:issue-meta:jira`, `read:avatar:jira` | `read:jira-work` |

### Six things that will bite

1. **Two routes in our original Phase 4 sketch do not exist.** `GET /rest/api/3/filter` was removed — use `/filter/search` or `/filter/my`. `GET /rest/api/3/version` never existed — use `GET /project/{key}/version` (paginated) or `/versions`.
2. **Bulk ops use counter-intuitive scopes.** `bulk/issues/delete` wants `write:issue:jira`, **not** `delete:issue:jira`. `bulk/issues/watch` wants `write:issue:jira`, **not** `write:issue.watcher:jira`. Requesting the logical-looking scope fails.
3. **Bulk ops render `x-atlassian-connect-scope: INACCESSIBLE`** in the docs ("Connect apps cannot access this REST resource"). That restriction is **Connect-specific**; OAuth 2.0 and scoped tokens are unaffected. Ignore the banner.
4. **Three writes need `manage:jira-project`**, a tier above `write:jira-work`: create version, create component, update component/version.
5. **`DELETE .../watchers` uses `write:issue.watcher:jira`.** There is no `delete:issue.watcher:jira`.
6. **`read:issue.vote:jira`** appears as required for `GET /issue/{k}` in the spec but is **absent from the granular table** on the scopes reference page. Unconfirmed whether it is selectable. If `GET /issue` 401s on a minimal granular scope set, suspect this first.

---

## 5. Rate limits and capability differences

**No documented rate-limit difference.** Atlassian states verbatim: *"API token-based traffic is not affected by this change, and will continue to be governed by existing burst rate limits."* The points-based quota system (enforcement from 2026-03-02) applies to **apps** — Forge, Connect, OAuth 2.0 3LO — not API tokens. API-token rate limiting itself began 2025-11-22 and applies to all API tokens with no type distinction.

Watch this: Atlassian's platform blog signals tokens will eventually move to quotas.

### Two unresolved anomalies

**POST 401 claim** (2026-04-15, third-party issue tracker): granular-scoped tokens reportedly authenticate on GET and PUT but return `401 scope does not match` on **all POSTs**, with classic `write:jira-work` as the workaround. **Discount this.** It is a single report that itself concedes no Atlassian community post documents the discrepancy, and it is contradicted by a Sept 2026 merged PR where a 23-granular-scope token authorized twelve endpoints including real workflow writes, and by the JSM POST successes above. Likely a client-side Content-Type or redirect interaction. Worth a smoke test; not a design constraint.

**Empty-array anomaly** (2026-02-07, unresolved): a classic token returns 148 projects from `GET /project`; a granular token with 50+ scopes including `read:project:jira` returns `[]` — same site, same Site Admin, on the gateway URL. Never resolved in-thread.

> A silent empty result rather than a 401 is **the worst possible failure mode for an MCP server**, because the model reports "you have no projects" as fact. Guard it: if the token authenticates but a list endpoint returns empty, emit a loud diagnostic rather than a cheerful "No projects found."

### Two structural differences that will generate support load

- **The gateway URL is mandatory.** `{site}.atlassian.net` with a scoped token yields 401 or 404. This is by far the most common failure in every thread reviewed, and is independently confirmed in at least three other projects' issue trackers.
- **Both auth headers work.** Atlassian's own Confluence scoped-token KB uses Basic (`--user email:token`); the Feb 2026 service-account guide says Bearer works and needs no email. The specs list `basicAuth` alongside `OAuth2` on every operation. This project uses Basic; Bearer is cleaner for service accounts and is a possible future option.

---

## 6. Error decoder

Consistent across every source reviewed. **This belongs in `client.ts` error messages:**

| Code | Meaning |
|---|---|
| **401** `scope does not match` | Missing scope, **or wrong cloudId** |
| **403** | The *account* lacks permission or license — the scope check **passed** |
| **404** on a valid key | Wrong base URL (site URL instead of the `api.atlassian.com/ex/jira/{cloudId}` gateway) |

---

## 7. Where the evidence is thin

Three honest gaps, recorded so nobody re-derives them:

1. **There is no Atlassian changelog entry covering scoped-token API surface at all** — not for the gateway, not for jira-software scope availability, not for JSM. Every positive answer here rests on the OpenAPI specs plus dated community empirics, never on an official "we support this" statement. Atlassian's support prose still says only "Jira and Confluence."
2. **No dated public report** of a *personal* (id.atlassian.com) scoped token — as opposed to an org service-account token — hitting `/rest/servicedeskapi/`. Mechanically identical, but untested in the public record.
3. **JSM classic scopes in the picker** remain unconfirmed by direct observation — that rests on ID-9094's "Fixed" resolution plus one Feb 2026 success report. The *jira-software* half of this gap is now closed: we selected all four board/sprint scopes ourselves on 2026-09-20.

---

## Sources

- [Jira Software scopes for OAuth 2.0 (3LO) and Forge apps](https://developer.atlassian.com/cloud/jira/software/scopes-for-oauth-2-3LO-and-forge-apps/)
- [Jira platform scopes for OAuth 2.0 (3LO) and Forge apps](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/)
- [JSM scopes for OAuth 2.0 (3LO) and Forge apps](https://developer.atlassian.com/cloud/jira/service-desk/scopes-for-oauth-2-3LO-and-forge-apps/)
- OpenAPI specs: [platform](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json) · [software](https://developer.atlassian.com/cloud/jira/software/swagger.v3.json) · [service desk](https://developer.atlassian.com/cloud/jira/service-desk/swagger.v3.json)
- [Jira Cloud rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/) · [Evolving our API rate limits](https://www.atlassian.com/blog/platform/evolving-api-rate-limits) · [API token rate limiting announcement](https://community.developer.atlassian.com/t/api-token-rate-limiting/92292)
- [Manage API tokens for your Atlassian account](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/) · [Manage API tokens for service accounts](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/) · [Scoped API tokens in Confluence Cloud](https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/)
- [ID-9094 — JSM classic scopes unavailable during credential creation](https://jira.atlassian.com/browse/ID-9094)
- [Using Jira Software API with service account (Apr 2026)](https://community.atlassian.com/forums/Jira-questions/Using-Jira-Software-API-with-service-account/qaq-p/3223748) · [Troubleshoot scopes for service account token (Nov 2025)](https://community.developer.atlassian.com/t/looking-for-a-way-to-troubleshoot-scopes-for-service-account-token/97204) · [how use /rest/agile/1.0/board for scoped api token](https://community.atlassian.com/forums/Jira-questions/how-use-rest-api-2-agile-1-0-board-for-scoped-api-token-tell-me/qaq-p/3135089)
- [Using service account to call v3 rest api (Feb 2026)](https://community.atlassian.com/forums/Jira-questions/Using-service-account-to-call-v3-rest-api-e-g-Get-issue/qaq-p/3194024) · [OAuth 2.0 for JSM Service Account Integration](https://community.atlassian.com/forums/Jira-Service-Management/OAuth-2-0-for-JSM-Service-Account-Integration/qaq-p/3133371)
- [Granular API token: GET /project returns empty list (Feb 2026)](https://community.atlassian.com/forums/Jira-questions/Granular-API-Token-GET-project-returns-empty-list-but-Classic/qaq-p/3188180) · [mcp-atlassian #968](https://github.com/sooperset/mcp-atlassian/issues/968)
- [Kendis Jira scope-based token config (Aug 2026)](https://help.kendis.io/en/articles/13652597-jira-scope-based-api-token-configuration) · [A Guide to Service Accounts in Atlassian Cloud, Part 3 (Feb 2026)](https://community.atlassian.com/forums/Jira-Cloud-Admins-articles/A-Guide-to-Service-Accounts-in-Atlassian-Cloud-Part-3-Service/ba-p/3186388)
