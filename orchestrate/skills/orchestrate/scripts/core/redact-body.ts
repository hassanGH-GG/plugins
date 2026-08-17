const MAX_BODY_CHARS = 2_048;
const SENSITIVE_KEY_RE =
  /token|secret|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization/i;
// The keyword allows affixes on both sides. Anchoring it with \b on each side
// (the previous form) misses every PREFIXED environment-variable name, because `_`
// is a word character so there is no boundary between `_` and `token`. That let
// GITHUB_TOKEN=, AWS_SECRET_ACCESS_KEY=, STRIPE_SECRET_KEY= and DB_PASSWORD= pass
// through unredacted, which are the commonest real credential shapes there are.
// The captured key is still re-tested against SENSITIVE_KEY_RE below, so widening
// the match here cannot widen what counts as sensitive.
// The VALUE half matters as much as the key half, and it used to be `\S+`, which
// stops at the first space. `Authorization: Bearer ghp_liveSecret` therefore
// redacted the word `Bearer` and shipped the token immediately after it, next to a
// `[redacted]` stamp. Output that advertises screening while carrying the
// credential is worse than no redaction, because a reader stops looking.
//
// So a value is now: an optional auth scheme plus its token, OR a quoted string
// (which may contain spaces, as `DB_PASSWORD="hunter 2 spaces"` does), OR a bare
// run. The KEY half also accepts surrounding quotes, because `{"api_key": "abc"}`
// is the shape a JSON body uses and the unquoted-only form never matched it.
const SENSITIVE_ASSIGNMENT_RE =
  /(["']?)([A-Za-z0-9_.-]*(?:token|secret|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization)[A-Za-z0-9_.-]*)\1\s*[:=]\s*(?:(?:Bearer|Basic|Token|Digest)\s+\S+|"[^"\n]*"|'[^'\n]*'|\S+)/gi;
const PATH_PATTERNS = [
  { re: /^\/workspace\/\S*/gm, reason: "contains /workspace path" },
  { re: /^\/Users\/\S*/gm, reason: "contains /Users path" },
  { re: /\.pnpm\/\S*/g, reason: "contains .pnpm path" },
];
const SHA_RE = /\b[0-9a-f]{40}\b/gi;
const LOG_PREFIX_RE = /^\s*@?[\w.-]+\/[\w.-]+:[\w.-]+:/;

export function redactBody(text: string): { text: string; reasons: string[] } {
  const reasons = new Set<string>();
  let redacted = text;

  if (text.length > MAX_BODY_CHARS) {
    reasons.add(`exceeds ${MAX_BODY_CHARS} character limit`);
  }

  redacted = redactSensitiveAssignments(redacted, reasons);
  redacted = redactPaths(redacted, reasons);
  redacted = redactShasOutsideBackticks(redacted, reasons);

  if (logPrefixLines(text) >= 5) {
    reasons.add("looks like a log dump");
  }

  return { text: redacted, reasons: [...reasons] };
}

function redactSensitiveAssignments(
  text: string,
  reasons: Set<string>
): string {
  return text.replace(SENSITIVE_ASSIGNMENT_RE, (match, _quote: string, key: string) => {
    if (SENSITIVE_KEY_RE.test(key ?? "")) {
      reasons.add("contains sensitive key");
      return `${key}=[redacted]`;
    }
    return match;
  });
}

function redactPaths(text: string, reasons: Set<string>): string {
  let out = text;
  for (const { re, reason } of PATH_PATTERNS) {
    out = out.replace(re, () => {
      reasons.add(reason);
      return "[redacted-path]";
    });
  }
  return out;
}

function redactShasOutsideBackticks(
  text: string,
  reasons: Set<string>
): string {
  return text
    .split("`")
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(SHA_RE, () => {
        reasons.add("contains bare 40-char SHA");
        return "[redacted-sha]";
      });
    })
    .join("`");
}

function logPrefixLines(text: string): number {
  return text.split(/\r?\n/).filter(line => LOG_PREFIX_RE.test(line)).length;
}
