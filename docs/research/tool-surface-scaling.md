# How Many Tools Is Too Many

**Researched 2026-09-20.** Evidence behind the decision to gate tools behind configurable toolsets rather than shipping ~50 always-on.

---

## TL;DR

Going from 20 to ~50 tools lands us inside a documented accuracy-degradation band and **above Cursor's silent 40-tool truncation limit**. The binding constraint is *not* context cost — this server is unusually lean — it is selection accuracy and client-side caps.

**Decision: static, config-time toolset gating with a lean default. No in-server dynamic discovery.**

---

## 1. The degradation curve

**The strongest official datapoint.** Anthropic's own documentation states plainly:

> Claude's ability to pick the right tool degrades once you exceed 30–50 available tools.

The Agent SDK docs repeat it: *"Tool selection accuracy degrades with more than 30-50 tools loaded at once."*

**Measured deltas.** From Anthropic's *Introducing advanced tool use* — same task set, same catalog, only the loading strategy changed:

| Model | All tools upfront | With tool search |
|---|---|---|
| Opus 4 | 49% | 74% |
| Opus 4.5 | 79.5% | 88.1% |

This is the cleanest causal evidence available: the loss is attributable to *tool-definition presence in context*, not task difficulty. Note the model dependence — the weaker model gained 25pp, the stronger one 8.6pp. **Capability moves the knee right but does not remove it.**

**Academic.** RAG-MCP (arXiv:2505.03275) measured baseline selection accuracy falling from ~85% at 5 tools to ~45% at 20 tools, and reports 13.62% baseline vs 43.13% with retrieval-based selection on their stress test, with >50% prompt-token reduction. *Caveat: synthetic MCP pool.*

**Independent vendor measurement.** Speakeasy ran a controlled server at 10/20/40/107 tools against two models: 10 tools → zero errors; 20 → 19/20 correct; 40 → 3/4 correct with hallucination; 107 → both models hallucinated endpoints. They place the small-model sweet spot at ~19 tools and large-model confusion onset at ~30. *Caveat: small N, deliberately near-duplicate tools (one per dog breed), so it likely overstates the effect for a well-differentiated toolset.*

**Convergent read:** onset ~20–30 tools, clear degradation by 40–50, effective collapse past 100. Near-duplicate descriptions move the knee sharply left.

### Client-side hard caps — the decisive constraint

| Client | Behaviour |
|---|---|
| **Cursor** | **Silently truncates to the first 40 MCP tools** |
| VS Code / Copilot | Hard 128-tool cap enforced at request time |
| Claude Code / Agent SDK | Defers MCP tools automatically (tool search on by default) |

Cursor's behaviour is the one that forces the decision. It is not an error — tools are simply dropped, with no signal to the user or the model. At ~50 tools a meaningful share of users would silently lose functionality.

**Claude Code users are largely protected regardless of what we do. The gating is for everyone else.**

---

## 2. Context cost — not our problem

Anthropic's published figures for real MCP servers: GitHub 35 tools ≈ 26K tokens (~740/tool), Slack 11 tools ≈ 21K (~1.9K/tool), **the official Atlassian Jira MCP ≈ 17K tokens**. A five-server setup = 58 tools ≈ 55K tokens before any work happens.

**This server measures ~2,550 tokens for 20 tools — about 127 tokens/tool**, ranging from 61 (`jira_list_link_types`) to 258 (`jira_create_issue`). That is roughly **7× leaner than Atlassian's own Jira MCP**. At the same density, 50 tools ≈ 6.4K tokens — real but affordable, and under Anthropic's 10K threshold for recommending tool search.

**So the usual "context bloat" framing does not apply to us.** Accuracy and client caps do.

### Prompt-caching interaction

Tool definitions sit at the **head of the cache prefix** (`tools` → `system` → `messages`). **Any modification to tool definitions invalidates the entire cache** — tools, system, *and* all messages.

Two consequences:

- A **static, config-time** toolset is cache-perfect: chosen once at server start, never mutates, stable prefix for the whole session.
- A server that toggles its own tool list at runtime (via `tools/list_changed`) **blows the full prompt cache on every toggle**. This is a strong, documented argument against in-server dynamic toolsets.
- Anthropic's own `defer_loading` sidesteps this entirely: deferred tools are excluded from the prefix and arrive as inline `tool_reference` blocks, so discovery never breaks the cache.

---

## 3. Mitigation patterns

### (a) Static toolset gating via config — **chosen**

`github/github-mcp-server` is the reference implementation: ~22 toolsets, `--toolsets` / `GITHUB_TOOLSETS`, default `context,repos,issues,pull_requests,users`, with `all` as an escape hatch. Their stated rationale:

> Enabling only the toolsets that you need can help the LLM with tool choice and reduce the context size.

**Trade-offs:** zero runtime cost; cache-friendly; works on *every* client including Cursor and VS Code. But it is a user-configuration burden, and anything outside the default is invisible — the model cannot know to ask for it.

### (b) Dynamic tool discovery / tool search — **not building**

This is what Anthropic itself ships: server-side `tool_search_tool_regex_20251119` / `_bm25_20251119` with `defer_loading: true`, up to 10,000 deferred tools. Their stated triggers: ≥10 tools, or definitions >10K tokens, or accuracy dropping as the toolset grows, or aggregating multiple servers.

**Why we're not reimplementing it:** MCP has no standard negotiation for it; Anthropic's `defer_loading` already solves it for Claude clients without breaking caching; a bespoke `jira_find_tool` would add a round-trip, be dead weight for Claude Code users (double discovery), and **would not help Cursor at all**, since Cursor caps the list before our search tool could ever run.

### (c) Consolidation — **selectively**

Anthropic's *Writing effective tools for AI agents* is explicit: *"More tools don't always lead to better outcomes."* They recommend merging `list_users`/`list_events`/`create_event` into `schedule_event`, replacing `read_logs` with `search_logs`, and so on.

**But the evidence here is authority plus internal eval reference, not a published curve** — weaker than the tool-count evidence. A direct counterweight from the same post: *"tool use examples improved accuracy from 72% to 90% on complex parameter handling."* That is direct evidence that heavily parameterized tools create a **parameter-accuracy** failure mode partially offsetting the **selection-accuracy** win.

**Consolidation trades one error class for another.** Do it where result shape and mental model coincide; resist it across entity types.

### (d) Client-side filtering — not ours to control

Cursor's 40-cap, VS Code's "Configure Tools", Claude Code's `/mcp` toggles. Real, but silent truncation is a correctness hazard we must design around rather than rely on.

---

## 4. Tool design guidance that improves selection at scale

- **Namespace consistently by prefix.** Anthropic found prefix- vs suffix-based naming produced *measurable* eval differences. Prefixes also let one tool-search query match a whole group. Our `jira_*` convention is already correct.
- **Descriptive names beat terse ones.** `search_slack_messages` surfaces for more requests than `query_slack`. Tool search matches against names, descriptions, **argument names and argument descriptions** — so put the words users actually say ("by assignee, sprint, or date range") into those fields.
- **Write descriptions "as you would describe it to a new hire."** Unambiguous parameter names (`user_id`, not `user`); strict schemas; enums for categorical values.
- **Add a server-instructions line naming the gated categories** — Anthropic lists this as an explicit optimization, and it directly mitigates the discoverability loss from gating.
- **Budget responses,** not just definitions. Pagination, filtering, truncation. Response bloat is a separate and often larger drain than definition bloat.
- **Description quality is measurable, and most servers are bad at it.** A study of 856 tools across 103 MCP servers found 97.1% had at least one description "smell", 56% unclear purpose, 89.8% no stated limitations — **with no significant difference between official and community servers**. Augmenting descriptions gave +5.85pp median task success but +67.46% execution steps, and 16.67% of cases regressed. So: fix Purpose and Guidelines; don't pad indiscriminately.

### On one parameterized tool vs several narrow ones

There is **no published head-to-head measurement** — this is the least-evidenced part of the question. The defensible middle position:

- **Consolidate** when tools share a result shape *and* a caller's mental model. Issue search across JQL/text/filter modes → one tool.
- **Keep separate** when parameter sets are disjoint. Searching issues vs users vs projects → three tools, because a single `jira_search(entity=...)` forces mutually-exclusive parameter groups into one schema — exactly the "complex parameter handling" regime where Anthropic measured 72% accuracy without examples.

Our existing `jira_search` / `jira_search_users` split is already correct by this reasoning.

---

## 5. Decision and trade-offs accepted

**Ship (a) + (c): consolidate genuinely redundant tools, gate the remainder behind configurable toolsets with a lean default of ~20–25. Do not build dynamic discovery into the server.**

Reasoning:

1. **Accuracy and client caps are the constraint, not context.** 6.4K tokens at 50 tools is fine; sitting inside the 30–50 degradation band and above Cursor's silent 40-cap is not.
2. **Static config gating is the only mitigation that works on every client.**
3. **We already have the mechanism.** `src/scopes.ts` plus the registration filter in `src/index.ts` is already a registration-time gate keyed on scopes. Adding a `toolsets` dimension reuses it. The existing file layout (`issues`, `search`, `comments`, `projects`, `users`, `links`, `attachments`, `fields`) is already an almost-exact toolset partition.
4. **Static gating is cache-optimal; in-server dynamic toolsets are cache-hostile.** Documented, not inferred.

**Trade-offs we are explicitly accepting:**

- *Discoverability loss.* Anything outside the default toolset is invisible to the model. Mitigate with a server-instructions line naming the gated categories and a README table.
- *Support burden.* Users will file "tool X doesn't exist" issues. `--toolsets all` is the escape hatch; github-mcp-server lives with this.
- *Consolidation risk.* Fewer, fatter tools shift errors from "picked the wrong tool" to "filled the parameters wrong." Add worked examples to any consolidated tool's description — that's the 72%→90% lever.
- *The default-subset choice has no data behind it.* It is a judgment call, matching github-mcp-server's "what 80% of users need" philosophy.

---

## 6. Evidence confidence

| Confidence | Claims |
|---|---|
| **Well-evidenced** | The 30–50 knee (Anthropic official, stated twice); tool-search accuracy gains (49→74%, 79.5→88.1%); per-server token costs; cache-invalidation semantics; client hard caps; description-quality prevalence and effect size |
| **Reasonably evidenced** | The shape of the curve below 30 (RAG-MCP 85%@5 → 45%@20; Speakeasy 10/20/40/107) — directionally consistent across independent sources, but both use synthetic or near-duplicate toolsets |
| **Authority, not measurement** | "Fewer, more powerful tools win." Anthropic asserts it from internal evals; no public curve |
| **Community convention only** | The specific number 40 as a threshold; "one tool should do one thing"; verbose-descriptions-always (the smell study shows examples can often be dropped without statistical loss) |

---

## 7. Adjacent — where the ceiling is moving

*The Bitter Lesson of Tool Calling* (arXiv:2608.06370) found programmatic (code-writing) tool calling stayed stable under a 128-schema "context flooding" condition (±5.5%) while JSON tool calling degraded, across 14 models on BFCL v4. Anthropic's *code execution with MCP* reports 150K → 2K tokens on a Drive→Salesforce task.

Not actionable for this server today. Worth revisiting if the tool count ever genuinely needs to exceed ~60.

---

## Sources

- [Anthropic — Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) · [Agent SDK tool search](https://code.claude.com/docs/en/agent-sdk/tool-search)
- [Anthropic — Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic — Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic — Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)
- [Anthropic — Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [github/github-mcp-server](https://github.com/github/github-mcp-server)
- [RAG-MCP (arXiv:2505.03275)](https://arxiv.org/abs/2505.03275) · [The Bitter Lesson of Tool Calling (arXiv:2608.06370)](https://arxiv.org/html/2608.06370v1) · [MCP Tool Descriptions Are Smelly (arXiv:2602.14878)](https://arxiv.org/html/2602.14878v1)
- [Speakeasy — Why less is more for MCP](https://www.speakeasy.com/mcp/tool-design/less-is-more/) · [Speakeasy — dynamic toolsets](https://www.speakeasy.com/blog/100x-token-reduction-dynamic-toolsets) · [Archestra — how many MCP tools is too many](https://archestra.ai/blog/how-many-mcp-tools-too-many)
- [MCP spec — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) · [vscode#290356](https://github.com/microsoft/vscode/issues/290356)
