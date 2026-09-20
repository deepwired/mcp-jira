# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-09-20

Tool count goes from 20 to 44 (34 registered by default), and four shipped
bugs are fixed. Read the breaking changes before upgrading.

### ⚠️ Breaking

- **`jira_search` no longer accepts `startAt`.** It now paginates with
  `nextPageToken`, returned in the tool's own output. This is not a preference:
  `/rest/api/3/search/jql` **silently ignores `startAt`** and returns the first
  page for every request, so the previous implementation could not reach
  results past the first page at all. Verified against live Jira — `startAt=3`
  returned exactly the same three issues as `startAt=0`.

- **Content is Markdown by default, in both directions.** Reads return
  Markdown; writes are parsed as Markdown. Previously reads were flattened
  text with `[label|url]` wiki links, and writes were literal. Pass
  `format: "text"` on any content tool to keep the old behaviour, or
  `format: "adf"` for raw ADF.

- **An unrecognised `JIRA_SCOPES` value now fails at startup.** Previously
  unknown scopes were silently dropped, and if that emptied the list the server
  started with **no tools, no error and no log line**. A typo now produces a
  clear message naming the offending scope. If you are upgrading and the server
  refuses to start, that is this change telling you your config was already
  broken.

- **`jira_update_issue` distinguishes "leave alone" from "clear".** Omitting a
  field leaves it untouched, as before. Passing `null` now clears it. Clearing
  `resolution` is the standard fix for a reopened issue that refuses to
  transition, and it was previously impossible.

- **The `Scope` type is now `string`** rather than a four-member union.
  Relevant only if you import the types.

### Added

- **`JIRA_TOOLSETS`** — register only the capability groups you need.
  Ten toolsets; six on by default. Accepts `all` and `default`. Chosen once at
  startup, so it never invalidates the prompt cache mid-session. Disabled
  toolsets are named in the server instructions so the model still knows they
  exist.
- **`JIRA_PROJECTS`** — restrict the whole server to an allowlist of project
  keys. Out-of-scope requests are refused before any API call, and JQL is
  wrapped (not appended) so an `OR` in the query cannot escape the restriction.
  Enforced at a single dispatch choke point, so new tools inherit it.
- **Granular scopes.** Most endpoints accept a classic scope *or* its granular
  equivalent, and the server now accepts either. Jira Software is encoded as
  the exception it is: it publishes no classic scopes, so `agile` requires
  granular ones and cannot be satisfied by `read:jira-work`.
- **Markdown ⇄ ADF conversion** covering headings, bold/italic/strike, inline
  code, three link syntaxes, bullet/ordered/task lists, fenced code blocks with
  language, blockquotes, tables, rules, panels, mentions and smart links.
  A `format` parameter (`markdown` | `text` | `adf`) on every content tool.
- **24 new tools.** Worklogs (list/add/update/delete), create metadata,
  changelog, remote links (list/create/delete), boards and sprints, versions,
  components, saved filters, labels, `jira_get_myself`, `jira_assign_issue`,
  `jira_delete_comment`, `jira_remove_link`, `jira_download_attachment`.
- **`jira_get_create_meta`** deserves its own line: it answers "what is required
  to create a Bug in this project", which the server previously could not. Most
  `jira_create_issue` failures are a required custom field the model could not
  see.
- Error messages that explain what the status codes actually mean on this
  gateway — 401 is a missing scope *or* a wrong Cloud ID, 403 means the scope
  check passed and the account lacks permission, 404 on a valid key usually
  means the site URL was used instead of the gateway.
- `includeTotal` on `jira_search`, backed by `/search/approximate-count`, since
  the search endpoint no longer returns a total.
- Deterministic tool ordering, so clients can cache the tool list.

### Fixed

- **An empty project list is no longer reported as fact.** There is an
  unresolved Atlassian defect where a granular-scoped token returns `[]`
  instead of a 401. Reporting "you have no projects" confidently is the worst
  available failure mode; the server now says the request authenticated and the
  result may be a permissions problem.
- **Infinite loop and out-of-memory crash** in the Markdown parser. A fence line
  with trailing text (` ```bash -x `) was recognised as a block opener but
  matched no handler, so the parse loop never advanced.
- **Silent link loss.** `blockCard` and `embedCard` carry their URL in `attrs`
  with no content and were rendering as empty, dropping the link entirely.
- **Lost link labels.** A link whose label is a code span —
  ``[`Gemfile:184`](url)`` — emitted an internal placeholder as the visible
  text.
- **Corrupted numbering.** Paragraphs beginning `2.` were read back as list
  items and renumbered to `1.`, changing what the text said.
- **Flattened nesting.** Nested ordered lists collapsed into their parent.
- **Truncated code blocks.** A code block containing its own ``` line closed
  the fence early.
- **Unstable blockquotes.** Multi-line quoted paragraphs grew a blank quote
  line on every conversion pass.
- **Empty "Description:" header.** Jira returns a cleared rich-text field as an
  empty ADF document, not `null`, and an object is always truthy.
- `client.request` dropped the body on non-POST/PUT methods.
- The hardcoded server version no longer drifts from `package.json`.

### Changed

- Response handling is shared between the JSON and multipart paths rather than
  duplicated.
- README corrected: it advertised 14 tools when there were 20, and claimed to
  be the only Jira MCP server supporting scoped tokens, which is no longer
  true.

### Security

- **Credential redaction was incomplete.** `sanitizeError` stripped the raw
  token but not the base64 `email:token` form that actually travels in the
  `Authorization` header — a trivially reversible encoding. Both forms are now
  redacted, plus any unrecognised `Basic <blob>` as a catch-all. No leak was
  observed in practice; fetch errors do not normally echo headers. Found by
  pre-release review, not by an incident.
- **Unbounded recursion on untrusted content.** Deeply nested blockquotes
  (`> > > > …`) overflowed the stack, since blockquote parsing recursed without
  a depth bound and Jira content is untrusted input to the parser. Bounded at
  16 levels; beyond that the markers are kept as literal text.
- **Dependency vulnerabilities cleared.** Seven advisories (three high) reached
  the tree through the MCP SDK's HTTP transport dependencies. None were
  reachable — this server uses stdio only — but they surfaced in every
  consumer's `npm audit`. Now zero.
- The README documents the attachment tools' trust boundary: issue content is
  attacker-controllable, which makes prompt injection a real exfiltration path
  for any MCP server that can read local files.

### Verification

Tested against a live Jira Cloud instance, not only offline mocks:
20/20 read tools, 23/25 write operations, all six guard behaviours. Markdown
survived a full create-and-read-back round trip through Jira byte-identically,
including a table, task list, code block and blockquote. ADF conversion checked
against **300 real issue descriptions**: zero URL loss, zero text loss, 84%
byte-identical round-trips, with the remainder being structural normalisation
rather than content loss.

Seven of the bugs above were found only by live testing; the offline suite
passed all 249 assertions while they were present. 269 tests now pass.

Adversarial input testing covers delimiter spam, unclosed markup, pathological
nesting and multi-hundred-kilobyte lines: worst case 45 ms, no catastrophic
backtracking. The published tarball was installed into a clean directory and
driven over MCP stdio to confirm the artifact works as shipped.

The `agile` toolset was verified separately against a second token carrying
only the four `jira-software` scopes: boards and sprints listed, and sprint
create, update and move-issues all succeeded, while every platform endpoint
correctly returned 401 for want of a classic scope. That also settles a
long-standing and incorrectly-answered question in the Atlassian community —
scoped API tokens *can* reach `/rest/agile/1.0`.

### CI

CI had been failing on `main` since March and nobody noticed, because the
README advertised it as passing. The cause was not this branch: vitest's `vite`
dependency requires Node `^20.19 || >=22.12`, so the Node 18 job could never
have run the test suite, and `fail-fast` then cancelled the other versions and
hid whether they would have passed.

Restructured rather than papered over. The full suite now runs on Node 20, 22
and 24 with `fail-fast: false`. Node 18 support is still claimed in `engines`
and the runtime genuinely has no higher floor, so it is now *verified* by a new
no-network smoke test (`npm run smoke`) that drives the built binary over MCP
stdio and asserts it starts, lists a sorted and fully-schema'd tool roster, and
writes nothing to stderr. That runs on 18, 20, 22 and 24.

## [1.2.0] — 2026-04-01

### Added
- `jira_update_comment` for editing existing comments.
- Link-aware ADF conversion: bare URLs auto-link, and `[label|url]` wiki markup
  is parsed, with round-trip fidelity.

## [1.1.0] — 2026-03-29

### Added
- Attachments: `jira_list_attachments`, `jira_add_attachment`,
  `jira_delete_attachment`.
- `jira_list_fields` for discovering `customfield_*` IDs.
- `jira_get_transitions` with required screen fields expanded.
- Custom field support on `jira_create_issue` and `jira_update_issue`.

## [1.0.0] — 2026-03-28

Initial release. Scoped API token authentication via the `api.atlassian.com`
gateway, server-side scope enforcement, read-only default, and 12 tools
covering issues, search, comments, projects, users and issue links.
