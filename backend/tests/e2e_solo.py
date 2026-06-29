"""End-to-end single-player flow (run against a live backend).

One guest plays a full GeoGuess solo game: create a solo room, connect, READY
(no opponent needed), drop a pin each of the 5 rounds, and assert GAME_END
arrives with mode="solo", winner_id=None, and a solo_summary (score + metric).

Usage:  API=http://127.0.0.1:8013 python tests/e2e_solo.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8013")
WS = API.replace("http", "ws")


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        guest = (await client.post(
            f"{API}/auth/guest", json={"display_name": "Solo"}
        )).json()
        token = guest["token"]

        # Create a SOLO room.
        room = (await client.post(
            f"{API}/rooms",
            json={"game_type": "geoguess", "mode": "solo"},
            headers={"Authorization": f"Bearer {token}"},
        )).json()
        assert room["mode"] == "solo", f"expected solo room, got {room['mode']}"
        room_id = room["id"]
        print(f"solo room: {room_id} (mode={room['mode']})")

        url = f"{WS}/ws/{room_id}?token={token}"
        rounds = 0
        async with websockets.connect(url) as ws:
            await asyncio.sleep(0.2)
            await ws.send(json.dumps({"type": "READY", "data": {}}))  # solo: starts now

            end = None
            async def loop():
                nonlocal rounds, end
                async for raw in ws:
                    msg = json.loads(raw)
                    t, data = msg["type"], msg.get("data", {})
                    if t == "ROUND_START":
                        rounds += 1
                        # Drop a fixed pin each round.
                        await ws.send(json.dumps(
                            {"type": "ACTION", "data": {"lat": 40.0, "lng": -74.0}}
                        ))
                    elif t == "GAME_END":
                        end = data
                        return
            await asyncio.wait_for(loop(), timeout=60)

        # ---- assertions ----
        assert end is not None, "never received GAME_END"
        assert rounds == 5, f"expected 5 rounds, got {rounds}"
        assert end["mode"] == "solo", f"GAME_END mode should be solo: {end.get('mode')}"
        assert end["winner_id"] is None, "solo has no winner"
        summary = end.get("solo_summary")
        assert summary, "GAME_END must carry solo_summary"
        assert "metric" in summary and "pts" in summary["metric"], summary
        # Guest PB is device-local, so the server reports is_best=None.
        assert summary["is_best"] is None, f"guest is_best should be None: {summary}"
        print(f"rounds={rounds}  score={summary['score']}  metric={summary['metric']!r}")

        # Solo room exposes mode + solo_summary over REST too (results refresh).
        fetched = (await client.get(f"{API}/rooms/{room_id}")).json()
        assert fetched["mode"] == "solo"
        assert fetched["game"]["solo_summary"]["score"] == summary["score"]
        print("REST room reflects mode=solo + solo_summary")
        print("\nPASS: GeoGuess solo verified end-to-end")


if __name__ == "__main__":
    asyncio.run(main())
