"""Pre-flight checks for a live tournament, against the real world.

Usage:  python tests/tournament_verify.py   (inside the api container)

These are the things that only break in production. The bracket maths, the
series and the posts all have their own suites; this covers where Skycave
depends on something outside itself:

  - the weekend anchors landing on the same wall-clock hour on both sides of a
    daylight saving change, which is the classic way a "Thursday 8am" deadline
    silently becomes 7am for half the year;
  - real profiles resolving on more than one PDS, because Skycave's players are
    mostly *not* on bsky.social and a tournament entrant with no avatar looks
    like a broken account on the bracket;
  - a player who renamed between registering and playing still being reachable,
    which is what a stored handle cannot promise and a DID can.

The profile checks hit the live network against real Skycave players, and they
assert. If those accounts stop resolving, the bracket really is broken, and a
test that shrugged at that would be worth nothing.
"""
import asyncio
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, ".")

from app.services import tournament_engine as eng
from app.services.bluesky_auth import fetch_profile

PACIFIC = ZoneInfo("America/Los_Angeles")

# One date inside daylight time, one inside standard time.
SAMPLES = [
    ("summer (PDT, UTC-7)", datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)),
    ("winter (PST, UTC-8)", datetime(2026, 12, 15, 12, 0, tzinfo=timezone.utc)),
    ("the weekend the clocks go back", datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)),
    ("the weekend the clocks go forward", datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)),
]

# Real Skycave players, taken from production rather than invented. The mix
# matters: blacksky.app is the *majority* of the player base (25 accounts to
# bsky.social's 11 at the time of writing), so treating bsky.social as the
# normal case and everything else as an edge case would have it backwards.
HANDLES = [
    ("bsky.social", "askari.bsky.social"),
    ("blacksky.app", "acentricrugrat.blacksky.app"),
    ("blacksky.app", "the3jsmom.blacksky.app"),
    ("latinsky.app", "raythediva.latinsky.app"),
    ("nonexistent", "this-handle-should-not-exist-skycave-test.invalid"),
]

# A real Skycave player who renamed themselves. Their DID has not moved, so it
# is the thing worth storing and the thing worth re-resolving from.
RENAMED_DID = "did:plc:bqw4i2ys6yhweecn5evtbrcy"
RENAMED_FROM = "raythevirgo.latinsky.app"


def test_deadline_holds_its_wall_clock() -> None:
    print("Registration closes Thursday 08:00 Pacific, whatever the season:\n")
    seen_offsets = set()
    for label, now in SAMPLES:
        closes, opens, play_closes = eng.weekend_anchors(now)
        local = closes.astimezone(PACIFIC)
        offset = local.utcoffset()
        seen_offsets.add(offset)

        assert local.hour == eng.CLOSE_HOUR, (
            f"{label}: closes at {local.hour}:00 local, not {eng.CLOSE_HOUR}:00"
        )
        assert local.weekday() == eng.CLOSE_WEEKDAY, (
            f"{label}: closes on weekday {local.weekday()}, not {eng.CLOSE_WEEKDAY}"
        )
        assert closes > now, f"{label}: the deadline is in the past"
        assert opens > closes, f"{label}: play opens before registration closes"
        assert play_closes > opens, f"{label}: the wall is before the window opens"
        # The whole event has to fit inside its weekend.
        span = play_closes - opens
        assert span.days <= 3, f"{label}: play window is {span}, longer than a weekend"

        print(
            f"  {label:34} closes {local:%a %d %b %H:%M} {local:%Z} "
            f"= {closes:%H:%M} UTC | play {opens:%a %H:%M} -> {play_closes:%a %H:%M} UTC"
        )

    assert len(seen_offsets) >= 2, (
        "every sample landed in the same UTC offset, so this proved nothing about DST"
    )
    print(
        f"\n  saw {len(seen_offsets)} distinct UTC offsets, so the local hour is genuinely "
        f"anchored and not a fixed offset in disguise"
    )


async def test_profiles_resolve_across_pds() -> None:
    print("\nProfiles, on the networks Skycave's players actually use:\n")
    for label, handle in HANDLES:
        profile = await fetch_profile(handle)
        if label == "nonexistent":
            assert profile is None, f"a bogus handle resolved: {profile}"
            print(f"  {label:14} {handle:52} correctly refused")
            continue
        assert profile is not None, (
            f"{handle} did not resolve. These are real Skycave players; if their "
            f"profile cannot be fetched, their seat on the bracket is blank."
        )
        assert profile["did"].startswith("did:"), profile
        assert profile["handle"], profile
        has_avatar = bool(profile["avatar_url"])
        print(
            f"  {label:14} {handle:52} {profile['did'][:22]}... "
            f"avatar={'yes' if has_avatar else 'NONE'}"
        )
        assert has_avatar, (
            f"{handle} resolved with no avatar; the bracket would show a blank seat"
        )


async def test_a_renamed_entrant_is_corrected_before_the_draw() -> None:
    """The case that made this check exist.

    Registration snapshots a handle. Play happens days later. In between, people
    rename themselves, and an @mention of the old handle resolves to nothing:
    the announcement post that was meant to tag them quietly does not, and the
    bracket shows a name they have stopped using. Re-resolving by DID at draw
    time is what stops a stale snapshot from surviving into the event.
    """
    from app.models.tournament import TournamentEntrant
    from app.services.tournament import refresh_entrants

    stale = TournamentEntrant(
        tournament_id="verify",
        did=RENAMED_DID,
        handle=RENAMED_FROM,
        display_name="whatever they were called then",
        avatar_url=None,
    )
    await refresh_entrants([stale])

    print("\nA player who renamed between signing up and playing:\n")
    print(f"  stored at registration  @{RENAMED_FROM}")
    print(f"  after the draw refresh  @{stale.handle}  ({stale.display_name})")
    assert stale.handle != RENAMED_FROM, (
        "the stale handle survived the refresh, so every post would tag a dead mention"
    )
    assert stale.handle.endswith("latinsky.app"), stale.handle
    assert stale.avatar_url, "the refresh did not pick up their avatar"


async def test_the_refresh_can_never_block_a_draw() -> None:
    """Every failure has to leave the stored snapshot alone and move on."""
    from app.models.tournament import TournamentEntrant
    from app.services.tournament import refresh_entrants

    ghost = TournamentEntrant(
        tournament_id="verify",
        did="did:plc:definitelynotarealdidatall",
        handle="kept.bsky.social",
        display_name="Kept",
        avatar_url="https://example.invalid/a.png",
    )
    await refresh_entrants([ghost])
    assert ghost.handle == "kept.bsky.social", ghost.handle
    assert ghost.display_name == "Kept", ghost.display_name
    print("\na profile that cannot be resolved leaves the stored one untouched")


async def main() -> None:
    test_deadline_holds_its_wall_clock()
    await test_profiles_resolve_across_pds()
    await test_a_renamed_entrant_is_corrected_before_the_draw()
    await test_the_refresh_can_never_block_a_draw()
    print("\nPASS: deadlines hold their wall clock, every PDS resolves, renames are corrected")


if __name__ == "__main__":
    asyncio.run(main())
