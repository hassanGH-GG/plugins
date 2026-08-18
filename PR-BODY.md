## Summary

`redactBody` in the `orchestrate` plugin stamps `[redacted]` on a line while leaving the
credential on it. Given a real Authorization header:

```
Authorization: Bearer ghp_liveSecretValue123
```

it currently produces:

```
Authorization=[redacted] ghp_liveSecretValue123
```

The scheme word is redacted and the token travels beside the stamp. Output that advertises
screening while carrying the secret is worse than no redaction, because a reader stops
looking at it.

## Cause

The value half of `SENSITIVE_ASSIGNMENT_RE` is `\S+`, which stops at the first whitespace.
For `Authorization: Bearer <token>` that matches `Bearer` and nothing after it.

## Fix

A value is now an auth scheme plus its token, **or** a quoted string (which may contain
spaces), **or** a bare run. The key half also accepts surrounding quotes.

Three further leaks closed in the same pass, each a shape that was passing through untouched:

| Input | Before | After |
|---|---|---|
| `Authorization: Bearer ghp_liveSecretValue123` | `Authorization=[redacted] ghp_liveSecretValue123` | `Authorization=[redacted]` |
| `{"api_key": "abc123"}` | unchanged | `{api_key=[redacted]}` |
| `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE` | unchanged | `AWS_ACCESS_KEY_ID=[redacted]` |
| `DB_PASSWORD="hunter 2 spaces"` | `DB_PASSWORD=[redacted] 2 spaces"` | `DB_PASSWORD=[redacted]` |

`AWS_ACCESS_KEY_ID`, `PRIVATE_KEY`, `CLIENT_SECRET` and `CREDENTIAL` were absent from the
keyword list; the quoted-key form is what a JSON body uses and the unquoted-only pattern
never matched it.

## What is deliberately unchanged

`TOKENS_USED=15234` is a counter and is still redacted. That is the correct direction to be
wrong in, and there is now a test asserting it so nobody "fixes" it into a leak.

## Tests

5 added, 17 in the file. Proved non-vacuous: reverting the value pattern alone reds 11 of
them.

```
bun test __tests__/redact-body.test.ts
 17 pass
 0 fail
```

The package's other suites were failing before this change and fail identically after it
(24 fail / 21 errors either side), so nothing here touches them.
