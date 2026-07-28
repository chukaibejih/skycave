"""What the @skycave.space account says about a tournament.

Pure composition plus an enqueue helper. The posting itself is the sidecar's
job, and the timing is the drain's; nothing here touches the network.

The cadence is deliberately not "one post per result". A 64-player bracket has
63 fixtures, and an account that fires 63 times over a weekend is an account
people mute. Instead:

  - one post when the bracket is drawn,
  - one when each round finishes, tagging everyone who went through,
  - one when there is a champion.

That is rounds + 2 posts for the whole event: four for a field of eight. Every
entrant still gets tagged the moment they win something, which is the part that
actually travels, and nobody has to watch the same account narrate a first-round
match between two people they do not follow.

Late rounds get their own voice. Once a round is down to a fixture or two there
is a real story to tell, so those posts name the scoreline instead of listing
survivors.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import AnnouncementOutbox

logger = logging.getLogger("skycave.tournament.posts")

# Bluesky's real ceiling is 300, but the sidecar appends the community hashtags
# (#blacksky #blackskygamers, ~27 chars) to every post. Compose under a lower
# limit so those tags always fit and a maxed-out draw post never loses them.
BSKY_LIMIT = 270
SITE = "skycave.space"

KIND_DRAW = "tournament_draw"
KIND_ROUND = "tournament_round"
KIND_CHAMPION = "tournament_champion"


def _at(handle: str | None) -> str:
    """A taggable mention. The whole point of posting from an account people can
    see is that the players get a notification, so handles are never trimmed to
    display names."""
    return f"@{handle}" if handle else "someone"


def round_label(round: int, rounds: int) -> tuple[str, bool]:
    """The round's name and whether it takes a plural verb.

    "The final is done" and "the semi-finals are done" both need saying, and
    getting that wrong is the giveaway that a bot wrote the post.
    """
    left = rounds - round
    if left == 0:
        return "the final", False
    if left == 1:
        return "the semi-finals", True
    if left == 2:
        return "the quarter-finals", True
    return f"round {round}", False


def round_name(round: int, rounds: int) -> str:
    return round_label(round, rounds)[0]


def _sentence(label: str, plural: bool, verb_tail: str) -> str:
    """"the semi-finals" + "done" -> "The semi-finals are done"."""
    return f"{label[0].upper()}{label[1:]} {'are' if plural else 'is'} {verb_tail}"


def bracket_url(tournament_id: str) -> str:
    return f"{SITE}/tournament/{tournament_id}"


def _fit(lead: str, body: list[str], tail: str) -> str:
    """Assemble under Bluesky's ceiling, sacrificing the middle.

    The lead is the news and the tail is the link, so neither can go. Supporting
    lines are dropped from the end until it fits, which degrades a long list of
    names into a short one rather than into a truncated word.
    """
    lines = list(body)
    while lines:
        text = "\n\n".join([lead, "\n".join(lines), tail])
        if len(text) <= BSKY_LIMIT:
            return text
        lines.pop()
    text = f"{lead}\n\n{tail}"
    return text if len(text) <= BSKY_LIMIT else text[:BSKY_LIMIT]


# --------------------------------------------------------------------------- #
# The three posts
# --------------------------------------------------------------------------- #

def compose_draw(
    *,
    name: str,
    tournament_id: str,
    entrants: int,
    rounds: int,
    first_round: list[tuple[str | None, str | None]],
    byes: list[str],
) -> str:
    """The bracket is up. The one post everybody in the field wants to see.

    A big field of long handles cannot fit every opening fixture in 300
    characters. When that happens the post says how many it left out instead of
    quietly showing the first few, because a truncated list reads as the whole
    draw and the players missing from it look like they were never entered.
    """
    lead = (
        f"THE BRACKET IS LIVE. {entrants} PLAYERS. "
        f"{rounds} {'ROUND' if rounds == 1 else 'ROUNDS'}. LET'S GO."
    )
    fixtures = [f"{_at(p1)} VS {_at(p2)}" for p1, p2 in first_round if p1 and p2]
    bye_line = f"BYES: {', '.join(_at(h) for h in byes)}" if byes else None
    tail = f"BEST OF THREE EVERY ROUND.\n{bracket_url(tournament_id)}"

    # Byes are supporting detail; they go before any fixture does.
    for extras in ([bye_line] if bye_line else [], []):
        for keep in range(len(fixtures), 0, -1):
            shown = fixtures[:keep]
            left = len(fixtures) - keep
            if left:
                shown = shown + [f"+{left} MORE FIXTURE{'S' if left > 1 else ''} ON THE BRACKET"]
            text = "\n\n".join([lead, "\n".join(shown + extras), tail])
            if len(text) <= BSKY_LIMIT:
                return text
    return f"{lead}\n\n{tail}"[:BSKY_LIMIT]


def compose_round(
    *,
    tournament_id: str,
    round: int,
    rounds: int,
    results: list[tuple[str | None, str | None, int, int]],
) -> str:
    """A round is done. `results` is (winner, loser, winner_wins, loser_wins).

    A loser of None is a bye, and a bye is never posted as a beaten opponent:
    walking through unopposed is not a result, and naming someone as having lost
    a match they were never in would be worse than saying nothing.
    """
    played = [r for r in results if r[1] is not None]
    label, _plural = round_label(round, rounds)

    # Down to one or two fixtures there is a story, so tell it with the score.
    # Any wider and a list of scorelines is just noise, so name who survived.
    if played and len(played) <= 2:
        lead = f"{label.upper()} DONE."
        tail = ""
        if round < rounds:
            nxt, _ = round_label(round + 1, rounds)
            tail = f"{nxt.upper()} UP NEXT.\n"
        tail += bracket_url(tournament_id)
        body = [f"{_at(w)} TOOK IT {a}-{b} AGAINST {_at(l)}" for w, l, a, b in played]
        return _fit(lead, body, tail)

    # A wide round names survivors. Same rule as the draw: if they do not all
    # fit, say how many are missing rather than showing a list that looks whole.
    lead = f"{label.upper()} WRAPPED."
    tail = ""
    if round < rounds:
        nxt, _ = round_label(round + 1, rounds)
        tail = f"{nxt.upper()} NEXT.\n"
    tail += bracket_url(tournament_id)
    through = [_at(w) for w, _, _, _ in results if w]
    for keep in range(len(through), 0, -1):
        left = len(through) - keep
        line = "STILL STANDING: " + ", ".join(through[:keep])
        if left:
            line += f" +{left} MORE"
        text = "\n\n".join([lead, line, tail])
        if len(text) <= BSKY_LIMIT:
            return text
    return f"{lead}\n\n{tail}"[:BSKY_LIMIT]


def compose_champion(
    *,
    name: str,
    tournament_id: str,
    champion: str | None,
    entrants: int,
    beaten: list[str],
    final_score: tuple[int, int] | None = None,
) -> str:
    """The one that matters. Names who they had to get through to get there."""
    lead = f"\U0001f451 {_at(champion)} WINS THE {name.upper()}."  # 👑
    body: list[str] = []
    if final_score:
        body.append(f"WENT {final_score[0]}-{final_score[1]} IN THE FINAL.")
    if beaten:
        body.append(f"TOOK OUT {', '.join(_at(h) for h in beaten)} ON THE WAY.")
    tail = (
        f"{entrants} ENTERED. ONE LEFT STANDING. SEE YOU NEXT WEEKEND.\n"
        f"{bracket_url(tournament_id)}"
    )
    return _fit(lead, body, tail)


# --------------------------------------------------------------------------- #
# Enqueue
# --------------------------------------------------------------------------- #

async def enqueue(
    db: AsyncSession, *, kind: str, dedupe_key: str, text: str
) -> bool:
    """Owe a post. Returns False when it was already owed.

    Uses a savepoint so a duplicate key cannot poison the caller's transaction:
    this runs alongside the write that decided a fixture, and a lost result
    would be a far worse bug than a missing post.
    """
    existing = (
        await db.execute(
            select(AnnouncementOutbox.id).where(
                AnnouncementOutbox.dedupe_key == dedupe_key
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return False
    try:
        async with db.begin_nested():
            db.add(
                AnnouncementOutbox(kind=kind, dedupe_key=dedupe_key, text=text)
            )
    except IntegrityError:
        # Another request enqueued the same event between the check and the
        # insert. That is the unique index doing its job, not a failure.
        return False
    logger.info("queued %s post: %s", kind, dedupe_key)
    return True
