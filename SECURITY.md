# Security Policy

## Token Safety

This MCP server handles Atlassian API tokens. The following measures are in place:

- **Tokens are never logged** — the `sanitizeError` function redacts tokens from all error messages
- **Tokens are never written to files** — configuration is read from environment variables only
- **Scope enforcement** — the server blocks API calls outside the configured scopes before they reach Atlassian
- **Delete safety guard** — `jira_delete_issue` requires an explicit `confirm: true` parameter
- **Read-only by default** — if `JIRA_SCOPES` is not set, only read tools are available
- **Pre-commit hook** — the repo includes a git hook (`.git/hooks/pre-commit`) that blocks commits containing token patterns (ATATT tokens, Bearer values, hardcoded `JIRA_API_TOKEN` assignments). The only allowlisted dummy values are the exact strings `'token'` and `'secret'`, used in test fixtures. Any other value will block the commit.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public issue.

Instead, please report it privately:

1. Email the maintainer directly, or
2. Use [GitHub Security Advisories](https://github.com/deepwired/mcp-jira/security/advisories/new) to report privately

We will respond within 48 hours and work with you to understand and address the issue.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Scope

This policy covers the `mcp-jira-scoped` npm package and the source code in this repository. It does not cover Atlassian's APIs or infrastructure.
