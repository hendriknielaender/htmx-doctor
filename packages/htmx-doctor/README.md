# HTMX Doctor

[![version](https://img.shields.io/npm/v/htmx-doctor?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/htmx-doctor)
[![downloads](https://img.shields.io/npm/dt/htmx-doctor.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/htmx-doctor)

Let coding agents diagnose and fix your HTMX code.

One command scans HTMX templates and scripts for request, swap, security, correctness, and performance issues, then outputs a 0-100 score with actionable diagnostics.

### [See it in action ->](https://www.htmx.doctor)

## What It Checks

HTMX Doctor currently detects issues such as:

- missing `hx-confirm` on destructive `hx-delete` requests
- absolute `hx-get`/`hx-post`/`hx-put`/`hx-patch`/`hx-delete` URLs instead of app-relative routes
- `input` and `keyup` triggers without a safe debounce delay
- aggressive polling intervals
- `hx-target="body"` with `outerHTML`
- multiple HTMX requests inside a form without `hx-sync`
- inline `js:` evaluation and `hx-on:*` handlers
- inline secrets embedded in `hx-headers`
- unsafe htmx runtime config such as `allowEval: true`, `allowScriptTags: true`, `historyCacheSize > 0`, or `selfRequestsOnly: false`

Dead code detection runs in parallel when a `package.json` is present.

## Install

Run this at your project root:

```bash
npx -y htmx-doctor@latest .
```

Use `--verbose` to see affected files and line numbers:

```bash
npx -y htmx-doctor@latest . --verbose
```

Use `--diff` to scan only changed files:

```bash
npx -y htmx-doctor@latest . --verbose --diff
```

## Agent Skill

Teach your coding agent the HTMX Doctor workflow:

```bash
curl -fsSL https://www.htmx.doctor/install-skill.sh | bash
```

Supports Cursor, Claude Code, Amp Code, Codex, Gemini CLI, OpenCode, Windsurf, and Antigravity.

## GitHub Action

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
- uses: hendriknielaender/htmx-doctor@main
  with:
    diff: main
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Options

```txt
Usage: htmx-doctor [directory] [options]

Options:
  -v, --version      display the version number
  --no-lint          skip HTMX checks
  --no-dead-code     skip dead code detection
  --verbose          show file details per rule
  --score            output only the score
  -y, --yes          skip prompts, scan all workspace projects
  --project <name>   select workspace project (comma-separated for multiple)
  --diff [base]      scan only files changed vs base branch
  --offline          skip score API calls and calculate locally
  --ami              enable Ami-related prompts
  --fail-on <level>  exit with error code on diagnostics: error, warning, none
  --fix              open Ami to auto-fix all issues
  -h, --help         display help for command
```

## Configuration

Create an `htmx-doctor.config.json` file in your project root:

```json
{
  "ignore": {
    "rules": ["htmx-doctor/delete-missing-confirm", "knip/exports"],
    "files": ["templates/generated/**"]
  },
  "lint": true,
  "deadCode": true,
  "verbose": false,
  "diff": "main"
}
```

You can also use the `"htmxDoctor"` key in `package.json`. Legacy `react-doctor.config.json` and `"reactDoctor"` keys are still accepted while migrating.

## Node API

```ts
import { diagnose } from "htmx-doctor/api";

const result = await diagnose(".");

console.log(result.score);
console.log(result.diagnostics);
console.log(result.project);
```

## Contributing

```bash
git clone https://github.com/millionco/htmx-doctor
cd htmx-doctor
bun install
bun run build
```

Run locally:

```bash
node packages/htmx-doctor/dist/cli.js /path/to/your/project
```

## License

HTMX Doctor is MIT-licensed open-source software.
