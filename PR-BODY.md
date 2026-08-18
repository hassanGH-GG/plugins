## Summary

`redactBody` misses several of the commonest credential shapes, and because
`requireSafeCommentBody` treats "no reasons" as "safe to publish", those lines are posted to
the Slack thread **verbatim**.

`cli/comments.ts`:

```ts
function requireSafeCommentBody(body: string): string {
  const result = redactBody(body);
  if (result.reasons.length === 0) return result.text;   // <- published as-is
  throw new Error(`comment body refused: ${result.reasons.join("; ")}`);
}
```

So a keyword the pattern does not know is not a redaction failure, it is a **gate bypass**.

## The leak

Run against `main`:

| Input | Result |
|---|---|
| `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE` | posted verbatim |
| `{"api_key": "abc123"}` | posted verbatim |
| `CLIENT_SECRET=s3cr3t` | posted verbatim |
| `PRIVATE_KEY=-----BEGINRSA` | posted verbatim |

Two causes:

1. **Vocabulary.** `SENSITIVE_KEY_RE` is `token|secret|password|api[_-]?key|authorization`.
   `ACCESS_KEY`, `CLIENT_SECRET`, `PRIVATE_KEY` and `CREDENTIAL` are not in it.
2. **Quoted keys.** `SENSITIVE_ASSIGNMENT_RE` requires the separator to follow the key
   immediately, so `"api_key": "abc123"` never matches. That is the shape a JSON body uses.

## Also fixed, though it does not leak today

`Authorization: Bearer ghp_liveSecretValue123` currently redacts to
`Authorization=[redacted] ghp_liveSecretValue123`: the value pattern is `\S+`, which stops at
the first space, so it captures `Bearer` and leaves the token.

That body **is** refused by the caller, so nothing reaches Slack. It is worth fixing anyway
because `result.text` is a published value by contract, and a future caller that uses it
without checking `reasons` would ship the credential with a `[redacted]` stamp beside it.
Output that advertises screening while carrying the secret is worse than no screening.

A value is now an auth scheme plus its token, **or** a quoted string (which may contain
spaces, as `DB_PASSWORD="hunter 2 spaces"` does), **or** a bare run.

## What is deliberately unchanged

`TOKENS_USED=15234` is a counter and is still redacted. Over-redaction is the correct
direction to be wrong in here, and there is now a test asserting it so nobody "fixes" it into
a leak.

## Tests

5 added, 17 in the file. Proved non-vacuous: reverting the value pattern alone reds 11.

```
bun test __tests__/redact-body.test.ts
 17 pass  0 fail
```

The package's other suites fail identically before and after this change (24 fail / 21
errors either side), so nothing here touches them.
