"""Solo Uno vs the AI, over a real socket."""
import asyncio, json, os, httpx, websockets
API = os.environ.get("API", "http://127.0.0.1:8000"); WS = API.replace("http", "ws")

async def main():
    async with httpx.AsyncClient(timeout=10) as c:
        me = (await c.post(f"{API}/auth/guest", json={"display_name": "Solo"})).json()
        h = {"Authorization": f"Bearer {me['token']}"}
        room = (await c.post(f"{API}/rooms", json={"game_type": "uno", "mode": "solo"}, headers=h)).json()
    mid = me["identity"]["id"]
    hand, playable, moves, saw_ai_cards = [], set(), 0, 0
    async with websockets.connect(f"{WS}/ws/{room['id']}?token={me['token']}") as ws:
        await asyncio.sleep(0.3)
        await ws.send(json.dumps({"type": "READY", "data": {}}))
        async for raw in ws:
            m = json.loads(raw); t, d = m["type"], m.get("data", {})
            if t == "GAME_PRIVATE":
                hand = d["hand"]; playable = set(d["playable"])
            elif t == "GAME_STATE":
                if d.get("winner"): continue
                # the AI's hand must never appear anywhere
                if "hands" in d or "deck" in d: saw_ai_cards += 1
                if d["turn"] != mid: continue
                await asyncio.sleep(0.02)
                ch = [x for x in hand if x["id"] in playable]
                if ch:
                    a = {"action": "play", "card_id": ch[0]["id"]}
                    if ch[0]["color"] == "w": a["color"] = "r"
                elif d.get("must_play_or_pass"): a = {"action": "pass"}
                else: a = {"action": "draw"}
                moves += 1
                if moves % 20 == 0: print(f"  ...{moves} moves in", flush=True)
                await ws.send(json.dumps({"type": "ACTION", "data": a}))
            elif t == "GAME_END":
                print(f"solo finished: moves={moves} scores={d['scores']} winner={d['winner_id']}")
                assert saw_ai_cards == 0, "AI hand leaked into a public payload"
                # The engine sets winner_id=None for every solo game; the
                # result lives in the scores instead.
                sc = d["scores"]
                assert set(sc) == {"ai", mid}, f"both sides must be scored: {sc}"
                assert (sc["ai"] > 0) != (sc[mid] > 0), "exactly one side should win"
                print("PASS: solo Uno vs the Caver, AI hand never exposed")
                return
asyncio.run(asyncio.wait_for(main(), timeout=420))
