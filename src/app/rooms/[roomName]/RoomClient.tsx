"use client";

import "@livekit/components-styles";

import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  type LocalUserChoices,
} from "@livekit/components-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export default function RoomClient({ roomName }: { roomName: string }) {
  const router = useRouter();
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handlePreJoinSubmit = useCallback(
    async (values: LocalUserChoices) => {
      setError(null);
      try {
        const res = await fetch(
          `/api/token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(
            values.username,
          )}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Token request failed (${res.status})`);
        }
        const { token } = await res.json();
        setChoices(values);
        setToken(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not get a join token.");
      }
    },
    [roomName],
  );

  const copyLink = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(roomName).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }, [roomName]);

  const leave = useCallback(() => {
    setToken(null);
    setChoices(null);
    router.push("/");
  }, [router]);

  if (!serverUrl) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <p className="text-red-500">
          NEXT_PUBLIC_LIVEKIT_URL is not set. Add it to <code>.env.local</code> and restart the
          dev server.
        </p>
      </main>
    );
  }

  // Prejoin screen: device selection + display name, plus a shareable link.
  if (!token || !choices) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold">Meeting ready</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Share this code so another person can join.
          </p>

          <div className="mt-4 rounded-xl border border-dashed border-black/20 dark:border-white/25 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
              Meeting code
            </p>
            <p className="mt-1 select-all text-2xl font-bold tracking-wide text-indigo-500">
              {roomName}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button
              onClick={copyCode}
              className="text-indigo-500 underline underline-offset-4 hover:text-indigo-400"
            >
              {codeCopied ? "Code copied!" : "Copy code"}
            </button>
            <span className="text-black/30 dark:text-white/30">·</span>
            <button
              onClick={copyLink}
              className="text-indigo-500 underline underline-offset-4 hover:text-indigo-400"
            >
              {copied ? "Link copied!" : "Copy invite link"}
            </button>
          </div>
        </div>

        <div className="w-full max-w-md" data-lk-theme="default">
          <PreJoin
            defaults={{ username: "", videoEnabled: true, audioEnabled: true }}
            onSubmit={handlePreJoinSubmit}
            onError={(e) => setError(e.message)}
          />
        </div>

        {error && <p className="max-w-md text-center text-sm text-red-500">{error}</p>}
      </main>
    );
  }

  // In the call: VideoConference provides tiles, the control bar
  // (mic, camera, screen share, leave) and the chat panel.
  return (
    <div data-lk-theme="default" style={{ height: "100dvh" }}>
      {/*
        Show only other participants — hide the local user's own tiles (camera and
        screen share). Remote tiles have data-lk-local-participant="false", so they
        stay visible. Inlined here so Tailwind's CSS pipeline doesn't strip it.
      */}
      <style>{`.lk-participant-tile[data-lk-local-participant="true"] { display: none !important; }`}</style>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={choices.audioEnabled}
        video={choices.videoEnabled}
        onDisconnected={leave}
        onError={(e) => setError(e.message)}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
