# `hassanGH-GG/plugins` — repo analysis

Orientation for an agent starting cold. Measured against `main` at `2a80444` on 2026-08-18.
Each number names the command that produced it, so re-run rather than trust.

---

## 1. What it is

A fork of **Cursor's official plugin marketplace**. `.cursor-plugin/marketplace.json` names it
`cursor-plugins`, owner `Cursor <plugins@cursor.com>`.

**It is a distribution catalogue, not an application.** No build, no app, no shared runtime, no
repo-level `package.json`. 31 self-contained plugin directories, two JSON schemas, one
validator script. That is the whole repo.

`main` tracks upstream; merge commits read `from cursor/cursor/<branch>`, so the upstream org
is `cursor`. The exact upstream repo path is **not verified here** — confirm it on the fork's
GitHub page before treating it as `cursor/plugins`.

---

## 2. Layout

```
.cursor-plugin/marketplace.json   catalogue: 31 entries of {name, source, description}
schemas/plugin.schema.json        per-plugin manifest schema
schemas/marketplace.schema.json   catalogue schema
scripts/validate-plugins.mjs      the only validation in the repo
.github/workflows/validate-plugins.yml
<13 first-party packs>/
third_party/<18 MCP-only packs>/
node_modules/                     ajv + ajv-formats, for the validator only
```

### Pack anatomy

Every first-party pack is the same shape, and the convention is near-universal:

```
<pack>/
  .cursor-plugin/plugin.json   manifest (required)
  LICENSE                      13/13 packs
  README.md                    13/13 packs
  CHANGELOG.md                 5/13
  assets/                      10/13 (logos, screenshots)
  skills/<name>/SKILL.md       the payload
  agents/*.md                  6/13
  rules/                       2/13 (create-plugin, cursor-team-kit)
  hooks/hooks.json             2/13 (continual-learning, ralph-loop)
```

A `SKILL.md` is markdown with YAML frontmatter. The frontmatter `description` is the trigger:
it is the only part always in the model's context, so a skill with a weak description never
fires, and one with no description is invisible rather than broken-looking.

---

## 3. The 13 first-party packs

| Pack | Skills | Size | What it does |
|---|---|---|---|
| `pstack` | 47 | 3.6M | The big one. Rigorous parallelisable agent workflows: principles, playbooks, `poteto-mode` as router. Also ships `agents/`, `automations/benny`, a 10-page `docs/guide/` |
| `cursor-team-kit` | 18 | 304K | Cursor's internal engineering workflows: CI, code review, shipping, test reliability, cleanup |
| `orchestrate` | 1 | 864K | Fans a task across parallel cloud agents via the Cursor SDK. **The only substantial codebase in the repo** (see §6) |
| `thermos` | 3 | 144K | "Thermo-nuclear" branch review: correctness/security audits, harsh quality rubrics, parallel subagents |
| `ralph-loop` | 3 | 128K | Continuous self-referential loops (the Ralph Wiggum technique): while-true agent with a stop hook |
| `create-plugin` | 2 | 120K | Scaffolds and validates new plugins for this marketplace. Read this one first if authoring a pack |
| `teaching` | 2 | 100K | Skill mapping, practice plans, learning retrospectives. Only pack in category `utilities` |
| `continual-learning` | 1 | 124K | Learns durable preferences from transcript deltas and maintains `AGENTS.md`. Uses a `stop` hook |
| `cursor-sdk` | 1 | 120K | How to build on `@cursor/sdk`: runtime selection, auth, streaming, MCP |
| `agent-compatibility` | 1 | 84K | Repo compatibility scans; audits startup, validation and docs against reality |
| `pr-review-canvas` | 1 | 68K | Renders PR diffs as an interactive canvas grouped by importance |
| `docs-canvas` | 1 | 64K | Renders docs as a navigable canvas |
| `cli-for-agent` | 1 | 32K | Patterns for CLIs agents can drive: non-interactive flags, layered help, actionable errors |

Every pack except `teaching` is category `developer-tools`.

### `third_party/` — 18 MCP-only packs

apollo-io, ashby, circleback, clay, docusign, github, gmail, gong, google-calendar,
google-drive, hubspot, intercom, navan, playwright, profound, salesforce, x, zoom.

Six files each: manifest, `mcp.json`, README, LICENSE, CHANGELOG, logo. **They ship no
skills.** `mcp.json` is a plain server declaration with env-var interpolation:

```json
{ "mcpServers": { "github": { "type": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } } } }
```

Treat them as configuration, not code. There is nothing to audit in them.

---

## 4. The manifest contract — the highest-value thing to know

`schemas/plugin.schema.json`:

- **`name` is the only required field.**
- **`additionalProperties: false`** — an unknown key is a hard schema failure.
- Keys: `name, displayName, description, version, minClientVersions, author, publisher,
  homepage, repository, license, logo, keywords, category, tags, commands, agents, skills,
  rules, hooks, variables, mcpServers`.
- `skills`/`agents`/`rules`/`commands` are `stringOrStringArray`, documented as
  **"Glob pattern(s) or path(s)"**.
- `hooks` is `oneOf[string, object]` — a path OR an inline object.

**The trap:** all 13 first-party packs declare components as a **directory path**,
`"skills": "./skills/"`, never a glob. Tooling that assumes globs reports every pack as empty.
Expand a value by stripping a leading `./`, then if it has no glob metacharacters and names a
directory, treat it as `<dir>/**`.

**Components are declared, never discovered.** A `SKILL.md` no declaration matches is dead on
install, silently. A declaration matching nothing installs an empty component, also silently.

### Hooks

Two packs ship them, both `{version: 1, hooks: {...}}`, keyed by event:

```json
// continual-learning
{"hooks": {"stop": [{"command": "bun run ${CURSOR_PLUGIN_ROOT}/hooks/continual-learning-stop.ts"}]}}
// ralph-loop
{"hooks": {"afterAgentResponse": [{"command": "./hooks/capture-response.sh"}],
           "stop": [{"command": "./hooks/stop-hook.sh", "loop_limit": null}]}}
```

Events seen: `stop`, `afterAgentResponse`. `${CURSOR_PLUGIN_ROOT}` is the interpolated plugin
root. Hook commands are **never checked for existence** by anything in this repo.

---

## 5. What is validated, and what is not

`node scripts/validate-plugins.mjs` (needs `ajv` + `ajv-formats`, already vendored) checks:

- every marketplace `source` directory exists
- each `plugin.json` parses and validates against the schema
- `marketplace.json` validates against its schema

CI runs only that, and only under these filters:

```yaml
on: pull_request
    paths: [".cursor-plugin/marketplace.json", "**/plugin.json", "schemas/**"]
```

**This is the most important structural fact about the repo: manifests are gated, content is
not.**

- No workflow reads a `SKILL.md`. A PR changing only prose runs **zero checks**.
- No lint, no typecheck, no test job anywhere in CI.
- `orchestrate` ships 28 test files and a `test` script; **no CI job runs them.**
- Hook commands and MCP binaries are declared, never resolved.

Whether that is a deliberate upstream policy or an oversight is not recorded anywhere in the
repo. Do not "fix" it unilaterally.

---

## 6. `orchestrate` — the only real codebase

57 TypeScript files under `orchestrate/skills/orchestrate/scripts/`. Everything else in the
repo is prose plus JSON. If a task touches executable behaviour, it is almost certainly here.

```
cli.ts, cli/       command surface; comments.ts posts to Slack
core/              redact-body.ts, checkpoint, retry queue, andon
adapters/slack/    Slack web client
tools/             probe-models, JSON-schema generation
__tests__/         28 files
```

Deps: `@cursor/sdk`, `@slack/web-api`, `commander`, `zod`, `zod-to-json-schema`. Dev: biome,
typescript 6, bun-types. Scripts: `test`, `typecheck`, `lint`, `format`, `check`, `cli`,
`generate-schemas`.

**Its suite reports 74 pass / 24 fail / 21 errors, and the failures are environmental.** There
is no `node_modules/` inside `scripts/`, so `@cursor/sdk`, `@slack/web-api` and `zod/v3` do not
resolve. Run `bun install` there first, or scope to a self-contained file:

```bash
cd orchestrate/skills/orchestrate/scripts
bun test __tests__/redact-body.test.ts
```

### The one design detail worth reading before touching it

`cli/comments.ts` gates every outbound comment:

```ts
function requireSafeCommentBody(body: string): string {
  const result = redactBody(body);
  if (result.reasons.length === 0) return result.text;   // published as-is
  throw new Error(`comment body refused: ...`);
}
```

The rule is **"no reasons → publish"**. Consequences, and it is easy to get these backwards:

- A credential keyword `redactBody` does **not** know produces no reason, so the line is
  published verbatim. That is a **bypass**, not a redaction miss.
- A line that **does** trigger a reason is refused entirely, so imperfect redaction of that
  line never ships anywhere.

So severity for anything in `redact-body.ts` depends on which side of that gate it falls on.
On `main`, `AWS_ACCESS_KEY_ID=…`, `{"api_key": "…"}` and `CLIENT_SECRET=…` all produce no
reasons.

---

## 7. Content health, measured

There is no in-repo content checker. These numbers come from an external portability validator
(`node /home/user/hgear/bin/hgear.mjs check <dir>`) which reads pointers, host-specific
mechanics and citations:

| Pack | Errors | Warnings |
|---|---|---|
| `pstack` | 105 | 29 |
| `thermos` | 5 | 1 |
| `continual-learning` | 3 | 0 |
| `cursor-team-kit` | 2 | 5 |
| `orchestrate` | 1 | 3 |
| `cursor-sdk` | 0 | 8 |
| other 7 first-party | 0 | 0 |
| all 18 `third_party` | 0 | 1 each ("no SKILL.md; nothing to validate") |

**Read this correctly.** The error mass is one pack: pstack contributes 105 of ~116, the other
30 share ~11, and 8 of 13 first-party packs are completely clean. "Cursor packs are sloppy" is
the wrong conclusion.

The dominant single signal is `disable-model-invocation` in frontmatter (42 in pstack), a
Cursor-only field inert in other hosts while still reading as configuration. The rest:
hardcoded per-call model slugs, `~/.cursor/projects/**` transcript paths, and
`subagent_type: generalPurpose`. All of it is Cursor-coupling, which is legitimate in a Cursor
marketplace and only matters if a pack is meant to travel.

---

## 8. Where the risk actually sits

Ranked by what could bite:

1. **`orchestrate`'s outbound Slack path.** The only code in the repo that transmits data
   externally, gated by an allow-on-silence rule (§6). Untested in CI.
2. **Hook commands.** Two packs execute shell on `stop` / `afterAgentResponse`. Nothing
   validates the command exists or is safe.
3. **`third_party` MCP tokens.** 18 servers reading env vars like
   `${GITHUB_PERSONAL_ACCESS_TOKEN}`. Configuration only, but it is where credentials enter.
4. **Prose changes.** Unreviewed by any automation, and prose is what instructs the agent.

---

## 9. Not worth your tokens

- **Re-measuring packs by reading files.** §7 is one command per pack.
- **The 24 failing `orchestrate` tests.** Missing dependencies (§6).
- **`third_party/**`.** 18 near-identical 6-file configs, no skills, nothing to audit.
- **Assuming `main` is yours.** It tracks Cursor upstream; diverging it makes syncs painful.

## 10. Fastest orientation

```bash
cd /home/user/plugins
node scripts/validate-plugins.mjs                 # manifests + catalogue, ~1s
ls */.cursor-plugin/plugin.json | wc -l           # 13 first-party
ls third_party/*/.cursor-plugin/plugin.json | wc -l   # 18 MCP-only
cat create-plugin/skills/*/SKILL.md               # the repo's own authoring rules
find orchestrate -name '*.ts' -not -path '*/node_modules/*' | wc -l   # 57
```
