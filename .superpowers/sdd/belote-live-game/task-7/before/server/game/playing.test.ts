import test from "node:test";
import assert from "node:assert/strict";

import type { Card } from "./cards.ts";
import type { Contract } from "./contracts.ts";
import { legalPlays, reducePlay } from "./playing.ts";
import type { PlayingHand } from "./types.ts";

const hearts: Contract = { kind: "suit", suit: "hearts" };

const c = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });
const labels = (cards: readonly Card[]) =>
  cards.map((card) => `${card.suit}:${card.rank}`).sort();

function hand(overrides: Partial<PlayingHand> = {}): PlayingHand {
  return {
    phase: "playing",
    dealer: 0,
    turn: 0,
    hands: { 0: [], 1: [], 2: [], 3: [] },
    contract: hearts,
    taker: 0,
    trick: [],
    tricks: [],
    ...overrides,
  };
}

// --- legalPlays -------------------------------------------------------------

test("leading a trick allows any card", () => {
  const plays = hand({ hands: { 0: [c("clubs", "K"), c("hearts", "7")], 1: [], 2: [], 3: [] } });

  assert.deepEqual(labels(legalPlays(plays, 0)), labels([c("clubs", "K"), c("hearts", "7")]));
});

test("following suit restricts the choice", () => {
  const plays = hand({
    hands: { 0: [c("spades", "A"), c("hearts", "7"), c("spades", "Q")], 1: [], 2: [], 3: [] },
    trick: [{ seat: 0, card: c("spades", "K") }],
    turn: 2,
  });

  assert.deepEqual(labels(legalPlays(plays, 0)), labels([c("spades", "A"), c("spades", "Q")]));
});

test("when the partner is master a player may play anything", () => {
  const plays = hand({
    hands: { 0: [], 1: [], 2: [c("clubs", "K"), c("diamonds", "7")], 3: [] },
    trick: [{ seat: 0, card: c("spades", "A") }],
    turn: 2,
  });

  // seat 2's partner (seat 0) holds the winning A♠
  assert.deepEqual(labels(legalPlays(plays, 2)), labels([c("clubs", "K"), c("diamonds", "7")]));
});

test("when the partner is not master a player without the led suit must trump", () => {
  const plays = hand({
    hands: { 0: [], 1: [], 2: [c("hearts", "7"), c("hearts", "Q"), c("clubs", "K"), c("diamonds", "7")], 3: [] },
    trick: [
      { seat: 0, card: c("spades", "K") },
      { seat: 1, card: c("spades", "A") },
    ],
    turn: 2,
  });

  assert.deepEqual(labels(legalPlays(plays, 2)), labels([c("hearts", "7"), c("hearts", "Q")]));
});

// --- reducePlay -------------------------------------------------------------

test("reducePlay removes the card and advances the turn", () => {
  const plays = hand({ hands: { 0: [c("clubs", "K"), c("hearts", "7")], 1: [], 2: [], 3: [] } });

  const next = reducePlay(plays, 0, c("clubs", "K"));

  assert.deepEqual(labels(next.hands[0]), labels([c("hearts", "7")]));
  assert.equal(next.turn, 1);
  assert.deepEqual(next.trick, [{ seat: 0, card: c("clubs", "K") }]);
});

test("reducePlay does not mutate the input hand", () => {
  const plays = hand({ hands: { 0: [c("clubs", "K")], 1: [], 2: [], 3: [] } });

  reducePlay(plays, 0, c("clubs", "K"));

  assert.equal(plays.hands[0].length, 1);
  assert.equal(plays.trick.length, 0);
});

test("the fourth play resolves the trick and the winner leads next", () => {
  const plays = hand({
    hands: { 0: [c("spades", "7")], 1: [c("clubs", "7")], 2: [c("diamonds", "7")], 3: [c("hearts", "7")] },
  });

  let current = plays;
  current = reducePlay(current, 0, c("spades", "7"));
  current = reducePlay(current, 1, c("clubs", "7"));
  current = reducePlay(current, 2, c("diamonds", "7"));
  current = reducePlay(current, 3, c("hearts", "7"));

  assert.equal(current.tricks.length, 1);
  assert.equal(current.trick.length, 0);
  assert.equal(current.turn, 3); // 7♥ is trump and wins
  assert.equal(current.tricks[0].length, 4);
});
