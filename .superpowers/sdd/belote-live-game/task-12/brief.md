### Task 12: Browser verification

**Files:** none (manual / browser-driven).

- [ ] **Step 1: Restart the dev server** (the running instance's watcher is stale):

```bash
kill 5547 2>/dev/null || true
npm run dev
```

- [ ] **Step 2: Four players.** Using four browser sessions (separate cookie jars), each creates/joins the same room, picks teams (two A, two B), and the host presses **Start**.

Verify: all four move to the table at once; each sees only its own eight cards; the other three seats show names, teams and **8 cards**.

- [ ] **Step 3: Bidding.** The player after the dealer bids **Clubs**; a later player bids **Spades**; the rest pass. Verify the legal-bid buttons only ever offer strictly stronger contracts, and that the contract + taker show once three passes land.

- [ ] **Step 4: Play.** Play several tricks. Verify:
  - trick 1 is led by the player after the dealer;
  - the winner of each trick leads the next;
  - a player who can follow suit cannot play off-suit;
  - a player who cannot follow and whose partner is not master is forced to trump;
  - **Reconnecting…** shows on a dropped tab and clears on reconnection.

- [ ] **Step 5: Full hand → score.** Play the hand to the end. Verify the scoreboard updates, hand number increments, the dealer rotates, and the next hand is dealt.

- [ ] **Step 6: Reconnect mid-hand.** Close one player's tab during play, reopen the room URL. Verify the seat and hand are intact and the others briefly show **away**.

- [ ] **Step 7: Pre-start grace.** Before starting, close a lobby tab and reopen within ~15s → the seat is kept. Close and wait longer → the seat is freed.

- [ ] **Step 8: Spectator.** Open the room URL in an incognito window (no player cookie). Verify no cards are visible.

- [ ] **Step 9: End condition.** Play on until a team reaches 151; verify the game-over banner names the winner and inputs disable.

- [ ] **Step 10: Checkpoint.** `npm test` green, `npm run typecheck` clean.
