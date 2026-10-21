import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeOwnedMessage,
  authorizeOwnedProfile,
  requireSessionProfile,
} from "@/lib/voice/access";

const ownProfile = { id: "profile-1", userId: "user-1" };
const familyProfile = { id: "profile-2", userId: "user-2" };

test("unauthenticated requests are rejected before profile lookup", () => {
  assert.deepEqual(authorizeOwnedProfile(null, "profile-1", [ownProfile]), {
    ok: false,
    reason: "UNAUTHENTICATED",
  });
  assert.deepEqual(authorizeOwnedMessage(undefined, { profile: { userId: "user-1" } }), {
    ok: false,
    reason: "UNAUTHENTICATED",
  });
});

test("a user cannot read another account's profile by changing the id", () => {
  const result = authorizeOwnedProfile("user-1", familyProfile.id, [ownProfile, familyProfile]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "FORBIDDEN");
});

test("a user cannot spoof ownership by claiming another userId on the profile", () => {
  const tampered = { id: "profile-1", userId: "user-2" };
  const result = authorizeOwnedProfile("user-1", "profile-1", [tampered]);
  assert.equal(result.ok, false);
});

test("the active profile is allowed when ownership matches", () => {
  const result = authorizeOwnedProfile("user-1", "profile-1", [ownProfile, familyProfile]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.id, "profile-1");
});

test("a chat message from another account is reported as not found", () => {
  const foreign = { id: "message-1", profile: { userId: "user-2" } };
  const result = authorizeOwnedMessage("user-1", foreign);
  assert.deepEqual(result, { ok: false, reason: "NOT_FOUND" });
});

test("missing messages do not reveal whether an id exists", () => {
  assert.deepEqual(authorizeOwnedMessage("user-1", null), { ok: false, reason: "NOT_FOUND" });
});

test("own messages pass ownership", () => {
  const own = { id: "message-2", profile: { userId: "user-1" } };
  const result = authorizeOwnedMessage("user-1", own);
  assert.equal(result.ok, true);
});

test("session profile helper never fabricates a profile", () => {
  assert.deepEqual(requireSessionProfile(null, { id: "profile-1" }), {
    ok: false,
    reason: "UNAUTHENTICATED",
  });
  assert.deepEqual(requireSessionProfile("user-1", null), {
    ok: false,
    reason: "NO_PROFILE",
  });
  assert.deepEqual(requireSessionProfile("user-1", { id: "profile-1" }), {
    ok: true,
    value: { id: "profile-1" },
  });
});
