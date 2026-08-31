"""Tournament engine check - pure logic, no server or database needed.

Usage:  python tests/tournament_rules.py

Simulates whole tournaments at every awkward field size. The things worth
proving: the bracket always resolves to exactly one champion, a fixture can
never stall (draws are the danger), the schedule always lands inside the
weekend, and - since we replaced byes with a play-in - that the field is drawn
*down* to a power of two, the last-registered play the play-in, and a play-in
winner lands in a real main-draw seat.
"""
import random
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, ".")

from app.services.tournament_engine import (  # noqa: E402
    GAME_POOL,
    SERIES_LENGTH,
    advance,
    bracket_size_for,
    build_bracket,
    champion,
    draw_fixture_games,
    draw_series,
    host_for_game,
    main_size_for,
    overflow_for,
    playable,
    record_game,
    round_deadlines,
    rounds_for,
)

# A generic play window used to exercise the round-deadline splitter; the exact
# bounds don't matter here, only that they bracket a weekend. (The live standard
# is Thursday 18:00 -> Sunday 18:00 Pacific; see eng.weekend_anchors.)
FRI = datetime(2026, 7, 24, 0, 0, tzinfo=timezone.utc)
SUN = datetime(2026, 7, 26, 23, 59, tzinfo=timezone.utc)


def play_out(fixtures, rng, draw_rate=0.0):
    """Play the whole bracket to a champion, optionally forcing draws. The
    play-in (round 0) is just the earliest playable fixtures, so no special
    handling is needed - it resolves first and feeds the main draw."""
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


def check_pool():
    print("--- game pool ---")
    assert "uno" in GAME_POOL, "Uno was decided IN the pool"
    for excluded in ("geoguess", "flag_rush", "outline_quiz", "reaction_grid", "mad_math"):
        assert excluded not in GAME_POOL, f"{excluded} must not be in the pool"
    rng = random.Random(1)
    s = draw_series(rng)
    assert len(set(s)) == SERIES_LENGTH
    print(f"  {len(GAME_POOL)} games: {', '.join(GAME_POOL)}")


def check_balanced_game_draw():
    """A whole bracket should feel random without visibly starving games."""
    print("--- balanced game draw ---")
    for fixtures in range(1, 64):
        for seed in range(20):
            lineups = draw_fixture_games(random.Random(seed), fixtures)
            flat = [game for lineup in lineups for game in lineup]
            counts = Counter(flat)
            game_counts = [counts[game] for game in GAME_POOL]
            assert len(lineups) == fixtures
            assert all(len(lineup) == SERIES_LENGTH == len(set(lineup)) for lineup in lineups)
            assert max(game_counts) - min(game_counts) <= 1, (
                f"{fixtures} fixtures, seed {seed}: uneven counts {counts}"
            )
            if fixtures <= 56:  # C(8, 3): every lineup can be different.
                signatures = [frozenset(lineup) for lineup in lineups]
                assert len(signatures) == len(set(signatures)), (
                    f"{fixtures} fixtures, seed {seed}: repeated lineup"
                )
    print("  1..63 fixtures: counts differ by at most one; lineups unique through 56 fixtures")


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
        assert window >= 11.9, f"field {field}: {window:.1f}h window is under the fairness floor"
        print(f"  field {field:>2} -> {r} rounds, {window:>4.1f}h each, ends {ds[-1]:%a %H:%M}")
    print("  a play-in takes the old first-round window, so the count is unchanged")


def check_powerof2_parity():
    """The safety net: a power-of-two field must draw the same clean bracket as
    before - no play-in, no empty seats, everyone in round one."""
    print("--- power-of-two parity (no play-in) ---")
    for field in (2, 4, 8, 16, 32):
        rng = random.Random(field)
        dids = [f"did:p{i}" for i in range(field)]
        fx = build_bracket(dids, rng)
        assert overflow_for(field) == 0
        assert not any(f.round == 0 for f in fx), f"field {field}: unexpected play-in"
        r1 = [f for f in fx if f.round == 1]
        assert len(r1) == field // 2, f"field {field}: round-1 match count"
        seats = [p for f in r1 for p in (f.p1, f.p2) if p]
        assert sorted(seats) == sorted(dids), f"field {field}: not everyone seated in round 1"
        assert all(f.p1 and f.p2 for f in r1), f"field {field}: an empty round-1 seat"
    print("  fields 2/4/8/16/32: full main draw, zero play-in, byes gone")


def check_playin_shapes():
    """For every non-power-of-two field, the play-in has the right size, feeds
    the contested seats, and loses nobody from the draw."""
    print("--- play-in shape ---")
    for field in range(2, 33):
        rng = random.Random(field)
        dids = [f"did:p{i}" for i in range(field)]
        fx = build_bracket(dids, rng)
        main = main_size_for(field)
        overflow = overflow_for(field)

        r0 = [f for f in fx if f.round == 0]
        r1 = [f for f in fx if f.round == 1]
        assert len(r0) == overflow, f"field {field}: expected {overflow} play-in matches, got {len(r0)}"
        assert len(r1) == main // 2, f"field {field}: round-1 count"

        # Every play-in match has two real players; no fixture is ever a bye.
        assert all(f.p1 and f.p2 for f in r0), f"field {field}: play-in seat empty"
        assert not any(f.is_bye for f in fx), f"field {field}: a bye survived"

        # Contested seats: exactly `overflow` round-1 seats start empty, and they
        # are the first `overflow` seat indices (slot i//2, p1 if i even).
        empty = [(f.slot, s) for f in r1 for s, p in enumerate((f.p1, f.p2)) if p is None]
        assert len(empty) == overflow, f"field {field}: {len(empty)} empty seats, want {overflow}"

        # Everyone appears exactly once, across the play-in and the direct seats.
        playin_players = [p for f in r0 for p in (f.p1, f.p2)]
        direct_players = [p for f in r1 for p in (f.p1, f.p2) if p]
        assert sorted(playin_players + direct_players) == sorted(dids), f"field {field}: entrant lost"
        assert len(playin_players) == 2 * overflow
        assert len(direct_players) == main - overflow

        # After the play-in resolves, its winners must fill the contested seats.
        for f in r0:
            record_game(f, f.p1, 9, 3)  # a best-of-3: sweep it 2-0 so it decides
            record_game(f, f.p1, 9, 3)
        advance(fx)
        for f in r1:
            assert f.p1 and f.p2, f"field {field}: contested seat never filled by a play-in winner"
        winners = {f.p1 for f in r0}
        seated = {p for f in r1 for p in (f.p1, f.p2)}
        assert winners <= seated, f"field {field}: a play-in winner did not reach the main draw"

        for f in fx:
            assert len(set(f.games)) == SERIES_LENGTH, f"field {field}: bad game series"
            assert all(g in GAME_POOL for g in f.games)
    print("  fields 2..32: play-in size, contested seats, and wiring all correct")


def check_playin_selection():
    """Your rule: the *last* 2*overflow to register play the play-in; everyone
    earlier is a direct entrant. Only the split is by registration - the pairing
    inside each group is random."""
    print("--- play-in selection (last to register) ---")
    for field in (9, 10, 11, 12, 13, 20):
        overflow = overflow_for(field)
        main = main_size_for(field)
        # Registration order: p0 earliest ... p{field-1} latest.
        dids = [f"did:p{i}" for i in range(field)]
        seen_playin, seen_direct = Counter(), Counter()
        for seed in range(40):
            fx = build_bracket(dids, random.Random(seed))
            playin = {p for f in fx if f.round == 0 for p in (f.p1, f.p2)}
            direct = {p for f in fx if f.round == 1 for p in (f.p1, f.p2) if p}
            want_playin = set(dids[field - 2 * overflow:])
            want_direct = set(dids[: field - 2 * overflow])
            assert playin == want_playin, f"field {field}: play-in set is not the last registrants"
            assert direct == want_direct, f"field {field}: direct set is not the earlier registrants"
            for p in playin:
                seen_playin[p] += 1
            for p in direct:
                seen_direct[p] += 1
        # The right people, deterministically: latest always play in, earliest never do.
        assert all(seen_playin[p] == 40 for p in dids[field - 2 * overflow:])
        assert all(seen_direct[p] == 40 for p in dids[: field - 2 * overflow])
        print(f"  field {field:>2}: last {2*overflow} always play in, first {main-overflow} always direct")


def check_full_tournaments():
    print("--- full tournaments ---")
    for field in [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 32, 64]:
        for seed in range(25):
            rng = random.Random(seed * 100 + field)
            dids = [f"did:p{i}" for i in range(field)]
            fx = build_bracket(dids, rng)
            champ = play_out(fx, rng)
            assert champ in dids, f"field {field} seed {seed}: bad champion {champ}"
            losers = {f.p1 if f.winner == f.p2 else f.p2 for f in fx if f.decided() and f.p1 and f.p2}
            assert champ not in losers, "the champion lost a series"
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
            dids = [f"did:p{i}" for i in range(11)]  # a field WITH a play-in
            fx = build_bracket(dids, rng)
            champ = play_out(fx, rng, draw_rate=rate)
            assert champ in dids, f"draw rate {rate}: no champion"
        print(f"  draw rate {rate:.0%}: 40 tournaments (with play-ins) still crowned a champion")


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
    print("  2-0 skips game three; hosting alternates p1/p2/p1")


def check_walkovers_and_vacated():
    """Rule 3: a true double no-show never advances the faster check-in. It is a
    walkover (the next-round opponent takes the slot), and a no-show final leaves
    the title vacated."""
    from app.services.tournament_engine import (
        Fixture, resolve_walkovers, final_decided, WALKOVER,
    )

    def semi_bracket():
        return [
            Fixture(round=1, slot=0, p1="A", p2="B"),
            Fixture(round=1, slot=1, p1="C", p2="D"),
            Fixture(round=2, slot=0),
        ]

    def settle(fx):
        for _ in range(10):
            if not (resolve_walkovers(fx) | advance(fx)):
                break

    # 1. non-final no-contest -> walkover to the present opponent
    fx = semi_bracket()
    fx[0].winner = WALKOVER  # R1S0 void
    fx[1].winner = "C"
    settle(fx)
    assert fx[2].winner == "C", "a void semifinal should hand the final to the present opponent"
    assert champion(fx) == "C"

    # 2. vacated final: both finalists no-show -> no champion, but it IS over
    fx = semi_bracket()
    fx[0].winner, fx[1].winner = "A", "C"
    settle(fx)
    fx[2].winner = WALKOVER
    assert champion(fx) is None, "a vacated final has no champion"
    assert final_decided(fx) is True, "a vacated final still ends the tournament"

    # 3. normal play still crowns a real champion
    fx = semi_bracket()
    fx[0].winner, fx[1].winner = "B", "D"
    settle(fx)
    fx[2].winner = "D"
    assert champion(fx) == "D" and final_decided(fx)
    print("  double no-show -> walkover; no-show final -> vacated; real play -> real champion")


if __name__ == "__main__":
    check_pool()
    check_balanced_game_draw()
    check_schedule()
    check_powerof2_parity()
    check_playin_shapes()
    check_playin_selection()
    check_sweeps_and_hosting()
    check_full_tournaments()
    check_draws_cannot_stall()
    check_walkovers_and_vacated()
    print("\nPASS: tournament engine verified (play-in)")
