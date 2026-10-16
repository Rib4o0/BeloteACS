import test from "node:test";
import assert from "node:assert/strict";

import {
  bidStrength,
  CONTRACTS,
  isStronger,
  trumpSuit,
  type Contract,
} from "./contracts.ts";

const clubs: Contract = { kind: "suit", suit: "clubs" };
const diamonds: Contract = { kind: "suit", suit: "diamonds" };
const hearts: Contract = { kind: "suit", suit: "hearts" };
const spades: Contract = { kind: "suit", suit: "spades" };
const noTrump: Contract = { kind: "nt" };
const allTrumps: Contract = { kind: "at" };

test("bid strength follows clubs < diamonds < hearts < spades < nt < at", () => {
  const ascending = [clubs, diamonds, hearts, spades, noTrump, allTrumps];

  for (let i = 1; i < ascending.length; i++) {
    assert.ok(
      bidStrength(ascending[i]) > bidStrength(ascending[i - 1]),
      `${ascending[i].kind} should outrank ${ascending[i - 1].kind}`,
    );
  }
});

test("CONTRACTS lists every contract in ascending strength", () => {
  assert.deepEqual(CONTRACTS, [clubs, diamonds, hearts, spades, noTrump, allTrumps]);
});

test("isStronger is true only for a strictly higher contract", () => {
  assert.equal(isStronger(spades, clubs), true);
  assert.equal(isStronger(allTrumps, noTrump), true);
  assert.equal(isStronger(clubs, spades), false);
  assert.equal(isStronger(clubs, clubs), false);
});

test("trumpSuit returns the suit for suit contracts", () => {
  assert.equal(trumpSuit(hearts), "hearts");
  assert.equal(trumpSuit(spades), "spades");
});

test("trumpSuit is undefined for no-trump and all-trumps", () => {
  assert.equal(trumpSuit(noTrump), undefined);
  assert.equal(trumpSuit(allTrumps), undefined);
});
