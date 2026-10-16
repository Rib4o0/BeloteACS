import test from "node:test";
import assert from "node:assert/strict";

import { parseAction } from "./actionBody.ts";

test("parses a pass and stamps the cookie player id", () => {
  assert.deepEqual(parseAction({ kind: "pass" }, "me"), {
    kind: "pass",
    playerId: "me",
  });
});

test("parses a play with a valid card", () => {
  assert.deepEqual(parseAction({ kind: "play", card: { suit: "hearts", rank: "A" } }, "me"), {
    kind: "play",
    playerId: "me",
    card: { suit: "hearts", rank: "A" },
  });
});

test("parses a bid with a valid contract", () => {
  assert.deepEqual(parseAction({ kind: "bid", contract: { kind: "nt" } }, "me"), {
    kind: "bid",
    playerId: "me",
    contract: { kind: "nt" },
  });
});

test("ignores a playerId supplied in the body", () => {
  const action = parseAction({ kind: "pass", playerId: "someone-else" }, "me");

  assert.equal(action?.playerId, "me");
});

test("rejects unknown kinds and malformed payloads", () => {
  assert.equal(parseAction({ kind: "dance" }, "me"), null);
  assert.equal(parseAction({ kind: "play", card: { suit: "hearts" } }, "me"), null);
  assert.equal(parseAction({ kind: "bid", contract: { kind: "suit" } }, "me"), null);
  assert.equal(parseAction(null, "me"), null);
  assert.equal(parseAction("nonsense", "me"), null);
});
