import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimits } from "@/lib/voice/rate-limit";

test("the limiter allows the configured number of requests then blocks", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = checkRateLimit("test", "user-1", 3, 60_000, now);
    assert.equal(result.allowed, true);
  }
  const blocked = checkRateLimit("test", "user-1", 3, 60_000, now + 1000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 59);
  assert.equal(blocked.remaining, 0);
});

test("different users and scopes have independent buckets", () => {
  resetRateLimits();
  assert.equal(checkRateLimit("test", "user-1", 1, 60_000).allowed, true);
  assert.equal(checkRateLimit("test", "user-1", 1, 60_000).allowed, false);
  assert.equal(checkRateLimit("test", "user-2", 1, 60_000).allowed, true);
  assert.equal(checkRateLimit("other", "user-1", 1, 60_000).allowed, true);
});

test("the window slides and allows traffic again", () => {
  resetRateLimits();
  const now = 2_000_000;
  assert.equal(checkRateLimit("slide", "user-1", 1, 1000, now).allowed, true);
  assert.equal(checkRateLimit("slide", "user-1", 1, 1000, now + 500).allowed, false);
  assert.equal(checkRateLimit("slide", "user-1", 1, 1000, now + 1001).allowed, true);
});
