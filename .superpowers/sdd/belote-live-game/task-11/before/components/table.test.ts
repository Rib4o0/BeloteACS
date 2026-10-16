import test from "node:test";
import assert from "node:assert/strict";

import type { Action, Card, Seat } from "../server/game/index.ts";
import { cardLabel, contractLabel, isPlayable, screenSlot, suitSymbol } from "./table.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

test("screenSlot places you bottom, partner top, opponents on the sides", () => {
  assert.equal(screenSlot(0, 0), "bottom");
  assert.equal(screenSlot(0, 1), "left");
  assert.equal(screenSlot(0, 2), "top");
  assert.equal(screenSlot(0, 3), "right");

  assert.equal(screenSlot(2, 2), "bottom");
  assert.equal(screenSlot(2, 3), "left");
  assert.equal(screenSlot(2, 0), "top");
  assert.equal(screenSlot(2, 1), "right");
});

test("isPlayable is true only for a legal play of the matching card", () => {
  const legal: Action[] = [
    { kind: "play", playerId: "me", card: card("hearts", "A") },
    { kind: "pass", playerId: "me" },
  ];

  assert.equal(isPlayable(card("hearts", "A"), legal), true);
  assert.equal(isPlayable(card("hearts", "K"), legal), false);
  assert.equal(isPlayable(card("hearts", "A"), []), false);
});

test("labels a contract", () => {
  assert.equal(contractLabel({ kind: "suit", suit: "clubs" }), "Clubs");
  assert.equal(contractLabel({ kind: "nt" }), "No-trump");
  assert.equal(contractLabel({ kind: "at" }), "All-trumps");
  assert.equal(contractLabel(null), "—");
});

test("formats a card as rank plus suit symbol", () => {
  assert.equal(suitSymbol("hearts"), "♥");
  assert.equal(cardLabel(card("spades", "10")), "10♠");
  assert.equal(cardLabel(card("diamonds", "A")), "A♦");
});

test("a Seat type is accepted", () => {
  const seat: Seat = 3;
  assert.equal(screenSlot(0, seat), "right");
});
