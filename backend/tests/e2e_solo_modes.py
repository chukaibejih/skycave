"""Solo driver coverage for the timed / words / ladder kinds (live backend).

  - color_clash (timed):  answering correctly advances the prompt + bumps the
                          count; a skip advances without scoring.
  - word_duel  (words):   a junk word is rejected (score stays 0).
  - reaction_grid (ladder): correct sequences climb levels; a wrong one ends the
                          run with GAME_END + solo_summary "reached level N".

Usage:  API=http://127.0.0.1:8014 python tests/e2e_solo_modes.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8014")
WS = API.replace("http", "ws")


async def guest(client, name):
    return (await client.post(f"{API}/auth/guest", json={"display_name": name})).json()


async def solo_room(client, token, game_type):
    r = await client.post(
        f"{API}/rooms",
        json={"game_type": game_type, "mode": "solo"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return r.json()["id"]


async def recv(ws, want, timeout=15):
    async def loop():
        async for raw in ws:
            m = json.loads(raw)
            if m["type"] in want:
                return m
    return await asyncio.wait_for(loop(), timeout)


async def test_timed(client):
    g = await guest(client, "Timed")
    rid = await solo_room(client, g["token"], "color_clash")
    async with websockets.connect(f"{WS}/ws/{rid}?token={g['token']}") as ws:
        await asyncio.sleep(0.2)
        await ws.send(json.dumps({"type": "READY", "data": {}}))
        rs = await recv(ws, {"ROUND_START"})
        for i in range(3):
            rd = rs["data"]["round_data"]
            correct = next(o["label"] for o in rd["options"] if o["hex"] == rd["ink_hex"])
            await ws.send(json.dumps({"type": "ACTION", "data": {"choice": correct}}))
            rs = await recv(ws, {"ROUND_START"})  # next prompt after correct
            assert rs["data"]["scores"][g["identity"]["id"]] == i + 1
        score_before = rs["data"]["scores"][g["identity"]["id"]]
        # Skip advances the prompt without changing the score.
        await ws.send(json.dumps({"type": "ACTION", "data": {"skip": True}}))
        rs = await recv(ws, {"ROUND_START"})
        assert rs["data"]["scores"][g["identity"]["id"]] == score_before
    print(f"  timed (color_clash): score climbed to {score_before}, skip kept it. OK")


async def test_words(client):
    g = await guest(client, "Words")
    rid = await solo_room(client, g["token"], "word_duel")
    async with websockets.connect(f"{WS}/ws/{rid}?token={g['token']}") as ws:
        await asyncio.sleep(0.2)
        await ws.send(json.dumps({"type": "READY", "data": {}}))
        rs = await recv(ws, {"ROUND_START"})
        assert "letters" in rs["data"]["round_data"]
        # A guaranteed-invalid submission is rejected, score stays 0.
        await ws.send(json.dumps({"type": "ACTION", "data": {"word": "ZZZZZZ"}}))
        pa = await recv(ws, {"PLAYER_ACTION"})
        assert pa["data"]["correct"] is False and pa["data"]["score"] == 0
    print("  words (word_duel): junk word rejected, score 0. OK")


async def test_ladder(client):
    g = await guest(client, "Ladder")
    pid = g["identity"]["id"]
    rid = await solo_room(client, g["token"], "reaction_grid")
    end = None
    async with websockets.connect(f"{WS}/ws/{rid}?token={g['token']}") as ws:
        await asyncio.sleep(0.2)
        await ws.send(json.dumps({"type": "READY", "data": {}}))
        rs = await recv(ws, {"ROUND_START"})
        # Clear two levels by echoing the (publicly shown) sequence back.
        for _ in range(2):
            seq = rs["data"]["round_data"]["sequence"]
            await ws.send(json.dumps({"type": "ACTION", "data": {"sequence": seq}}))
            rs = await recv(ws, {"ROUND_START"})
        level_reached = rs["data"]["scores"][pid]  # 2 cleared so far
        # Now miss on purpose -> run ends.
        await ws.send(json.dumps({"type": "ACTION", "data": {"sequence": [99]}}))
        end = (await recv(ws, {"GAME_END"}))["data"]
    assert end["mode"] == "solo" and end["winner_id"] is None
    s = end["solo_summary"]
    assert s and "level" in s["metric"], s
    assert end["scores"][pid] == level_reached == 2
    print(f"  ladder (reaction_grid): cleared {level_reached} levels, "
          f"metric={s['metric']!r}. OK")


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        await test_timed(client)
        await test_words(client)
        await test_ladder(client)
    print("\nPASS: timed + words + ladder solo drivers verified")


if __name__ == "__main__":
    asyncio.run(main())
