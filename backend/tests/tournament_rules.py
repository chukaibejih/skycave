"""Tournament engine check - pure logic, no server or database needed.

Usage:  python tests/tournament_rules.py

Simulates whole tournaments at every awkward field size. The things worth
proving are that the bracket always resolves to exactly one champion, that a
fixture can never stall (draws are the danger), that byes behave, and that the
schedule always lands inside the weekend.
"""
import random
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from app.services.tournament_engine import (  # noqa: E402
    GAME_POOL,
    MAX_FIELD,
    SERIES_LENGTH,
    advance,
    apply_byes,
    bracket_size_for,
    build_bracket,
    champion,
    draw_series,
    host_for_game,
    playable,
    record_game,
    round_deadlines,
    rounds_for,
)

# The real weekend anchors: play opens Friday 00:00 UTC, hard wall Sunday 23:59.
FRI = datetime(2026, 7, 24, 0, 0, tzinfo=timezone.utc)
SUN = datetime(2026, 7, 26, 23, 59, tzinfo=timezone.utc)


def play_out(fixtures, rng, draw_rate=0.0):
    """Play the whole bracket to a champion, optionally forcing draws."""
    apply_byes(fixtures)
    advance(fixtures)
    guard = 0
    while champion(fixtures) is None:
        guard += 1
        assert guard < 500, "bracket failed to converge"
        live = playable(fixtures)
        if not live:
            assert advance(fixtures), "no playable fixture and nothing to advance"
            continue
        for fx in live:
            while not fx.decided():
                if rng.random() < draw_rate:
                    record_game(fx, None, 5, 5)  # a genuine draw
                else:
                    win = fx.p1 if rng.random() < 0.5 else fx.p2
                    s1, s2 = (9, 3) if win == fx.p1 else (3, 9)
                    record_game(fx, win, s1, s2)
        advance(fixtures)
    return champion(fixtures)


def check_schedule():
    print("--- schedule ---")
    for field, want_rounds in [(3, 2), (4, 2), (5, 3), (8, 3), (9, 4), (16, 4), (32, 5), (64, 6)]:
        r = rounds_for(field)
        assert r == want_rounds, f"field {field}: expected {want_rounds} rounds, got {r}"
        ds = round_deadlines(FRI, SUN, r)
        assert len(ds) == r
        assert ds[-1] == SUN, f"field {field}: last deadline {ds[-1]} is not the Sunday wall"
        assert all(a < b for a, b in zip(ds, ds[1:])), "deadlines must increase"
        window = (ds[0] - FRI).total_seconds() / 3600
        # The floor is "roughly 12h" (plan). The published wall is Sunday 23:59,
        # so the window is 71h59m and six rounds land at 11.997h, which is the
        # floor for practical purposes rather than a breach of it.
        assert window >= 11.9, f"field {field}: {window:.1f}h window is under the fairness floor"
        print(f"  field {field:>2} -> {r} rounds, {window:>4.1f}h each, ends {ds[-1]:%a %H:%M}")
    print("  every schedule ends exactly on the Sunday wall")


def check_bracket_shapes():
    print("--- bracket shape + byes ---")
    for field in range(2, 17):
        rng = random.Random(field)
        dids = [f"did:p{i}" for i in range(field)]
        fx = build_bracket(dids, rng)
        size = bracket_size_for(field)
        r1 = [f for f in fx if f.round == 1]
        assert len(r1) == size // 2, f"field {field}: wrong round-1 match count"
        byes = [f for f in r1 if f.is_bye]
        assert len(byes) == size - field, f"field {field}: expected {size-field} byes"
        # Everyone appears exactly once in round one.
        seats = [p for f in r1 for p in (f.p1, f.p2) if p]
        assert sorted(seats) == sorted(dids), f"field {field}: entrants missing from the draw"
        # Every fixture, in every round, has three distinct published games.
        for f in fx:
            assert len(f.games) == SERIES_LENGTH, f"fixture {f.round}/{f.slot} has {len(f.games)} games"
            assert len(set(f.games)) == SERIES_LENGTH, "a series repeated a game"
            assert all(g in GAME_POOL for g in f.games), "a game came from outside the pool"
    print(f"  fields 2..16: sizes, bye counts, and 3 distinct games per fixture all correct")


def check_byes_are_random():
    """A bye must be luck. Over many draws, everyone should catch one."""
    print("--- byes are random ---")
    field = 5  # bracket 8, so 3 byes
    got = Counter()
    for seed in range(300):
        rng = random.Random(seed)
        dids = [f"did:p{i}" for i in range(field)]
        fx = build_bracket(dids, rng)
        for f in fx:
            if f.round == 1 and f.is_bye:
                got[f.p1 or f.p2] += 1
    assert len(got) == field, f"only {len(got)} of {field} players ever got a bye"
    lo, hi = min(got.values()), max(got.values())
    assert hi <= lo * 2, f"bye distribution looks skewed: {dict(got)}"
    print(f"  all {field} players drew byes across 300 draws (min {lo}, max {hi})")


def check_full_tournaments():
    print("--- full tournaments ---")
    for field in [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 32, 64]:
        for seed in range(25):
            rng = random.Random(seed * 100 + field)
            dids = [f"did:p{i}" for i in range(field)]
            fx = build_bracket(dids, rng)
            champ = play_out(fx, rng)
            assert champ in dids, f"field {field} seed {seed}: bad champion {champ}"
            # Exactly one unbeaten player.
            losers = {f.p1 if f.winner == f.p2 else f.p2 for f in fx if f.decided() and f.p1 and f.p2}
            assert champ not in losers, "the champion lost a series"
            # Nobody plays more games than the format allows.
            for f in fx:
                real = [r for r in f.results if not r.get("replay")]
                assert len(real) <= SERIES_LENGTH, f"series ran {len(real)} games"
        print(f"  field {field:>2}: 25 tournaments, one champion each")


def check_draws_cannot_stall():
    """The danger case: games that keep drawing must still resolve the series."""
    print("--- heavy draws ---")
    for rate in (0.3, 0.6, 0.9):
        for seed in range(40):
            rng = random.Random(seed)
            dids = [f"did:p{i}" for i in range(8)]
            fx = build_bracket(dids, rng)
            champ = play_out(fx, rng, draw_rate=rate)
            assert champ in dids, f"draw rate {rate}: no champion"
        print(f"  draw rate {rate:.0%}: 40 tournaments still crowned a champion")


def check_sweeps_and_hosting():
    print("--- sweeps + hosting ---")
    rng = random.Random(7)
    fx = build_bracket([f"did:p{i}" for i in range(4)], rng)
    m = [f for f in fx if f.round == 1][0]
    record_game(m, m.p1, 9, 1)
    record_game(m, m.p1, 9, 1)
    assert m.decided() and m.winner == m.p1, "2-0 should decide the series"
    real = [r for r in m.results if not r.get("replay")]
    assert len(real) == 2, f"a sweep should skip game three, played {len(real)}"

    a, b = "did:a", "did:b"
    hosts = [host_for_game(a, b, i) for i in range(3)]
    assert hosts == [a, b, a], f"hosting should alternate, got {hosts}"
    assert host_for_game(a, None, 1) == a, "a bye has no second host"
    print("  2-0 skips game three; hosting alternates p1/p2/p1")


def check_pool():
    print("--- game pool ---")
    assert "uno" in GAME_POOL, "Uno was decided IN the pool"
    for excluded in ("geoguess", "flag_rush", "outline_quiz", "reaction_grid", "mad_math"):
        assert excluded not in GAME_POOL, f"{excluded} must not be in the pool"
    rng = random.Random(1)
    s = draw_series(rng)
    assert len(set(s)) == SERIES_LENGTH
    print(f"  {len(GAME_POOL)} games: {', '.join(GAME_POOL)}")


if __name__ == "__main__":
    check_pool()
    check_schedule()
    check_bracket_shapes()
    check_byes_are_random()
    check_sweeps_and_hosting()
    check_full_tournaments()
    check_draws_cannot_stall()
    print("\nPASS: tournament engine verified")
