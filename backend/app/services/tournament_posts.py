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
KIND_LIVE = "tournament_live"
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

# Post-length budgets for a thread (the draw and wide rounds). The first post
# leaves room for the hashtags the sidecar appends; continuation posts carry
# none, so they use the full ceiling.
THREAD_FIRST_LIMIT = BSKY_LIMIT  # 270, room for #blacksky #blackskygamers
THREAD_CONT_LIMIT = 297


def _bye_lines(byes: list[str]) -> list[str]:
    """Bye handles as one or more taggable lines, split so none overflows a post.
    Byes are players too, and the whole point of the thread is that every player
    is tagged."""
    lines: list[str] = []
    cur: list[str] = []
    for h in byes:
        tag = _at(h)
        if cur and len("BYES: " + ", ".join(cur + [tag])) > 240:
            lines.append("BYES: " + ", ".join(cur))
            cur = [tag]
        else:
            cur.append(tag)
    if cur:
        lines.append("BYES: " + ", ".join(cur))
    return lines


def compose_draw(
    *,
    name: str,
    tournament_id: str,
    entrants: int,
    rounds: int,
    first_round: list[tuple[str | None, str | None]],
    byes: list[str],
) -> list[str]:
    """The bracket is up, composed as a THREAD so every player is tagged no
    matter the field size.

    The first post leads, carries the link, and (once the sidecar adds them) the
    hashtags; continuation posts carry the remaining fixtures. Nobody is folded
    into a "+N more" that never tags them. Returns the ordered post texts.
    """
    lead = (
        f"THE BRACKET IS LIVE. {entrants} PLAYERS. "
        f"{rounds} {'ROUND' if rounds == 1 else 'ROUNDS'}. LET'S GO."
    )
    tail = f"BEST OF THREE EVERY ROUND.\n{bracket_url(tournament_id)}"
    items = [f"{_at(p1)} VS {_at(p2)}" for p1, p2 in first_round if p1 and p2]
    items += _bye_lines(byes)

    thread: list[str] = []

    # First post: lead + as many fixtures as fit above the link.
    i, first_body = 0, []
    while i < len(items):
        trial = "\n\n".join([lead, "\n".join(first_body + [items[i]]), tail])
        if len(trial) <= THREAD_FIRST_LIMIT:
            first_body.append(items[i])
            i += 1
        else:
            break
    thread.append(
        "\n\n".join([lead, "\n".join(first_body), tail])
        if first_body
        else f"{lead}\n\n{tail}"
    )

    # Continuation posts: the rest of the fixtures, so nobody is left untagged.
    while i < len(items):
        body: list[str] = []
        while i < len(items):
            trial = "\n".join(["MORE FIXTURES:"] + body + [items[i]])
            if len(trial) <= THREAD_CONT_LIMIT:
                body.append(items[i])
                i += 1
            else:
                break
        if not body:  # a single line longer than a whole post (pathological)
            body = [items[i]]
            i += 1
        thread.append("\n".join(["MORE FIXTURES:"] + body))

    return thread


def compose_play_live(
    *, name: str, tournament_id: str, players: list[str]
) -> list[str]:
    """Play just opened: the kickoff post, tagging everyone with a round-one
    fixture so they know it is open. Threaded like the draw so no field size
    leaves anyone untagged.

    Unlike the celebratory posts, this one does not shout. It is the tournament
    telling players they can start, and that they have until the round closes, so
    the tone is a calm nudge, not a starting gun.
    """
    lead = (
        "Round one is open. No rush, play your first fixture any time before "
        "the round closes. Best of three, the winner goes through."
    )
    tail = bracket_url(tournament_id)
    items = [_at(h) for h in players]

    thread: list[str] = []

    # First post: lead + as many mentions as fit above the link.
    i, first = 0, []
    while i < len(items):
        line = ", ".join(first + [items[i]])
        if len("\n\n".join([lead, line, tail])) <= THREAD_FIRST_LIMIT:
            first.append(items[i])
            i += 1
        else:
            break
    thread.append(
        "\n\n".join([lead, ", ".join(first), tail]) if first else f"{lead}\n\n{tail}"
    )

    # Continuation posts: the rest of the players, so nobody is left untagged.
    while i < len(items):
        names: list[str] = []
        while i < len(items):
            line = "Also up: " + ", ".join(names + [items[i]])
            if len(line) <= THREAD_CONT_LIMIT:
                names.append(items[i])
                i += 1
            else:
                break
        if not names:
            names = [items[i]]
            i += 1
        thread.append("Also up: " + ", ".join(names))

    return thread


def compose_round(
    *,
    tournament_id: str,
    round: int,
    rounds: int,
    results: list[tuple[str | None, str | None, int, int]],
) -> list[str]:
    """A round is done. `results` is (winner, loser, winner_wins, loser_wins).

    Returns an ordered list of thread posts. A round down to one or two fixtures
    is a single post that tells the story with the scoreline. A wider round names
    every survivor, threaded so all of them are tagged no matter how many, rather
    than a single post that would truncate to "+N more".

    A loser of None is a bye, and a bye is never posted as a beaten opponent:
    walking through unopposed is not a result, and naming someone as having lost
    a match they were never in would be worse than saying nothing.
    """
    played = [r for r in results if r[1] is not None]
    label, _plural = round_label(round, rounds)

    # Down to one or two fixtures there is a story, so tell it with the score.
    if played and len(played) <= 2:
        lead = f"{label.upper()} DONE."
        tail = ""
        if round < rounds:
            nxt, _ = round_label(round + 1, rounds)
            tail = f"{nxt.upper()} UP NEXT.\n"
        tail += bracket_url(tournament_id)
        body = [f"{_at(w)} TOOK IT {a}-{b} AGAINST {_at(l)}" for w, l, a, b in played]
        return [_fit(lead, body, tail)]

    # A wide round names every survivor, threaded so all are tagged.
    lead = f"{label.upper()} WRAPPED."
    tail = ""
    if round < rounds:
        nxt, _ = round_label(round + 1, rounds)
        tail = f"{nxt.upper()} NEXT.\n"
    tail += bracket_url(tournament_id)
    survivors = [_at(w) for w, _, _, _ in results if w]

    thread: list[str] = []

    # First post: lead + "STILL STANDING: <names that fit>" + tail.
    i, first = 0, []
    while i < len(survivors):
        line = "STILL STANDING: " + ", ".join(first + [survivors[i]])
        if len("\n\n".join([lead, line, tail])) <= THREAD_FIRST_LIMIT:
            first.append(survivors[i])
            i += 1
        else:
            break
    first_line = "STILL STANDING: " + ", ".join(first) if first else "STILL STANDING:"
    thread.append("\n\n".join([lead, first_line, tail]))

    # Continuation posts: the rest of the survivors, so nobody is left untagged.
    while i < len(survivors):
        names: list[str] = []
        while i < len(survivors):
            line = "STILL STANDING: " + ", ".join(names + [survivors[i]])
            if len(line) <= THREAD_CONT_LIMIT:
                names.append(survivors[i])
                i += 1
            else:
                break
        if not names:  # a single name longer than a whole post (pathological)
            names = [survivors[i]]
            i += 1
        thread.append("STILL STANDING: " + ", ".join(names))

    return thread


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
