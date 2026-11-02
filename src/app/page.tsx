"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Generate a short, readable room id like "warm-fox-3182".
const ADJECTIVES = ["warm", "calm", "bright", "swift", "quiet", "bold", "lucky", "clever"];
const NOUNS = ["fox", "otter", "finch", "cedar", "river", "ember", "maple", "comet"];

function randomRoomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${n}-${num}`;
}

// Accept either a bare room code or a full/partial join URL and return the code.
function parseRoomInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(/\/rooms\/([^/?#\s]+)/);
  const code = match ? decodeURIComponent(match[1]) : value;
  return code.replace(/[^a-zA-Z0-9-_]/g, "") || null;
}

export default function Home() {
  const router = useRouter();
  const [joinValue, setJoinValue] = useState("");
  const [error, setError] = useState("");

  const createMeeting = () => {
    router.push(`/rooms/${randomRoomName()}`);
  };

  const joinMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    const code = parseRoomInput(joinValue);
    if (!code) {
      setError("Enter a meeting code or paste a join link.");
      return;
    }
    router.push(`/rooms/${encodeURIComponent(code)}`);
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Beldex Meet</h1>
        <p className="mt-3 text-base text-black/60 dark:text-white/60">
          Private video meetings. Start one, or join with a link.
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-black/10 dark:border-white/15 p-6 shadow-sm">
        <button
          onClick={createMeeting}
          className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-medium text-white transition hover:bg-indigo-500 active:bg-indigo-700"
        >
          New meeting
        </button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          or join
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>

        <form onSubmit={joinMeeting} className="flex flex-col gap-3">
          <input
            value={joinValue}
            onChange={(e) => {
              setJoinValue(e.target.value);
              setError("");
            }}
            placeholder="Meeting code or link"
            className="w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-4 py-3 text-base outline-none focus:border-indigo-500"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-xl border border-black/15 dark:border-white/20 px-5 py-3 text-base font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            Join meeting
          </button>
        </form>
      </div>

      <p className="text-xs text-black/40 dark:text-white/40">
        Phase 1 · LiveKit video rooms · Beldex identity &amp; payments coming next
      </p>
    </main>
  );
}
