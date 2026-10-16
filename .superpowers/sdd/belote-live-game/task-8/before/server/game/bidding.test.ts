import test from "node:test";
import assert from "node:assert/strict";

import { CONTRACTS, type Contract } from "./contracts.ts";
import { biddingResult, legalBids, passBid, placeBid } from "./bidding.ts";
import type { BiddingHand } from "./types.ts";

const clubs: Contract = { kind: "suit", suit: "clubs" };
const spades: Contract = { kind: "suit", suit: "spades" };
const allTrumps: Contract = { kind: "at" };

function hand(overrides: Partial<BiddingHand> = {}): BiddingHand {
  return {
    phase: "bidding",
    dealer: 0,
    turn: 1,
    hands: { 0: [], 1: [], 2: [], 3: [] },
    rest: { 0: [], 1: [], 2: [], 3: [] },
    top: null,
    topBidder: null,
    passesInARow: 0,
    ...overrides,
  };
}

test("legalBids offers every contract when there is no bid", () => {
  assert.deepEqual(legalBids(hand()), CONTRACTS);
});

test("legalBids offers only strictly stronger contracts", () => {
  assert.deepEqual(legalBids(hand({ top: clubs })), [
    { kind: "suit", suit: "diamonds" },
    { kind: "suit", suit: "hearts" },
    { kind: "suit", suit: "spades" },
    { kind: "nt" },
    { kind: "at" },
  ]);
});

test("legalBids offers nothing once all-trumps is on the table", () => {
  assert.deepEqual(legalBids(hand({ top: allTrumps })), []);
});

test("placeBid records the bid, resets passes and advances the turn", () => {
  const next = placeBid(hand({ passesInARow: 2 }), 1, { kind: "suit", suit: "hearts" });

  assert.deepEqual(next.top, { kind: "suit", suit: "hearts" });
  assert.equal(next.topBidder, 1);
  assert.equal(next.passesInARow, 0);
  assert.equal(next.turn, 2);
});

test("placeBid does not mutate the input hand", () => {
  const original = hand();

  placeBid(original, 1, { kind: "suit", suit: "hearts" });

  assert.equal(original.top, null);
  assert.equal(original.turn, 1);
});

test("passBid increments the pass count and advances the turn counter-clockwise", () => {
  const next = passBid(hand({ turn: 3 }), 3);

  assert.equal(next.passesInARow, 1);
  assert.equal(next.turn, 0);
});

test("passBid does not mutate the input hand", () => {
  const original = hand();

  passBid(original, 1);

  assert.equal(original.passesInARow, 0);
  assert.equal(original.turn, 1);
});

test("biddingResult is null while the auction is open", () => {
  assert.equal(biddingResult(hand()), null);
  assert.equal(biddingResult(hand({ top: clubs, topBidder: 1, passesInARow: 2 })), null);
});

test("biddingResult names the taker after three passes behind a bid", () => {
  const result = biddingResult(hand({ top: spades, topBidder: 2, passesInARow: 3 }));

  assert.deepEqual(result, { taker: 2, contract: spades });
});

test("biddingResult asks for a redeal when all four pass", () => {
  assert.equal(biddingResult(hand({ passesInARow: 4 })), "redeal");
});
