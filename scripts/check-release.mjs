#!/usr/bin/env node
/**
 * Release consistency check.
 *
 * Version numbers and tool counts live in six places. They have drifted before:
 * src/index.ts advertised 1.0.0 while package.json said 1.2.0, server.json sat
 * at 1.0.0 through two releases, and the README claimed 14 tools when there
 * were 20. This runs in prepublishOnly and CI so it cannot happen quietly.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const problems = [];
const checks = [];

const pkg = JSON.parse(read('package.json'));
const version = pkg.version;

function check(label, ok, detail) {
  checks.push({ label, ok, detail });
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

// --- versions agree everywhere ------------------------------------------------
const indexSrc = read('src/index.ts');
const srcVersion = /SERVER_VERSION = '([^']+)'/.exec(indexSrc)?.[1];
check('src/index.ts SERVER_VERSION matches package.json', srcVersion === version,
  `found ${srcVersion}, expected ${version}`);

const server = JSON.parse(read('server.json'));
check('server.json version matches', server.version === version,
  `found ${server.version}`);
check('server.json package version matches', server.packages?.[0]?.version === version,
  `found ${server.packages?.[0]?.version}`);

// --- changelog documents this release ----------------------------------------
const changelog = read('CHANGELOG.md');
check(`CHANGELOG has a [${version}] section`, changelog.includes(`[${version}]`));

// --- registry metadata covers every env var the code reads -------------------
const envVars = [...new Set(
  [read('src/auth.ts'), indexSrc]
    .join('\n')
    .matchAll(/process\.env\.(JIRA_[A-Z_]+)/g),
)].map((m) => m[1]);
const declared = new Set(server.packages?.[0]?.environmentVariables?.map((e) => e.name) ?? []);
const undeclared = envVars.filter((v) => !declared.has(v));
check('server.json declares every JIRA_* env var the code reads', undeclared.length === 0,
  undeclared.join(', '));

const smithery = read('smithery.yaml');
const missingSmithery = envVars.filter((v) => !smithery.includes(v));
check('smithery.yaml passes through every JIRA_* env var', missingSmithery.length === 0,
  missingSmithery.join(', '));
check('smithery.yaml does not declare a container build without a Dockerfile',
  !smithery.includes('dockerBuildPath'));

// --- README matches the built tool registry ----------------------------------
let toolCheckRan = false;
try {
  const { TOOL_SPECS } = await import(join(root, 'dist/scopes.js'));
  const { TOOLSETS, DEFAULT_TOOLSETS } = await import(join(root, 'dist/scope-catalog.js'));
  const readme = read('README.md');
  const total = Object.keys(TOOL_SPECS).length;
  const dflt = Object.values(TOOL_SPECS).filter((s) => DEFAULT_TOOLSETS.includes(s.toolset)).length;

  check(`README states the tool count (${total})`, readme.includes(`Available Tools (${total})`));
  check(`README states the default count (${dflt})`, readme.includes(`${dflt} by default`));

  const undocumented = Object.keys(TOOL_SPECS).filter((n) => !readme.includes(`\`${n}\``));
  check('every tool is documented in the README', undocumented.length === 0, undocumented.join(', '));

  const undocumentedSets = Object.keys(TOOLSETS).filter((t) => !readme.includes(`\`${t}\``));
  check('every toolset is documented in the README', undocumentedSets.length === 0,
    undocumentedSets.join(', '));
  toolCheckRan = true;
} catch {
  check('dist/ is built so tool counts can be verified', false, 'run `npm run build` first');
}

// --- report -------------------------------------------------------------------
for (const { label, ok, detail } of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${!ok && detail ? ` (${detail})` : ''}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} release check(s) failed.`);
  process.exit(1);
}
console.log(`\nRelease checks passed for v${version}${toolCheckRan ? '' : ' (tool checks skipped)'}.`);
