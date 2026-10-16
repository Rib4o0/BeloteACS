import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAction,
  createMatch,
  publicState,
  seededRng,
  type Action,
} from "./game/index.ts";
import { chooseAction } from "./randomBot.ts";

const SEATS: [string, string, string, string] = ["p0", "p1", "p2", "p3"];

/** Structural equality for engine actions. */
function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pass") return true;
  if (a.kind === "bid" && b.kind === "bid") {
    if (a.contract.kind !== b.contract.kind) return false;
    if (a.contract.kind === "suit") {
      return b.contract.kind === "suit" && a.contract.suit === b.contract.suit;
    }
    return true;
  }
  if (a.kind === "play" && b.kind === "play") {
    return a.card.suit === b.card.suit && a.card.rank === b.card.rank;
  }
  return false;
}

test("picks a move that is in the legal set", () => {
  const match = createMatch(SEATS, seededRng(1));
  const view = publicState(match, "p1"); // seat 1 opens the bidding

  const action = chooseAction(view, seededRng(2));

  assert.ok(action);
  assert.ok(view.legal.some((legal) => sameAction(legal, action)));
});

test("returns null when there is no legal action", () => {
  const match = createMatch(SEATS, seededRng(1));
  const view = publicState(match, "p0"); // not seat 0's turn

  assert.equal(view.legal.length, 0);
  assert.equal(chooseAction(view, seededRng(2)), null);
});

test("the same seed picks the same move", () => {
  const match = createMatch(SEATS, seededRng(1));
  const view = publicState(match, "p1");

  assert.deepEqual(chooseAction(view, seededRng(9)), chooseAction(view, seededRng(9)));
});

test("works in the playing phase too", () => {
  const rng = seededRng(3);
  let match = createMatch(SEATS, rng);
  // Bid once so the auction settles into trick play.
  match = applyAction(
    match,
    { kind: "bid", playerId: "p1", contract: { kind: "suit", suit: "spades" } },
    rng,
  ).match;

  for (let guard = 0; guard < 20 && match.hand.phase !== "playing"; guard++) {
    const onTurn = match.seats[match.hand.turn];
    match = applyAction(match, { kind: "pass", playerId: onTurn }, rng).match;
  }

  assert.equal(match.hand.phase, "playing");
  const onTurn = match.seats[match.hand.turn];
  const view = publicState(match, onTurn);
  const action = chooseAction(view, seededRng(4));

  assert.ok(action);
  assert.equal(action.kind, "play");
  assert.ok(view.legal.some((legal) => sameAction(legal, action)));
});
