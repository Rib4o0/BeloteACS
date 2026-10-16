"use client";

import { useActionState } from "react";

import { createRoomAction, joinRoomAction } from "@/server/actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 caret-emerald-700 shadow-sm transition placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30";
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
        <label htmlFor="username" className="text-xs font-medium text-zinc-600">
          Name (required)
        </label>
        <input
          id="username"
          type="text"
          name="username"
          placeholder="e.g. Alex"
          required
          maxLength={24}
          autoComplete="name"
          className={inputClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="code" className="text-xs font-medium text-zinc-600">
          Room code (optional)
        </label>
        <input
          id="code"
          type="text"
          name="code"
          placeholder="e.g. ABC12"
          autoComplete="off"
          className={inputClass}
        />
        <p className="text-xs text-zinc-500">
          Leave empty to create a new room
        </p>
      </div>
      <div className="mt-1 flex flex-col gap-2">
        <button
          type="submit"
          disabled={joinPending || createPending}
          className={`${buttonClass} w-full bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2`}
        >
          {joinPending ? "Joining..." : "Join Room"}
        </button>
        <button
          type="submit"
          formAction={createFormAction}
          disabled={createPending || joinPending}
          className={`${buttonClass} w-full border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2`}
        >
          {createPending ? "Creating..." : "Create New Room"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}