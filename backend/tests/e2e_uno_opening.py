"""Solo Uno must not freeze when the opening card skips the human.

Uno is the first turn-based game whose opening card can hand the first turn to
the opponent: a skip, reverse or draw-two on top means the human does not start.
Every earlier turn game began with the human, so the solo AI was only ever
started by a human move, and a game that opened on the AI's turn sat frozen with
"The Caver's turn" on screen and nothing happening. It hit roughly one solo game
in six.

Rather than play whole games and hope to stumble into it, this opens rooms until
it finds one that actually opened on the AI's turn, then asserts the AI moves on
its own.

Usage:  API=http://127.0.0.1:8000 python tests/e2e_uno_opening.py
"""
import asyncio
import json
import os

import httpx
import websockets

API = os.environ.get("API", "http://127.0.0.1:8000")
WS = API.replace("http", "ws")
MAX_ROOMS = 40  # ~1 in 6 open this way, so this is a very safe ceiling


async def try_one(client: httpx.AsyncClient) -> bool | None:
    """Open one solo game. None if it did not open on the AI's turn.

    True/False = the AI did / did not move by itself.
    """
    me = (await client.post(f"{API}/auth/guest", json={"display_name": "Opening"})).json()
    room = (
        await client.post(
            f"{API}/rooms",
            json={"game_type": "uno", "mode": "solo"},
            headers={"Authorization": f"Bearer {me['token']}"},
        )
    ).json()
    mid = me["identity"]["id"]

    async with websockets.connect(f"{WS}/ws/{room['id']}?token={me['token']}") as ws:
        await asyncio.sleep(0.25)
        await ws.send(json.dumps({"type": "READY", "data": {}}))

        opened_on_ai = None
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=6)
            except asyncio.TimeoutError:
                # Nothing more arrived. If the board was the AI's and it never
                # moved, that is exactly the freeze this guards against.
                return False if opened_on_ai else None

            msg = json.loads(raw)
            if msg["type"] != "GAME_STATE":
                continue
            board = msg["data"]

            if opened_on_ai is None:
                opened_on_ai = board["turn"] != mid
                if not opened_on_ai:
                    return None  # human starts; not the case under test
                continue

            # A second board means the AI took its turn without being prompted.
            return True


async def main() -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(1, MAX_ROOMS + 1):
            result = await try_one(client)
            if result is None:
                continue
            assert result, (
                f"game opened on the AI's turn (attempt {attempt}) and the AI "
                f"never moved - solo Uno is frozen from the first board"
            )
            print(f"found an AI-first opening on attempt {attempt}; the Caver moved on its own")
            print("\nPASS: an opening card that skips the human does not freeze solo Uno")
            return

    print(f"inconclusive: no AI-first opening in {MAX_ROOMS} rooms (unlikely - check the deck)")


if __name__ == "__main__":
    asyncio.run(main())
