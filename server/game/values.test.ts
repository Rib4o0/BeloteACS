import test from "node:test";
import assert from "node:assert/strict";

import { newDeck, type Card } from "./cards.ts";
import type { Contract } from "./contracts.ts";
import {
  cardValue,
  dixDeDer,
  isTrumpCard,
  trickPoints,
} from "./values.ts";

const hearts: Contract = { kind: "suit", suit: "hearts" };
const noTrump: Contract = { kind: "nt" };
const allTrumps: Contract = { kind: "at" };

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

test("a trump card uses the trump values", () => {
  assert.equal(cardValue(card("hearts", "J"), hearts), 20);
  assert.equal(cardValue(card("hearts", "9"), hearts), 14);
  assert.equal(cardValue(card("hearts", "A"), hearts), 11);
  assert.equal(cardValue(card("hearts", "10"), hearts), 10);
  assert.equal(cardValue(card("hearts", "K"), hearts), 4);
  assert.equal(cardValue(card("hearts", "Q"), hearts), 3);
  assert.equal(cardValue(card("hearts", "8"), hearts), 0);
  assert.equal(cardValue(card("hearts", "7"), hearts), 0);
});

test("a plain card uses the plain values", () => {
  assert.equal(cardValue(card("spades", "A"), hearts), 11);
  assert.equal(cardValue(card("spades", "10"), hearts), 10);
  assert.equal(cardValue(card("spades", "K"), hearts), 4);
  assert.equal(cardValue(card("spades", "Q"), hearts), 3);
  assert.equal(cardValue(card("spades", "J"), hearts), 2);
  assert.equal(cardValue(card("spades", "9"), hearts), 0);
});

test("in all-trumps every card uses the trump values", () => {
  assert.equal(cardValue(card("spades", "J"), allTrumps), 20);
  assert.equal(cardValue(card("clubs", "9"), allTrumps), 14);
  assert.equal(cardValue(card("hearts", "8"), allTrumps), 0);
});

test("no-trump doubles every card value", () => {
  assert.equal(cardValue(card("clubs", "A"), noTrump), 22);
  assert.equal(cardValue(card("clubs", "10"), noTrump), 20);
  assert.equal(cardValue(card("clubs", "J"), noTrump), 4);
  assert.equal(cardValue(card("clubs", "7"), noTrump), 0);
});

test("dix de der is 10, doubled to 20 in no-trump", () => {
  assert.equal(dixDeDer(hearts), 10);
  assert.equal(dixDeDer(allTrumps), 10);
  assert.equal(dixDeDer(noTrump), 20);
});

test("the whole deck is worth 152 / 248 / 240 by contract", () => {
  const sum = (contract: Contract) =>
    newDeck().reduce((total, c) => total + cardValue(c, contract), 0);

  assert.equal(sum(hearts), 152);
  assert.equal(sum(allTrumps), 248);
  assert.equal(sum(noTrump), 240);
});

test("adding dix de der gives the hand totals 162 / 258 / 260", () => {
  const sum = (contract: Contract) =>
    newDeck().reduce((total, c) => total + cardValue(c, contract), 0) + dixDeDer(contract);

  assert.equal(sum(hearts), 162);
  assert.equal(sum(allTrumps), 258);
  assert.equal(sum(noTrump), 260);
});

test("isTrumpCard identifies trump cards per contract", () => {
  assert.equal(isTrumpCard(card("hearts", "7"), hearts), true);
  assert.equal(isTrumpCard(card("clubs", "7"), hearts), false);
  assert.equal(isTrumpCard(card("clubs", "7"), allTrumps), true);
  assert.equal(isTrumpCard(card("clubs", "7"), noTrump), false);
});

test("trickPoints sums the card values in the trick", () => {
  const trick = [card("hearts", "J"), card("clubs", "A"), card("spades", "10"), card("diamonds", "7")];

  assert.equal(trickPoints(trick, hearts), 20 + 11 + 10 + 0);
});
