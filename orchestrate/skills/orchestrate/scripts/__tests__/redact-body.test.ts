import { describe, expect, test } from "bun:test";

import { redactBody } from "../core/redact-body.ts";

describe("redactBody", () => {
  test("refuses filepath-shaped bodies", () => {
    const result = redactBody(
      "/workspace/app/src/foo.ts\n/Users/example/repo/package.json\nerror at node_modules/.pnpm/pkg/index.ts"
    );

    expect(result.reasons).toContain("contains /workspace path");
    expect(result.reasons).toContain("contains /Users path");
    expect(result.reasons).toContain("contains .pnpm path");
    expect(result.text).toContain("[redacted-path]");
  });

  test("refuses log dumps", () => {
    const result = redactBody(
      [
        "@example/proto:generate: a",
        "@example/proto:generate: b",
        "@example/proto:generate: c",
        "@example/proto:generate: d",
        "@example/proto:generate: e",
      ].join("\n")
    );

    expect(result.reasons).toContain("looks like a log dump");
  });

  test("refuses oversized bodies", () => {
    const result = redactBody("x".repeat(2_049));

    expect(result.reasons).toContain("exceeds 2048 character limit");
  });

  test("refuses bare SHAs but allows backticked SHAs", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";

    expect(redactBody(sha).reasons).toContain("contains bare 40-char SHA");
    expect(redactBody(`\`${sha}\``).reasons).toEqual([]);
  });

  test.each([
    ["GITHUB_TOKEN=ghp_deadbeefcafe", "ghp_deadbeefcafe"],
    ["AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI0K7", "wJalrXUtnFEMI0K7"],
    ["STRIPE_SECRET_KEY=sk_live_51H", "sk_live_51H"],
    ["DB_PASSWORD=hunter2", "hunter2"],
    ["MY_API_KEY=abc123", "abc123"],
  ])("redacts prefixed env-var credentials: %s", (input, value) => {
    // Regression. The keyword used to be anchored with \b on both sides, and `_` is
    // a word character, so there was no boundary between `_` and `token` and every
    // PREFIXED environment-variable name passed through unredacted. Those are the
    // commonest real credential shapes, and AWS_SECRET_ACCESS_KEY is the canonical
    // leaked one, so this was the gap that mattered most.
    const result = redactBody(input);

    expect(result.text).not.toContain(value);
    expect(result.text).toContain("[redacted]");
    expect(result.reasons).toContain("contains sensitive key");
  });

  test("still redacts the bare forms the old anchoring did catch", () => {
    for (const input of ["token=abc", "password=hunter2", "api_key=k"]) {
      expect(redactBody(input).text).toContain("[redacted]");
    }
  });

  test("does not redact a key merely named without a value", () => {
    // Widening the key match must not turn advice into a redaction.
    const result = redactBody("read it from GITHUB_TOKEN in the environment");

    expect(result.text).toBe("read it from GITHUB_TOKEN in the environment");
    expect(result.reasons).toEqual([]);
  });

  test("allows concise operational context", () => {
    const result = redactBody("blocked: docker rate-limit on redis:7");

    expect(result).toEqual({
      text: "blocked: docker rate-limit on redis:7",
      reasons: [],
    });
  });
});

// An adversarial review of the published output found the redactor stamping
// `[redacted]` on a line that still carried the live credential. Output that
// advertises screening while shipping the secret is worse than no redaction,
// because a reader stops looking at it.
describe("the value half of an assignment", () => {
  test("takes the token after an auth scheme, not just the scheme word", () => {
    // Was: "Authorization=[redacted] ghp_liveSecretValue123".
    const { text } = redactBody("Authorization: Bearer ghp_liveSecretValue123");
    expect(text).not.toContain("ghp_liveSecretValue123");
    expect(text).toBe("Authorization=[redacted]");
    for (const scheme of ["Basic", "Token", "Digest"]) {
      expect(redactBody(`Authorization: ${scheme} sEcReTvALue`).text).not.toContain("sEcReTvALue");
    }
  });

  test("takes a quoted value containing spaces", () => {
    // `\S+` stopped at the first space and left the rest of the secret in place.
    const { text } = redactBody('DB_PASSWORD="hunter 2 spaces"');
    expect(text).not.toContain("hunter");
    expect(text).not.toContain("spaces");
  });

  test("reads a quoted KEY, which is the shape a JSON body uses", () => {
    const { text } = redactBody('{"api_key": "abc123"}');
    expect(text).not.toContain("abc123");
  });

  test("knows the AWS and client-secret vocabularies", () => {
    for (const line of [
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
      "PRIVATE_KEY=-----BEGINRSA",
      "CLIENT_SECRET=s3cr3t",
      "MY_CREDENTIAL=abc",
    ]) {
      const value = line.split("=")[1];
      expect(redactBody(line).text).not.toContain(value);
    }
  });

  test("still over-redacts rather than under-redacts an ambiguous name", () => {
    // TOKENS_USED is a counter, not a credential, and it is redacted anyway. That
    // is the correct direction to be wrong in: a screen that fails open ships the
    // thing it exists to catch.
    expect(redactBody("TOKENS_USED=15234").text).toBe("TOKENS_USED=[redacted]");
  });
});
