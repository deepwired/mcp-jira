# Contributing to mcp-jira-scoped

Thanks for your interest in contributing! This project aims to be the best MCP server for Jira with scoped API tokens.

## Getting Started

1. Fork the repo and clone it
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

## Development

```bash
npm run build      # Compile TypeScript
npm test           # Run all tests
npm run test:watch # Watch mode
npm run lint       # Lint
npm run format     # Format with Prettier
```

### Project Structure

```
src/
├── index.ts          # MCP server entry point + tool registration
├── auth.ts           # Scoped token auth, Cloud ID resolution
├── scopes.ts         # Scope registry + enforcement layer
├── client.ts         # HTTP client for Atlassian API gateway
├── types.ts          # Shared TypeScript types
└── tools/
    ├── issues.ts     # Get, create, update, delete, transition
    ├── search.ts     # JQL search
    ├── comments.ts   # List and add comments
    ├── projects.ts   # List and get projects
    ├── users.ts      # Get and search users
    └── links.ts      # Link issues, list link types
```

### Adding a New Tool

1. Create or edit a file in `src/tools/`
2. Define a Zod input schema
3. Write the handler function
4. Add the tool's scope requirement to `TOOL_SCOPE_MAP` in `src/scopes.ts`
5. Import and register the tool in `src/index.ts`
6. Write tests in `tests/tools/`
7. Update the README tool table

## Pull Requests

- One feature/fix per PR
- Include tests for new functionality
- Run `npm run build && npm test` before submitting
- Keep the PR description clear — what changed and why

## Reporting Issues

Use [GitHub Issues](https://github.com/deepwired/mcp-jira/issues). Include:
- What you expected vs what happened
- Steps to reproduce
- Node version, OS, MCP client (Claude Desktop, Cursor, etc.)

## Test Fixtures & the Pre-Commit Hook

The repo has a pre-commit hook that blocks commits containing potential secrets. When writing tests that set `JIRA_API_TOKEN`, use **only** the dummy values `'token'` or `'secret'` — these are the only allowlisted values. Any other string will trigger the hook and block your commit.

```typescript
// GOOD — these are allowlisted
process.env.JIRA_API_TOKEN = 'token';
process.env.JIRA_API_TOKEN = 'secret';
```

Do **not** use realistic-looking strings (e.g. `'my-test-value-12345'`) — the pre-commit hook will block the commit.

If the hook blocks your commit and you're certain it's a false positive, you can bypass it with `git commit --no-verify` — but please double-check first.

## Code Style

- TypeScript strict mode
- No unnecessary dependencies
- Prettier for formatting, ESLint for linting
- Follow existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
