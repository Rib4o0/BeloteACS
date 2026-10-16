import test from "node:test";
import assert from "node:assert/strict";

import type { Contract } from "./contracts.ts";
import { CAPOT, gameWinner, scoreHand, TARGET, toGamePoints } from "./scoring.ts";
import type { Play } from "./types.ts";

const hearts: Contract = { kind: "suit", suit: "hearts" };
const noTrump: Contract = { kind: "nt" };

const play = (seat: 0 | 1 | 2 | 3, suit: Play["card"]["suit"], rank: Play["card"]["rank"]): Play => ({
  seat,
  card: { suit, rank },
});

// A trick won by seat 0 (team A) with A♥ in a hearts contract, worth 11.
const aWinHearts = (): Play[] => [
  play(0, "hearts", "A"),
  play(1, "clubs", "7"),
  play(2, "diamonds", "7"),
  play(3, "spades", "7"),
];

// A trick won by seat 1 (team B) with A♥, worth 11.
const bWinHearts = (): Play[] => [
  play(0, "spades", "7"),
  play(1, "hearts", "A"),
  play(2, "clubs", "7"),
  play(3, "diamonds", "7"),
];

test("toGamePoints divides by ten and rounds", () => {
  assert.equal(toGamePoints(162), 16);
  assert.equal(toGamePoints(350), 35);
  assert.equal(toGamePoints(0), 0);
  assert.equal(toGamePoints(85), 9);
});

test("a normal hand splits the raw points and adds dix de der to the last trick", () => {
  const tricks = [
    ...Array.from({ length: 7 }, aWinHearts),
    bWinHearts(), // last trick → team B gets dix de der
  ];

  const outcome = scoreHand(tricks, hearts, 0);

  assert.equal(outcome.dedans, false);
  assert.equal(outcome.capot, null);
  assert.equal(outcome.raw.A, 7 * 11);
  assert.equal(outcome.raw.B, 11 + 10);
  assert.deepEqual(outcome.gamePoints, { A: 8, B: 2 });
});

test("taker strictly behind is dedans: opponents take the whole hand", () => {
  const tricks = [
    ...Array.from({ length: 7 }, bWinHearts),
    aWinHearts(), // last trick → team A gets dix de der
  ];

  const outcome = scoreHand(tricks, hearts, 0); // taker is team A

  assert.equal(outcome.dedans, true);
  assert.equal(outcome.raw.A, 0);
  assert.equal(outcome.raw.B, 7 * 11 + 11 + 10);
  assert.deepEqual(outcome.gamePoints, { A: 0, B: 10 });
});

test("equal points are not dedans", () => {
  const aWin4 = (): Play[] => [
    play(0, "spades", "K"),
    play(1, "clubs", "7"),
    play(2, "diamonds", "7"),
    play(3, "spades", "7"),
  ];
  const bWin10 = (): Play[] => [
    play(0, "spades", "7"),
    play(1, "spades", "10"),
    play(2, "clubs", "7"),
    play(3, "diamonds", "7"),
  ];

  const tricks = [bWin10(), bWin10(), bWin10(), aWin4(), aWin4(), aWin4(), aWin4(), aWin4()];

  const outcome = scoreHand(tricks, hearts, 0);

  assert.equal(outcome.dedans, false);
  assert.equal(outcome.raw.A, 30);
  assert.equal(outcome.raw.B, 30);
  assert.deepEqual(outcome.gamePoints, { A: 3, B: 3 });
});

test("winning every trick is a capot worth 350", () => {
  const tricks = Array.from({ length: 8 }, aWinHearts);

  const outcome = scoreHand(tricks, hearts, 0);

  assert.equal(outcome.capot, "A");
  assert.equal(outcome.raw.A, CAPOT);
  assert.equal(outcome.raw.B, 0);
  assert.deepEqual(outcome.gamePoints, { A: 35, B: 0 });
});

test("no-trump doubles the raw points and dix de der", () => {
  const aWinClubs = (): Play[] => [
    play(0, "clubs", "A"),
    play(1, "diamonds", "7"),
    play(2, "hearts", "7"),
    play(3, "spades", "7"),
  ];
  const bWinClubs = (): Play[] => [
    play(0, "clubs", "7"),
    play(1, "clubs", "A"),
    play(2, "diamonds", "7"),
    play(3, "hearts", "7"),
  ];

  const tricks = [...Array.from({ length: 7 }, aWinClubs), bWinClubs()];

  const outcome = scoreHand(tricks, noTrump, 0);

  assert.equal(outcome.raw.A, 7 * 22); // A♣ doubled
  assert.equal(outcome.raw.B, 22 + 20); // plus doubled dix de der
  assert.deepEqual(outcome.gamePoints, { A: 15, B: 4 });
});

test("gameWinner needs 151 and reports the higher team", () => {
  assert.equal(gameWinner({ A: 151, B: 100 }), "A");
  assert.equal(gameWinner({ A: 100, B: 160 }), "B");
});

test("gameWinner is undefined below the target or on a tie", () => {
  assert.equal(gameWinner({ A: 150, B: 100 }), undefined);
  assert.equal(gameWinner({ A: 151, B: 151 }), undefined);
});

test("TARGET is 151", () => {
  assert.equal(TARGET, 151);
});
