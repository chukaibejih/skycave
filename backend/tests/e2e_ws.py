"""End-to-end WebSocket flow test (run against a live backend).

Plays a full Color Clash game between two guests, deriving the correct answer
from each ROUND_START payload (the ink color = the option whose hex matches
ink_hex). Asserts the full lifecycle: GAME_START -> ROUND_START* -> ROUND_RESULT*
-> GAME_END, and that the server-computed scores are internally consistent.

Usage:  API=http://127.0.0.1:8011 python tests/e2e_ws.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8011")
WS = API.replace("http", "ws")


async def guest(client: httpx.AsyncClient, name: str) -> dict:
    r = await client.post(f"{API}/auth/guest", json={"display_name": name})
    r.raise_for_status()
    return r.json()


def correct_choice(round_data: dict) -> str:
    ink = round_data["ink_hex"]
    for opt in round_data["options"]:
        if opt["hex"] == ink:
            return opt["label"]
    raise AssertionError("no option matches ink_hex")


async def play(ws, label, results, *, answer=True):
    """Consume events; answer rounds correctly (or not) until GAME_END."""
    seen = {"ROUND_START": 0, "ROUND_RESULT": 0}
    async for raw in ws:
        msg = json.loads(raw)
        t, data = msg["type"], msg.get("data", {})
        if t == "ROUND_START":
            seen["ROUND_START"] += 1
            if answer:
                rd = data["round_data"]
                # tiny stagger so player1 usually wins the race
                await asyncio.sleep(0.01 if label == "p1" else 0.05)
                await ws.send(json.dumps(
                    {"type": "ACTION", "data": {"choice": correct_choice(rd)}}
                ))
        elif t == "ROUND_RESULT":
            seen["ROUND_RESULT"] += 1
        elif t == "GAME_END":
            results[label] = {"end": data, "seen": seen}
            return


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        host = await guest(client, "Nova")
        opp = await guest(client, "Echo")

        # Create a Color Clash room as host.
        r = await client.post(
            f"{API}/rooms",
            json={"game_type": "color_clash"},
            headers={"Authorization": f"Bearer {host['token']}"},
        )
        r.raise_for_status()
        room = r.json()
        room_id = room["id"]
        print(f"room created: {room_id} ({room['game_name']})")

        # Opponent joins via REST.
        r = await client.post(
            f"{API}/rooms/{room_id}/join",
            headers={"Authorization": f"Bearer {opp['token']}"},
        )
        r.raise_for_status()
        print("opponent joined")

        url1 = f"{WS}/ws/{room_id}?token={host['token']}"
        url2 = f"{WS}/ws/{room_id}?token={opp['token']}"
        results: dict = {}

        async with websockets.connect(url1) as ws1, websockets.connect(url2) as ws2:
            # Drain initial ROOM_STATE / PLAYER_JOINED, then send READY from both.
            await asyncio.sleep(0.3)
            await ws1.send(json.dumps({"type": "READY", "data": {}}))
            await ws2.send(json.dumps({"type": "READY", "data": {}}))

            await asyncio.wait_for(
                asyncio.gather(
                    play(ws1, "p1", results, answer=True),
                    play(ws2, "p2", results, answer=True),
                ),
                timeout=60,
            )

        # ---- assertions ----
        assert "p1" in results and "p2" in results, "both clients must see GAME_END"
        end1 = results["p1"]["end"]
        seen1 = results["p1"]["seen"]
        scores = end1["scores"]
        total = sum(scores.values())

        print(f"rounds started: {seen1['ROUND_START']}")
        print(f"round results : {seen1['ROUND_RESULT']}")
        print(f"final scores  : {scores}")
        print(f"winner_id     : {end1['winner_id']}")

        assert seen1["ROUND_START"] == 10, "expected 10 rounds"
        assert seen1["ROUND_RESULT"] == 10, "expected 10 round results"
        # Every round had a correct answer from at least one player, so the
        # combined points must equal 10 (1 point/round).
        assert total == 10, f"expected total 10 points, got {total}"
        assert end1["winner_id"] in (*scores.keys(), None)
        print("\nPASS: full WS lifecycle verified end-to-end")


if __name__ == "__main__":
    asyncio.run(main())
