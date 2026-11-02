import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

// Always run on the server, never cached — tokens are per-user and short-lived.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");
  const username = req.nextUrl.searchParams.get("username");

  if (!room) {
    return NextResponse.json({ error: "Missing 'room' query param" }, { status: 400 });
  }
  if (!username) {
    return NextResponse.json({ error: "Missing 'username' query param" }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Server misconfigured: LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set" },
      { status: 500 },
    );
  }

  // Mint a join token scoped to this room with full publish/subscribe rights.
  const at = new AccessToken(apiKey, apiSecret, {
    identity: username,
    // identity must be unique per participant; suffix keeps same name joinable twice
    name: username,
    ttl: "1h",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  // Return the server URL too so native clients (the mobile app) don't need it
  // hardcoded — they just call this one endpoint.
  return NextResponse.json({ token, serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null });
}
