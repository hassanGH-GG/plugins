# `hassanGH-GG/plugins` — orientation brief

Written so the next agent does not have to re-derive any of this. Everything below was
measured against `main` at `2a80444` on 2026-08-18, not recalled. Where a number could drift,
the command that produced it is given so you can re-run it instead of trusting it.

---

## 1. What this repo is

A **fork of Cursor's official plugin marketplace**. `.cursor-plugin/marketplace.json` names it
`cursor-plugins`, owner `Cursor <plugins@cursor.com>`, described as "Official Cursor plugin
marketplace: developer tools, framework rules, MCP integrations, and agent skills".

**It is a distribution catalogue, not an application.** 31 plugin directories, each
self-contained with its own `.cursor-plugin/plugin.json`. There is no build, no app to run,
no shared runtime. Two schemas and one validator script are the entire machinery.

`main` tracks upstream. Merge commits read `from cursor/cursor/<branch>`, so the upstream org
is `cursor` and the repo keeps the fork's name `plugins`. **Nobody verified the exact upstream
path from inside this session** (an `add_repo` for it was refused), so confirm it on the
fork's GitHub page before opening a PR upstream.

---

## 2. Layout

```
.cursor-plugin/marketplace.json   the catalogue: one entry per plugin {name, source, description}
schemas/plugin.schema.json        per-plugin manifest schema
schemas/marketplace.schema.json   catalogue schema
scripts/validate-plugins.mjs      the ONLY validation in the repo
.github/workflows/validate-plugins.yml
<13 first-party pack dirs>/
third_party/<18 MCP-only pack dirs>/
node_modules/                     ajv + ajv-formats, for the validator only
```

### The 13 first-party packs

| Pack | Skills | Size | Declares |
|---|---|---|---|
| `pstack` | 47 | 3.6M | skills, agents |
| `cursor-team-kit` | 18 | 304K | skills, agents, rules |
| `orchestrate` | 1 | 864K | skills |
| `thermos` | 3 | 144K | skills, agents |
| `ralph-loop` | 3 | 128K | skills, hooks |
| `create-plugin` | 2 | 120K | skills, agents, rules |
| `teaching` | 2 | 100K | skills |
| `continual-learning` | 1 | 124K | skills, agents, hooks |
| `cursor-sdk` | 1 | 120K | skills |
| `agent-compatibility` | 1 | 84K | skills, agents |
| `pr-review-canvas` | 1 | 68K | skills |
| `docs-canvas` | 1 | 64K | skills |
| `cli-for-agent` | 1 | 32K | skills |

`third_party/` holds 18 MCP-server packs (apollo-io, ashby, circleback, clay, docusign,
github, gmail, gong, google-calendar, google-drive, hubspot, intercom, navan, playwright,
profound, salesforce, x, zoom). Each is 6 files: manifest, `mcp.json`, README, LICENSE,
CHANGELOG, logo. **They ship no skills.** Treat them as configuration, not code.

---

## 3. The manifest contract, which is the thing most worth knowing

`schemas/plugin.schema.json`:

- **`name` is the ONLY required field.**
- **`additionalProperties: false`** — an unknown key is a hard schema failure.
- Full key set: `name, displayName, description, version, minClientVersions, author,
  publisher, homepage, repository, license, logo, keywords, category, tags, commands, agents,
  skills, rules, hooks, variables, mcpServers`.
- Component fields (`skills`, `agents`, `rules`, `commands`) are `stringOrStringArray`,
  documented as **"Glob pattern(s) or path(s)"**. `hooks` is `oneOf[string, object]` — a path
  OR an inline object.

**The trap that costs people the most time:** all 13 first-party packs declare components as a
**directory path**, `"skills": "./skills/"`, not a glob. Any tooling you write that treats
those values as globs will report every pack as empty. Expand a value as: strip a leading
`./`; if it has no glob metacharacters and names a directory, treat it as `<dir>/**`.

**Components are declared, never auto-discovered.** A `SKILL.md` no declaration matches is
dead on install, silently.

---

## 4. What is validated, and what is not

`scripts/validate-plugins.mjs` (run by `node scripts/validate-plugins.mjs`, needs `ajv` +
`ajv-formats`, already in `node_modules/`) checks:

- every marketplace entry's `source` directory exists
- each `plugin.json` parses and validates against the schema
- the marketplace file validates against its schema

CI runs it on `pull_request`, but only under these `paths:` filters:

```yaml
paths:
  - ".cursor-plugin/marketplace.json"
  - "**/plugin.json"
  - "schemas/**"
```

**`SKILL.md` content is excluded from CI entirely.** No workflow reads a skill body. A PR that
changes only prose runs no checks at all. This is the single most important fact about this
repo's quality posture: **manifests are gated, content is not.**

There is also no repo-level `package.json`, no lint, no typecheck, and no test job.

---

## 5. Content health, measured

Run against each pack with `node /home/user/hgear/bin/hgear.mjs check <dir>` (a portability
validator that reads pointers, host mechanics and citations — see §8):

| Pack | Errors | Warnings |
|---|---|---|
| `pstack` | 105 | 29 |
| `thermos` | 5 | 1 |
| `continual-learning` | 3 | 0 |
| `cursor-team-kit` | 2 | 5 |
| `orchestrate` | 1 | 3 |
| `cursor-sdk` | 0 | 8 |
| the other 7 first-party | 0 | 0 |
| all 18 `third_party` | 0 | 1 each ("no SKILL.md; nothing to validate") |

**Read this correctly: the error mass is one pack.** pstack contributes 105 of ~116; the
other 30 share ~11 between them, and 8 of 13 first-party packs are completely clean. "Cursor
packs are sloppy" would be the wrong conclusion.

The dominant single signal is `disable-model-invocation` in frontmatter (42 occurrences in
pstack), a Cursor-only field that is inert in other hosts while still reading as
configuration. The rest is hardcoded per-call model slugs, `~/.cursor/projects/**` transcript
paths, and `subagent_type: generalPurpose`.

---

## 6. `orchestrate` — the only real codebase here

57 TypeScript files under `orchestrate/skills/orchestrate/scripts/`. Everything else in the
repo is prose plus JSON. If a task involves executable behaviour, it is almost certainly here.

```
cli.ts, cli/       command surface (comments.ts posts to Slack)
core/              redact-body.ts, checkpoint, retry queue, andon
adapters/slack/    Slack web client
tools/             probe-models, schema generation
__tests__/         28 files
```

**Its test suite: 74 pass, 24 fail, 21 errors — and the failures are ENVIRONMENTAL.** There is
no `node_modules/` inside `scripts/`, so `@cursor/sdk`, `@slack/web-api` and `zod/v3` do not
resolve. Do not spend time "fixing" them; run `bun install` in that directory first if you
need them, or scope your run to one file:

```bash
cd orchestrate/skills/orchestrate/scripts
bun test __tests__/redact-body.test.ts     # self-contained, 17 pass
```

**The security-relevant design to understand before touching `core/redact-body.ts`:**

```ts
// cli/comments.ts
function requireSafeCommentBody(body: string): string {
  const result = redactBody(body);
  if (result.reasons.length === 0) return result.text;   // published as-is
  throw new Error(`comment body refused: ...`);
}
```

The gate is **"no reasons → publish"**. So a credential keyword the pattern does not know is
not a redaction miss, it is a **bypass** — the line goes to Slack verbatim. Conversely a line
that DOES trigger a reason is refused entirely, so imperfect redaction of that line never
ships. Getting this backwards is easy and changes how you rank any finding here.

---

## 7. State of the working branch

Branch `claude/cursor-pstack-overclock-analysis-8u81hq`, 4 commits ahead of `main`, based on
current `main`, pushed. Touches **two source files only**:

```
orchestrate/skills/orchestrate/scripts/core/redact-body.ts       (+25/-4)
orchestrate/skills/orchestrate/scripts/__tests__/redact-body.test.ts  (+80)
```

Plus `PR-BODY.md` (scaffolding for an upstream PR; delete once raised) and this file.

**What the change does.** Closes four credential shapes that were posted to Slack verbatim
because `SENSITIVE_KEY_RE` did not know them, or because the key was quoted:

| Input | On `main` |
|---|---|
| `AWS_ACCESS_KEY_ID=AKIA…` | posted verbatim |
| `{"api_key": "abc123"}` | posted verbatim |
| `CLIENT_SECRET=s3cr3t` | posted verbatim |
| `PRIVATE_KEY=…` | posted verbatim |

It also fixes the value pattern (`\S+` stopped at the first space, so
`Authorization: Bearer <token>` redacted only the word `Bearer`). That case does **not** leak
today because the caller refuses the body, and the PR body says so explicitly.

17 tests in the file, proved non-vacuous: reverting the value pattern alone reds 11.

**Known unfinished:** the fix extends a keyword vocabulary, so the next unusual credential
name gets through the same way. The structural fix is inverting the gate to fail closed on
anything key-shaped. That is a bigger change and belongs to whoever owns the plugin.

---

## 8. Related repos in this workspace

- **`/home/user/hgear`** — a zero-dependency portability validator plus a skill stack forked
  from pstack. `node bin/hgear.mjs check <dir>` produced every number in §5. 83 tests. Useful
  here as a content checker, since this repo's CI has none.
- **`/home/user/overclock`** — a separate SaaS seed. Its `.agents/skills/` is an adapted
  superset of pstack's skills (54 vs 47, 0 portability errors vs 105). If you need a
  better-maintained variant of any pstack skill, look there first.

---

## 9. Things not worth your tokens

- **Re-measuring the packs.** §5 is a single command per pack; re-run it rather than reading
  files to form an impression.
- **The 24 failing `orchestrate` tests.** Missing dependencies, not defects (§6).
- **`third_party/**`.** 18 near-identical 6-file MCP configs with no skills. Nothing to audit.
- **Adding CI for skill content without asking.** The absence is a policy of the upstream, not
  an oversight in this fork. Raise it, do not unilaterally fix it.
- **Assuming `main` is yours to push to.** It tracks Cursor upstream. Diverging it makes
  future syncs painful. Work on branches.

## 10. Fastest orientation commands

```bash
cd /home/user/plugins
node scripts/validate-plugins.mjs                      # manifests + catalogue, ~1s
ls */.cursor-plugin/plugin.json | wc -l                # first-party pack count
node /home/user/hgear/bin/hgear.mjs check pstack       # worst-case content health
cd orchestrate/skills/orchestrate/scripts && bun test __tests__/redact-body.test.ts
```
