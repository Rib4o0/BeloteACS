"use client";

import { useState } from "react";

function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

async function writeToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function RoomCodeModal({ code }: { code: string }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return null;
  }

  async function copyCode() {
    if (await writeToClipboard(code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-code-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl dark:bg-zinc-900">
        <h2 id="room-code-title" className="text-lg font-semibold">
          Room code
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Share this code so others can join.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <p className="text-3xl font-bold tracking-widest">{code}</p>
          <button
            type="button"
            onClick={copyCode}
            aria-label="Copy room code"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {copied ? <CheckIcon /> : <ClipboardIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-6 rounded-md bg-foreground px-4 py-2 text-background"
        >
          Close
        </button>
      </div>
    </div>
  );
}
