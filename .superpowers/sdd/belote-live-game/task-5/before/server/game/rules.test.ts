import test from "node:test";
import assert from "node:assert/strict";

import type { Card } from "./cards.ts";
import type { Contract } from "./contracts.ts";
import { legalCards, trickOrder, trickWinner } from "./rules.ts";
import type { Play, Seat } from "./types.ts";

const hearts: Contract = { kind: "suit", suit: "hearts" };
const noTrump: Contract = { kind: "nt" };
const allTrumps: Contract = { kind: "at" };

const c = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });
const play = (seat: Seat, suit: Card["suit"], rank: Card["rank"]): Play => ({
  seat,
  card: c(suit, rank),
});
const labels = (cards: readonly Card[]) =>
  cards.map((card) => `${card.suit}:${card.rank}`).sort();

// --- ordering ---------------------------------------------------------------

test("trump order is J > 9 > A > 10 > K > Q > 8 > 7", () => {
  const order = ["7", "8", "Q", "K", "10", "A", "9", "J"] as const;

  for (let i = 1; i < order.length; i++) {
    assert.ok(
      trickOrder(c("hearts", order[i]), hearts) > trickOrder(c("hearts", order[i - 1]), hearts),
      `${order[i]} should outrank ${order[i - 1]} in trump`,
    );
  }
});

test("plain order is A > 10 > K > Q > J > 9 > 8 > 7", () => {
  const order = ["7", "8", "9", "J", "Q", "K", "10", "A"] as const;

  for (let i = 1; i < order.length; i++) {
    assert.ok(
      trickOrder(c("spades", order[i]), hearts) > trickOrder(c("spades", order[i - 1]), hearts),
      `${order[i]} should outrank ${order[i - 1]} in a plain suit`,
    );
  }
});

test("all-trumps ranks every suit in trump order", () => {
  assert.ok(trickOrder(c("clubs", "J"), allTrumps) > trickOrder(c("clubs", "A"), allTrumps));
  assert.ok(trickOrder(c("diamonds", "9"), allTrumps) > trickOrder(c("diamonds", "10"), allTrumps));
});

test("no-trump ranks every suit in plain order", () => {
  assert.ok(trickOrder(c("clubs", "A"), noTrump) > trickOrder(c("clubs", "10"), noTrump));
  assert.ok(trickOrder(c("clubs", "10"), noTrump) > trickOrder(c("clubs", "J"), noTrump));
});

// --- trick winner -----------------------------------------------------------

test("a trump beats any plain card", () => {
  const trick = [play(0, "spades", "A"), play(1, "hearts", "7"), play(2, "spades", "K"), play(3, "spades", "Q")];

  assert.equal(trickWinner(trick, hearts), 1);
});

test("with no trump played the highest card of the led suit wins", () => {
  const trick = [play(0, "spades", "A"), play(1, "spades", "10"), play(2, "spades", "K"), play(3, "spades", "7")];

  assert.equal(trickWinner(trick, hearts), 0);
});

test("the higher of two trumps wins", () => {
  const trick = [play(0, "spades", "A"), play(1, "hearts", "7"), play(2, "hearts", "9"), play(3, "spades", "K")];

  assert.equal(trickWinner(trick, hearts), 2);
});

test("when trump is led the highest trump wins", () => {
  const trick = [play(0, "hearts", "J"), play(1, "hearts", "9"), play(2, "hearts", "A"), play(3, "hearts", "10")];

  assert.equal(trickWinner(trick, hearts), 0);
});

test("an off-suit discard never wins", () => {
  const trick = [play(0, "spades", "A"), play(1, "diamonds", "K"), play(2, "spades", "Q"), play(3, "spades", "J")];

  assert.equal(trickWinner(trick, hearts), 0);
});

test("in all-trumps the highest card of the led suit wins", () => {
  const trick = [play(0, "hearts", "7"), play(1, "hearts", "9"), play(2, "hearts", "A"), play(3, "hearts", "10")];

  assert.equal(trickWinner(trick, allTrumps), 1);
});

test("in no-trump the highest card of the led suit wins using plain order", () => {
  const trick = [play(0, "spades", "K"), play(1, "diamonds", "A"), play(2, "spades", "10"), play(3, "spades", "Q")];

  assert.equal(trickWinner(trick, noTrump), 2);
});

// --- legal cards ------------------------------------------------------------

test("leading a trick allows any card", () => {
  const hand = [c("spades", "A"), c("hearts", "7"), c("clubs", "K")];

  assert.deepEqual(labels(legalCards(hand, [], hearts, false)), labels(hand));
});

test("you must follow the led suit when you can", () => {
  const hand = [c("spades", "A"), c("hearts", "7"), c("spades", "Q")];
  const trick = [play(0, "spades", "K")];

  assert.deepEqual(labels(legalCards(hand, trick, hearts, false)), labels([c("spades", "A"), c("spades", "Q")]));
});

test("when you cannot follow and your partner is master, anything goes", () => {
  const hand = [c("hearts", "7"), c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "A")];

  assert.deepEqual(labels(legalCards(hand, trick, hearts, true)), labels(hand));
});

test("when you cannot follow and must trump, only trumps are legal", () => {
  const hand = [c("hearts", "7"), c("hearts", "Q"), c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "K"), play(1, "spades", "A")];

  assert.deepEqual(
    labels(legalCards(hand, trick, hearts, false)),
    labels([c("hearts", "7"), c("hearts", "Q")]),
  );
});

test("when forced to trump you must over-trump when you can", () => {
  const hand = [c("hearts", "J"), c("hearts", "7"), c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "A"), play(1, "hearts", "9")];

  assert.deepEqual(labels(legalCards(hand, trick, hearts, false)), labels([c("hearts", "J")]));
});

test("when you cannot over-trump any trump is legal", () => {
  const hand = [c("hearts", "9"), c("hearts", "7"), c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "A"), play(1, "hearts", "J")];

  assert.deepEqual(
    labels(legalCards(hand, trick, hearts, false)),
    labels([c("hearts", "9"), c("hearts", "7")]),
  );
});

test("with no trump in hand you may discard anything", () => {
  const hand = [c("clubs", "K"), c("diamonds", "7"), c("clubs", "7")];
  const trick = [play(0, "spades", "A")];

  assert.deepEqual(labels(legalCards(hand, trick, hearts, false)), labels(hand));
});

test("in no-trump failing to follow lets you play anything", () => {
  const hand = [c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "A")];

  assert.deepEqual(labels(legalCards(hand, trick, noTrump, false)), labels(hand));
});

test("in all-trumps failing to follow lets you play anything", () => {
  const hand = [c("clubs", "K"), c("diamonds", "7")];
  const trick = [play(0, "spades", "A")];

  assert.deepEqual(labels(legalCards(hand, trick, allTrumps, false)), labels(hand));
});
