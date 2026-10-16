"use client";

import { useActionState } from "react";

import {
  createRoomAction,
  joinRoomAction,
  type CreateRoomState,
  type JoinRoomState,
} from "@/server/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20";
const buttonClass =
  "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60";

export default function HomeControls() {
  const [joinState, joinFormAction, joinPending] = useActionState(
    joinRoomAction,
    null,
  );
  const [createState, createFormAction, createPending] = useActionState(
    createRoomAction,
    null,
  );

  const error = joinState?.error ?? createState?.error;

  return (
    <form action={joinFormAction} className="flex w-full flex-col gap-3">
      <div className="space-y-2">
        <label htmlFor="username" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Name
        </label>
        <input
          id="username"
          type="text"
          name="username"
          placeholder="Enter your name"
          required
          maxLength={24}
          autoComplete="name"
          className={inputClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="code" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Room code (optional)
        </label>
        <input
          id="code"
          type="text"
          name="code"
          placeholder="Enter room code to join an existing room"
          autoComplete="off"
          className={inputClass}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Leave empty to create a new room
        </p>
      </div>
      <div className="mt-1 flex flex-col gap-2">
        <button
          type="submit"
          disabled={joinPending || createPending}
          className={`${buttonClass} w-full bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-400`}
        >
          {joinPending ? "Joining..." : "Join Room"}
        </button>
        <button
          type="submit"
          formAction={createFormAction}
          disabled={createPending || joinPending}
          className={`${buttonClass} w-full border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`}
        >
          {createPending ? "Creating..." : "Create New Room"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}