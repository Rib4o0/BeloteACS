import test from "node:test";
import assert from "node:assert/strict";

import type { Action, Card, Contract, Seat } from "../server/game/index.ts";
import {
  cardLabel,
  contractLabel,
  fanAngle,
  fanLift,
  isPlayable,
  isRedSuit,
  screenSlot,
  sortHand,
  suitOrder,
  suitSymbol,
} from "./table.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

test("screenSlot places you bottom and the next player counter-clockwise to the right", () => {
  assert.equal(screenSlot(0, 0), "bottom");
  assert.equal(screenSlot(0, 1), "right");
  assert.equal(screenSlot(0, 2), "top");
  assert.equal(screenSlot(0, 3), "left");

  assert.equal(screenSlot(2, 2), "bottom");
  assert.equal(screenSlot(2, 3), "right");
  assert.equal(screenSlot(2, 0), "top");
  assert.equal(screenSlot(2, 1), "left");
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

test("isRedSuit is true only for hearts and diamonds", () => {
  assert.equal(isRedSuit("hearts"), true);
  assert.equal(isRedSuit("diamonds"), true);
  assert.equal(isRedSuit("clubs"), false);
  assert.equal(isRedSuit("spades"), false);
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

test("suitOrder leads with the trump suit when there is one", () => {
  assert.deepEqual(suitOrder({ kind: "suit", suit: "hearts" }), [
    "hearts",
    "clubs",
    "diamonds",
    "spades",
  ]);
  assert.deepEqual(suitOrder({ kind: "nt" }), [
    "clubs",
    "diamonds",
    "hearts",
    "spades",
  ]);
  assert.deepEqual(suitOrder(null), ["clubs", "diamonds", "hearts", "spades"]);
});

test("sortHand groups by suit and orders strongest first, trump last in group", () => {
  const hand = [
    card("spades", "7"),
    card("hearts", "A"),
    card("clubs", "10"),
    card("hearts", "J"),
    card("clubs", "A"),
  ];

  // Trump (hearts): J then A. Plain clubs: A then 10. Then spades.
  assert.deepEqual(
    sortHand(hand, { kind: "suit", suit: "hearts" }).map(cardLabel),
    ["J♥", "A♥", "A♣", "10♣", "7♠"],
  );

  // No trump: plain values, A high.
  assert.deepEqual(
    sortHand(hand, { kind: "nt" }).map(cardLabel),
    ["A♣", "10♣", "A♥", "J♥", "7♠"],
  );
});

test("sortHand leaves the original array untouched", () => {
  const hand = [card("spades", "7"), card("clubs", "A")];
  sortHand(hand, null);
  assert.deepEqual(hand.map(cardLabel), ["7♠", "A♣"]);
});

test("a Seat type is accepted", () => {
  const seat: Seat = 3;
  assert.equal(screenSlot(0, seat), "left");
});

test("a Contract type is accepted", () => {
  const contract: Contract = { kind: "suit", suit: "spades" };
  assert.equal(contractLabel(contract), "Spades");
});

test("fanAngle lays a single card flat", () => {
  assert.equal(fanAngle(0, 1), 0);
});

test("fanAngle mirrors the left and right halves of the hand", () => {
  for (const count of [2, 3, 4, 5, 8]) {
    for (let i = 0; i < count; i++) {
      // Summed rather than negated: the middle card's angle is zero, and
      // Object.is distinguishes +0 from -0.
      assert.equal(fanAngle(i, count) + fanAngle(count - 1 - i, count), 0);
    }
  }
});

test("fanAngle rises left to right and keeps the fan readable", () => {
  const count = 8;
  for (let i = 1; i < count; i++) {
    assert.ok(fanAngle(i, count) > fanAngle(i - 1, count));
  }
  const edge = Math.abs(fanAngle(0, count));
  assert.ok(edge >= 12, `fan too flat: ${edge}deg`);
  assert.ok(edge <= 25, `fan too steep: ${edge}deg`);
});

test("fanAngle never tilts a card past the spread limit", () => {
  for (const count of [1, 2, 4, 8, 12]) {
    for (let i = 0; i < count; i++) {
      assert.ok(Math.abs(fanAngle(i, count)) <= ((count - 1) / 2) * 8 + 1e-9);
    }
  }
});

test("fanLift holds a single card flat", () => {
  assert.equal(fanLift(0, 1), 0);
});

test("fanLift mirrors the left and right halves of the hand", () => {
  for (const count of [2, 3, 4, 5, 8]) {
    for (let i = 0; i < count; i++) {
      assert.equal(fanLift(i, count), fanLift(count - 1 - i, count));
    }
  }
});

test("fanLift bows a proper arc instead of a straight row", () => {
  const count = 8;
  // The middle cards sit highest and level; the outer cards drop well below.
  const mid = (count - 1) / 2;
  const centre = fanLift(mid - 0.5, count);
  assert.equal(centre, fanLift(mid + 0.5, count));
  const edge = fanLift(0, count);
  assert.equal(edge, fanLift(count - 1, count));
  // A shallow bow reads as a line in the middle; require real depth.
  assert.ok(edge - centre >= 20, `bow too shallow: ${edge - centre}px`);
  // Depth grows evenly outward, so the whole row curves, not just the ends.
  for (let i = 1; i <= mid; i++) {
    assert.ok(fanLift(i, count) < fanLift(i - 1, count));
  }
});

