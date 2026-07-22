"""Verify reconnection + state recovery (hard requirement).

Starts a GeoGuess game (simultaneous mode), plays a round, then drops player 2's
socket mid-game and reconnects - asserting the server replays a ROOM_STATE
snapshot that lets the client resume with the correct round + scores.

Usage:  API=http://127.0.0.1:8012 python tests/e2e_reconnect.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8012")
WS = API.replace("http", "ws")


async def guest(client, name):
    r = await client.post(f"{API}/auth/guest", json={"display_name": name})
    r.raise_for_status()
    return r.json()


async def recv_until(ws, want, timeout=15):
    """Return the first message whose type is in `want`."""
    async def loop():
        async for raw in ws:
            msg = json.loads(raw)
            if msg["type"] in want:
                return msg
    return await asyncio.wait_for(loop(), timeout)


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        host = await guest(client, "Nova")
        opp = await guest(client, "Echo")
        r = await client.post(
            f"{API}/rooms",
            json={"game_type": "geoguess"},
            headers={"Authorization": f"Bearer {host['token']}"},
        )
        room_id = r.json()["id"]
        await client.post(
            f"{API}/rooms/{room_id}/join",
            headers={"Authorization": f"Bearer {opp['token']}"},
        )

        u1 = f"{WS}/ws/{room_id}?token={host['token']}"
        u2 = f"{WS}/ws/{room_id}?token={opp['token']}"

        ws1 = await websockets.connect(u1)
        ws2 = await websockets.connect(u2)
        await asyncio.sleep(0.3)
        await ws1.send(json.dumps({"type": "READY", "data": {}}))
        await ws2.send(json.dumps({"type": "READY", "data": {}}))

        # Reach round 1.
        rs = await recv_until(ws1, {"ROUND_START"})
        assert rs["data"]["round"] == 1
        print(f"round 1 started: target = {rs['data']['round_data']['prompt']}")

        # Both submit a guess -> round resolves, scores accrue.
        for ws in (ws1, ws2):
            await ws.send(json.dumps(
                {"type": "ACTION", "data": {"lat": 40.0, "lng": -74.0}}
            ))
        result = await recv_until(ws1, {"ROUND_RESULT"})
        scores_before = result["data"]["scores"]
        print(f"round 1 result, scores = {scores_before}")

        # --- Drop player 2 and reconnect ---
        await ws2.close()
        print("player 2 socket dropped")
        await asyncio.sleep(0.5)

        ws2b = await websockets.connect(u2)
        snap = await recv_until(ws2b, {"ROOM_STATE"})
        g = snap["data"]["game"]
        print(f"reconnected -> ROOM_STATE: status={snap['data']['status']}, "
              f"round={g['round']}, scores={g['scores']}")

        # ---- assertions ----
        assert snap["data"]["status"] == "in_progress", "game must still be running"
        assert g is not None, "game state must be present in snapshot"
        assert g["scores"] == scores_before, "scores must survive reconnect"
        assert g["round"] >= 1
        # The secret target must NOT leak in the snapshot.
        assert "round_secret" not in g, "snapshot must not expose the answer"
        print("\nPASS: reconnection + state recovery verified (no secret leak)")

        await ws1.close()
        await ws2b.close()


if __name__ == "__main__":
    asyncio.run(main())
