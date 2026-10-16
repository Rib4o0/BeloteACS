import test from "node:test";
import assert from "node:assert/strict";

import { seededRng } from "./rng.ts";

test("seededRng produces values in [0, 1)", () => {
  const rng = seededRng(1);

  for (let i = 0; i < 200; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `value ${value} out of range`);
  }
});

test("seededRng is deterministic for the same seed", () => {
  const a = seededRng(42);
  const b = seededRng(42);

  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());

  assert.deepEqual(seqA, seqB);
});

test("seededRng produces different sequences for different seeds", () => {
  const a = seededRng(1);
  const b = seededRng(2);

  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());

  assert.notDeepEqual(seqA, seqB);
});
