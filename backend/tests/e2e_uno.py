"""End-to-end Uno over real WebSockets (run against a live backend).

Plays a full 1v1 Uno between two guests, each client choosing moves only from
what the *server told that client* - never from the shared state - so this also
proves the game is playable from a legitimate client's point of view.

The assertion that matters most: Uno is the first turn-based game with hidden
state, and every other one broadcasts its whole board. This checks that no card
from your opponent's hand ever reaches your socket.

Usage:  API=http://127.0.0.1:8000 python tests/e2e_uno.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8000")
WS = API.replace("http", "ws")


async def guest(client: httpx.AsyncClient, name: str) -> dict:
    r = await client.post(f"{API}/auth/guest", json={"display_name": name})
    r.raise_for_status()
    return r.json()


def cards_in(node) -> list:
    """Every card-shaped dict anywhere in a payload, however nested."""
    found = []
    if isinstance(node, dict):
        if {"id", "color", "value"} <= node.keys():
            found.append(node)
        for v in node.values():
            found += cards_in(v)
    elif isinstance(node, list):
        for v in node:
            found += cards_in(v)
    return found


async def play(ws, me: str, label: str, out: dict):
    """Play to the end using only this client's own view of the game."""
    hand: list = []
    playable: set = set()
    drawn_id = None
    moves = 0
    # Card ids this socket saw in *public* payloads, and the ids that ever
    # legitimately reached the table (the discard top).
    seen_public: set = set()
    table_ids: set = set()
    own_ids: set = set()
    structural: list = []

    async for raw in ws:
        msg = json.loads(raw)
        t, data = msg["type"], msg.get("data", {})

        if t == "GAME_PRIVATE":
            hand = data["hand"]
            playable = set(data["playable"])
            drawn_id = data.get("drawn_id")
            own_ids |= {c["id"] for c in hand}

        elif t == "ROOM_STATE":
            board = data.get("board")
            mine = data.get("my_board")
            if mine:
                hand = mine["hand"]
                playable = set(mine["playable"])
                own_ids |= {c["id"] for c in hand}
            if board:
                structural.append(set(board.keys()))
                seen_public |= {c["id"] for c in cards_in(board)}
                table_ids.add(board["top"]["id"])

        elif t == "GAME_STATE":
            structural.append(set(data.keys()))
            seen_public |= {c["id"] for c in cards_in(data)}
            table_ids.add(data["top"]["id"])
            if data.get("winner"):
                continue
            if data["turn"] != me:
                continue

            # Our move. Choose only from what the server said is playable.
            await asyncio.sleep(0.02)
            choices = [c for c in hand if c["id"] in playable]
            if choices:
                card = choices[0]
                action = {"action": "play", "card_id": card["id"]}
                if card["color"] == "w":
                    action["color"] = "r"
            elif drawn_id is not None or data.get("must_play_or_pass"):
                action = {"action": "pass"}
            else:
                action = {"action": "draw"}
            moves += 1
            await ws.send(json.dumps({"type": "ACTION", "data": action}))

        elif t == "GAME_END":
            out[label] = {
                "end": data,
                "moves": moves,
                # Anything public that never reached the table is a leak.
                "leaked": seen_public - table_ids,
                "own": own_ids,
                "public_keys": set().union(*structural) if structural else set(),
            }
            return


async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        host = await guest(client, "Nova")
        opp = await guest(client, "Echo")

        r = await client.post(
            f"{API}/rooms",
            json={"game_type": "uno"},
            headers={"Authorization": f"Bearer {host['token']}"},
        )
        r.raise_for_status()
        room = r.json()
        room_id = room["id"]
        print(f"room created: {room_id} ({room['game_name']})")

        r = await client.post(
            f"{API}/rooms/{room_id}/join",
            headers={"Authorization": f"Bearer {opp['token']}"},
        )
        r.raise_for_status()
        print("opponent joined")

        url1 = f"{WS}/ws/{room_id}?token={host['token']}"
        url2 = f"{WS}/ws/{room_id}?token={opp['token']}"
        out: dict = {}

        async with websockets.connect(url1) as ws1, websockets.connect(url2) as ws2:
            await asyncio.sleep(0.3)
            await ws1.send(json.dumps({"type": "READY", "data": {}}))
            await ws2.send(json.dumps({"type": "READY", "data": {}}))
            await asyncio.wait_for(
                asyncio.gather(
                    play(ws1, host["identity"]["id"], "p1", out),
                    play(ws2, opp["identity"]["id"], "p2", out),
                ),
                timeout=120,
            )

    assert "p1" in out and "p2" in out, "both clients must see GAME_END"
    end = out["p1"]["end"]
    scores = end["scores"]

    print(f"moves played  : p1={out['p1']['moves']}  p2={out['p2']['moves']}")
    print(f"final scores  : {scores}")
    print(f"winner_id     : {end['winner_id']}")

    assert end["winner_id"], "Uno must always produce a winner"
    assert max(scores.values()) > 0, "the winner should score the loser's remaining cards"

    # The whole point of turn_private. A card only becomes public by being
    # played, so any public card id that never reached the table is a leak.
    for label in ("p1", "p2"):
        leaked = out[label]["leaked"]
        assert not leaked, f"{label} was shown card ids that were never played: {leaked}"
        keys = out[label]["public_keys"]
        assert "hands" not in keys and "deck" not in keys, (
            f"{label} received hands/deck in a public payload: {keys}"
        )

    p1_own, p2_own = out["p1"]["own"], out["p2"]["own"]
    print(f"p1 held {len(p1_own)} distinct cards, p2 held {len(p2_own)}")
    print("no card was ever shown to a client before it was played")

    print("\nPASS: Uno verified end-to-end (hidden hands, real moves, real winner)")


if __name__ == "__main__":
    asyncio.run(main())
