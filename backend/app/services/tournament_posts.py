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
KIND_PLAYIN = "tournament_playin"
KIND_LIVE = "tournament_live"
KIND_ROUND = "tournament_round"
KIND_CHAMPION = "tournament_champion"
KIND_PREOPEN = "tournament_preopen"
KIND_NUDGE = "tournament_nudge"


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
    if round == 0:
        # Round 0 only exists when there is a play-in; it is always the play-in.
        return "the play-in", False
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


def rules_url() -> str:
    return f"{SITE}/tournament/rules"


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
    round1: list[tuple[str | None, str | None]],
) -> list[str]:
    """The bracket is up, composed as a THREAD so every player is tagged no
    matter the field size.

    `round1` is the main-draw first round as (handle|None, handle|None); a None
    seat is one a play-in winner will take, so it reads "vs a play-in winner"
    rather than being dropped (which would leave that direct entrant untagged).
    Matches where both seats are contested are omitted here - those players are
    tagged in the play-in post instead.
    """
    # First post: pure intro/hype, no fixtures. Fixtures (the "full bracket") and
    # the links come in the follow-up posts below it. `entrants`/`rounds` are no
    # longer surfaced in the copy but stay in the signature for the caller.
    intro = (
        f"THE BRACKET IS DRAWN FOR THIS WEEKEND'S {name.upper()}.\n\n"
        "CHECK YOUR FIXTURES, STUDY YOUR OPPONENT, AND GET SOME PRACTICE IN BEFORE FRIDAY.\n\n"
        "PLAY HARD, KEEP IT RESPECTFUL, AND HAVE FUN. THAT'S WHAT THE CAVE IS ABOUT.\n\n"
        "FULL BRACKET + RULES BELOW."
    )
    tail = (
        "BEST OF THREE EVERY ROUND.\n\n"
        "GOOD LUCK, EVERYONE.\n\n"
        f"FULL BRACKET: {bracket_url(tournament_id)}\n"
        f"RULES: {rules_url()}"
    )

    items: list[str] = []
    for p1, p2 in round1:
        if p1 and p2:
            items.append(f"{_at(p1)} VS {_at(p2)}")
        elif p1 or p2:
            items.append(f"{_at(p1 or p2)} VS A PLAY-IN WINNER")
        # both contested: skip; those players are tagged in the play-in post

    thread: list[str] = [intro]

    # Fixture posts: the header on the first, "MORE FIXTURES:" on any overflow, so
    # every player is tagged no matter the field size.
    fixture_posts: list[str] = []
    i, first = 0, True
    while i < len(items):
        header = "THIS WEEKEND'S FIXTURES:" if first else "MORE FIXTURES:"
        first = False
        body: list[str] = []
        while i < len(items):
            trial = f"{header}\n\n" + "\n".join(body + [items[i]])
            if len(trial) <= THREAD_CONT_LIMIT:
                body.append(items[i])
                i += 1
            else:
                break
        if not body:  # a single line longer than a whole post (pathological)
            body = [items[i]]
            i += 1
        fixture_posts.append(f"{header}\n\n" + "\n".join(body))

    if not fixture_posts:  # nothing listable (all contested / play-in only)
        fixture_posts.append("THIS WEEKEND'S FIXTURES:")

    # The tail (best-of-three + good luck + links) rides the last fixtures post if
    # it fits, otherwise it gets its own post so the links are never dropped.
    if len(f"{fixture_posts[-1]}\n\n{tail}") <= THREAD_CONT_LIMIT:
        fixture_posts[-1] = f"{fixture_posts[-1]}\n\n{tail}"
    else:
        fixture_posts.append(tail)

    thread.extend(fixture_posts)
    return thread


def compose_play_in(
    *,
    tournament_id: str,
    matches: list[tuple[str | None, str | None]],
) -> list[str]:
    """The play-in, as a THREAD so everyone fighting for the last seats is
    tagged. These are the players who registered latest; win here and you take
    a main-draw seat."""
    items = [f"{_at(a)} VS {_at(b)}" for a, b in matches if a and b]
    n = len(items)
    lead = (
        f"THE PLAY-IN IS SET. {n} {'MATCH' if n == 1 else 'MATCHES'}, "
        f"{n} {'SPOT' if n == 1 else 'SPOTS'} IN THE MAIN DRAW."
    )
    tail = f"WIN YOUR MATCH AND YOU'RE IN. GOOD LUCK.\n{bracket_url(tournament_id)}"

    thread: list[str] = []
    i, first_body = 0, []
    while i < len(items):
        trial = "\n\n".join([lead, "\n".join(first_body + [items[i]]), tail])
        if len(trial) <= THREAD_FIRST_LIMIT:
            first_body.append(items[i])
            i += 1
        else:
            break
    thread.append(
        "\n\n".join([lead, "\n".join(first_body), tail]) if first_body else f"{lead}\n\n{tail}"
    )
    while i < len(items):
        body: list[str] = []
        while i < len(items):
            trial = "\n".join(["MORE PLAY-IN:"] + body + [items[i]])
            if len(trial) <= THREAD_CONT_LIMIT:
                body.append(items[i])
                i += 1
            else:
                break
        if not body:
            body = [items[i]]
            i += 1
        thread.append("\n".join(["MORE PLAY-IN:"] + body))
    return thread


def compose_play_live(
    *, name: str, tournament_id: str, players: list[str], round: int, rounds: int
) -> list[str]:
    """Play just opened: the kickoff post, tagging everyone in the FIRST round
    that opens - the play-in when there is one, else round one. Threaded like the
    draw so no field size leaves anyone untagged.

    `round`/`rounds` name that first round in the copy (via round_label), so a
    play-in field reads "THE PLAY-IN IS OPEN", not the old hardcoded "ROUND ONE".

    Unlike the celebratory posts, this one does not shout. It is the tournament
    telling players they can start, and that they have until the round closes, so
    the tone is a calm nudge, not a starting gun.
    """
    label, plural = round_label(round, rounds)
    verb = "ARE OPEN" if plural else "IS OPEN"
    lead = (
        f"{label.upper()} {verb}. PLAY YOUR FIXTURE ANY TIME BEFORE THE DEADLINE. "
        "NO RUSH, BUT DON'T SLEEP ON IT.\n\n"
        "BEST OF THREE. WIN AND YOU'RE THROUGH."
    )
    tail = bracket_url(tournament_id)
    items = [_at(h) for h in players]

    thread: list[str] = []

    # First post: lead + as many mentions as fit above the link.
    i, first = 0, []
    while i < len(items):
        line = " ".join(first + [items[i]])
        if len("\n\n".join([lead, line, tail])) <= THREAD_FIRST_LIMIT:
            first.append(items[i])
            i += 1
        else:
            break
    thread.append(
        "\n\n".join([lead, " ".join(first), tail]) if first else f"{lead}\n\n{tail}"
    )

    # Continuation posts: the rest of the players, so nobody is left untagged.
    while i < len(items):
        names: list[str] = []
        while i < len(items):
            line = "ALSO UP: " + " ".join(names + [items[i]])
            if len(line) <= THREAD_CONT_LIMIT:
                names.append(items[i])
                i += 1
            else:
                break
        if not names:
            names = [items[i]]
            i += 1
        thread.append("ALSO UP: " + " ".join(names))

    return thread


def compose_round(
    *,
    tournament_id: str,
    round: int,
    rounds: int,
    results: list[tuple[str | None, str | None, int, int]],
    next_opens_phrase: str | None = None,
) -> list[str]:
    """A round is done. `results` is (winner, loser, winner_wins, loser_wins).

    `next_opens_phrase`, when given, is the pre-built line telling players when
    the next round opens (e.g. "THE SEMI-FINALS OPEN IN ABOUT 5 HOURS ...");
    it replaces the bare "UP NEXT" hint so nobody has to guess the schedule.

    Returns an ordered list of thread posts. A round down to one or two fixtures
    is a single post that tells the story with the scoreline. A wider round names
    every survivor, threaded so all of them are tagged no matter how many, rather
    than a single post that would truncate to "+N more".

    A loser of None is a bye, and a bye is never posted as a beaten opponent:
    walking through unopposed is not a result, and naming someone as having lost
    a match they were never in would be worse than saying nothing.
    """
    played = [r for r in results if r[1] is not None]
    label, plural = round_label(round, rounds)

    def _next_tail() -> str:
        """When the next round opens (in hours) + a one-line nudge, then the link.
        The final gets its own champion post, so a finished final has no next."""
        link = bracket_url(tournament_id)
        if round >= rounds:
            return link
        flavor = "ONE MATCH LEFT." if round + 1 == rounds else "CHECK YOUR FIXTURE."
        if next_opens_phrase:
            return f"{next_opens_phrase}. {flavor}\n{link}"
        nxt, nxt_plural = round_label(round + 1, rounds)
        verb = "OPEN" if nxt_plural else "OPENS"
        return f"{nxt.upper()} {verb} SOON. {flavor}\n{link}"

    # Down to one or two fixtures there is a story, so tell it with the score.
    if played and len(played) <= 2:
        lead = f"{label.upper()} {'ARE' if plural else 'IS'} DONE."
        body = [f"{_at(w)} TOOK IT {a}-{b} AGAINST {_at(l)}." for w, l, a, b in played]
        return [_fit(lead, body, _next_tail())]

    # A wide round names every survivor, threaded so all are tagged.
    lead = f"{label.upper()} {'ARE' if plural else 'IS'} WRAPPED."
    tail = _next_tail()
    survivors = [_at(w) for w, _, _, _ in results if w]

    thread: list[str] = []

    # First post: lead + "STILL STANDING: <names that fit>" + tail.
    i, first = 0, []
    while i < len(survivors):
        line = "STILL STANDING: " + " ".join(first + [survivors[i]])
        if len("\n\n".join([lead, line, tail])) <= THREAD_FIRST_LIMIT:
            first.append(survivors[i])
            i += 1
        else:
            break
    first_line = "STILL STANDING: " + " ".join(first) if first else "STILL STANDING:"
    thread.append("\n\n".join([lead, first_line, tail]))

    # Continuation posts: the rest of the survivors, so nobody is left untagged.
    while i < len(survivors):
        names: list[str] = []
        while i < len(survivors):
            line = "STILL STANDING: " + " ".join(names + [survivors[i]])
            if len(line) <= THREAD_CONT_LIMIT:
                names.append(survivors[i])
                i += 1
            else:
                break
        if not names:  # a single name longer than a whole post (pathological)
            names = [survivors[i]]
            i += 1
        thread.append("STILL STANDING: " + " ".join(names))

    return thread


def compose_preopen(
    *,
    tournament_id: str,
    round: int,
    rounds: int,
    opens_phrase: str,
) -> str:
    """The heads-up an hour before a new day's first round opens.

    `opens_phrase` is the when clause ("IN ABOUT 1 HOUR (2pm PT / 5pm ET)"). A
    single untagged post: it is a call to the whole field to come back, not a
    per-player ping, so it never fans out into a tagging thread.
    """
    label, _plural = round_label(round, rounds)
    return (
        f"{label.upper()} OPENS {opens_phrase}.\n"
        "CHECK IN THE MOMENT IT DOES, THE CLOCK STARTS THEN.\n"
        f"{bracket_url(tournament_id)}"
    )


def compose_nudge(
    *,
    tournament_id: str,
    round: int,
    rounds: int,
    targets: list[str],
    opp: str | None,
    minutes_left: int,
    tier: str,
) -> str:
    """A fixture is running out of time. `targets` are the handles who still owe
    a move (someone yet to check in, or the player whose turn it is); `opp` is
    the other player when there is a single clear target. tier is 'warn' (first
    heads-up) or 'last' (final call). One tagged post, so it lands on the right
    person's timeline without a thread.
    """
    label, _plural = round_label(round, rounds)
    who = " ".join(_at(h) for h in targets)
    mins = max(5, 5 * ((minutes_left + 2) // 5))
    left = f"about {mins} minutes"
    # round_label carries its own article ("the final"); capitalise it to open
    # the sentence. A nudge is a personal poke, so it stays in plain sentence
    # case, not the all-caps voice the bracket-wide posts use.
    ref = label
    if opp and len(targets) == 1:
        ref += f" vs {_at(opp)}"
    ref = ref[0].upper() + ref[1:]
    if tier == "last":
        head = f"{who} last call."
        body = f"{ref} closes in {left}. Make your move or it goes to the clock."
    else:
        head = f"{who} you're on the clock."
        body = f"{ref} closes in {left}. Wrap it up."
    return f"{head}\n{body}\n{bracket_url(tournament_id)}"


def compose_champion(
    *,
    name: str,
    tournament_id: str,
    champion: str | None,
    entrants: int,
    final_score: tuple[int, int] | None = None,
) -> str:
    """The one that matters. Reads like a sports account calling the end of an
    event, not a system printing results: a reusable hook ("THE CAVE HAS A
    CHAMPION"), the winner as the story rather than a list of who they beat, and
    a sign-off that sets up next weekend."""
    result = f"{_at(champion)} WINS THE {name.upper()}"
    if final_score:
        result += f" WITH A {final_score[0]}-{final_score[1]} FINAL"
    lead = f"\U0001f451 THE CAVE HAS A CHAMPION.\n\n{result}."  # 👑
    body = [f"{entrants} ENTERED. ONE LEFT WITH THE CROWN."]
    # No fixed cadence, so the close celebrates the win rather than promising a
    # next weekend that may not come.
    tail = (
        "ENJOY THE WIN. YOU EARNED IT.\n"
        f"{bracket_url(tournament_id)}"
    )
    return _fit(lead, body, tail)


# --------------------------------------------------------------------------- #
# Enqueue
# --------------------------------------------------------------------------- #

async def enqueue(
    db: AsyncSession,
    *,
    kind: str,
    dedupe_key: str,
    text: str,
    image_url: str | None = None,
) -> bool:
    """Owe a post. Returns False when it was already owed.

    Uses a savepoint so a duplicate key cannot poison the caller's transaction:
    this runs alongside the write that decided a fixture, and a lost result
    would be a far worse bug than a missing post. `image_url`, when set, is a
    fetchable image the sidecar attaches to the post (e.g. the champion card).
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
                AnnouncementOutbox(
                    kind=kind, dedupe_key=dedupe_key, text=text, image_url=image_url
                )
            )
    except IntegrityError:
        # Another request enqueued the same event between the check and the
        # insert. That is the unique index doing its job, not a failure.
        return False
    logger.info("queued %s post: %s", kind, dedupe_key)
    return True
