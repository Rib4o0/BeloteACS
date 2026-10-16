## Fix round 1

### What changed
- **server/Rooms.test.ts**: Updated the test `"a second action out of turn is rejected without corrupting the match"` to capture the match state before the failing action and assert immutability after rejection. Specifically:
  - Captured `const before = room.match;` and `const snapshot = structuredClone(before);` right before the second `applyGameAction`
  - After asserting `assert.deepEqual(second, { ok: false, error: "not_your_turn" });`, added:
    - `assert.equal(room.match, before); // same reference`
    - `assert.deepEqual(room.match, snapshot); // and unchanged in place`

No other files were modified. Implementation in `server/Rooms.ts` was not changed.

### Exact commands + key output

**1. Run Rooms tests**
```bash
node --test --conditions=react-server server/Rooms.test.ts 2>&1 | tail -15
```

Output:
```
✔ a second action out of turn is rejected without corrupting the match (0.239ms)
ℹ tests 34
ℹ suites 0
ℹ pass 34
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 153.325708
```

**2. Run all tests**
```bash
npm test 2>&1 | tail -10
```

Output:
```
ℹ tests 143
ℹ suites 0
ℹ pass 143
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 460.765708
```

**3. Typecheck**
```bash
npm run typecheck 2>&1
```

Output: (clean - no errors reported)

### Confirmation
- Only `server/Rooms.test.ts` was modified (the single test case updated as specified).
- No changes under `server/game/**`.
- No changes to `server/Rooms.ts` implementation.
- All existing tests continue to pass (34/34 Rooms tests, 143/143 total tests).
- Typechecking passes cleanly.
