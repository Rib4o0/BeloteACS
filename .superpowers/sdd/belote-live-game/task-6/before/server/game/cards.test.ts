import test from "node:test";
import assert from "node:assert/strict";

import { newDeck, shuffle, sameCard, RANKS, SUITS, type Card } from "./cards.ts";
import { seededRng } from "./rng.ts";

test("newDeck has 32 cards", () => {
  assert.equal(newDeck().length, 32);
});

test("newDeck has eight cards of every suit", () => {
  const deck = newDeck();

  for (const suit of SUITS) {
    assert.equal(deck.filter((card) => card.suit === suit).length, 8);
  }
});

test("newDeck has four cards of every rank", () => {
  const deck = newDeck();

  for (const rank of RANKS) {
    assert.equal(deck.filter((card) => card.rank === rank).length, 4);
  }
});

test("newDeck contains no duplicate cards", () => {
  const deck = newDeck();
  const labels = new Set(deck.map((card) => `${card.suit}:${card.rank}`));

  assert.equal(labels.size, 32);
});

test("shuffle keeps every card (same multiset)", () => {
  const deck = newDeck();
  const shuffled = shuffle(deck, seededRng(7));
  const key = (card: Card) => `${card.suit}:${card.rank}`;

  assert.deepEqual(
    shuffled.map(key).sort(),
    deck.map(key).sort(),
  );
});

test("shuffle does not mutate its input", () => {
  const deck = newDeck();
  const before = deck.map((card) => `${card.suit}:${card.rank}`);

  shuffle(deck, seededRng(7));

  assert.deepEqual(
    deck.map((card) => `${card.suit}:${card.rank}`),
    before,
  );
});

test("shuffle is deterministic for a given seed", () => {
  const first = shuffle(newDeck(), seededRng(99));
  const second = shuffle(newDeck(), seededRng(99));

  assert.deepEqual(first, second);
});

test("shuffle reorders the deck", () => {
  const deck = newDeck();
  const shuffled = shuffle(deck, seededRng(1));

  assert.notDeepEqual(shuffled, deck);
});

test("sameCard compares suit and rank", () => {
  assert.equal(sameCard({ suit: "hearts", rank: "A" }, { suit: "hearts", rank: "A" }), true);
  assert.equal(sameCard({ suit: "hearts", rank: "A" }, { suit: "spades", rank: "A" }), false);
  assert.equal(sameCard({ suit: "hearts", rank: "A" }, { suit: "hearts", rank: "K" }), false);
});
