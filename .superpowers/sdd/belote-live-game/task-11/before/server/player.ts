import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

const PLAYER_COOKIE = "belote_player";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function getPlayerId() {
  const store = await cookies();
  return store.get(PLAYER_COOKIE)?.value;
}

export async function getOrCreatePlayerId() {
  const store = await cookies();
  const existing = store.get(PLAYER_COOKIE)?.value;

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  store.set(PLAYER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return id;
}
