"""The v5 per-round schedule: named daily slots, not even slices.

Usage:  python tests/tournament_schedule.py   (inside the api container)

The point of round_windows is that a round never opens in the middle of anyone's
night. These checks pin the shape it promised the players on the rulebook:

  - the final is always the Sunday evening slot;
  - nothing opens before 8am Pacific, and every night's decisive round closes at
    10pm Eastern (19:00 Pacific);
  - a two-round day carries a one-hour buffer between its rounds;
  - small fields spread Friday to Sunday, and only a full six-round field reaches
    back to the Thursday slot;
  - and, like the weekend anchors, the local hours hold across a DST change
    rather than drifting an hour with the UTC offset.
"""
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, ".")

from app.services import tournament_engine as eng

PACIFIC = ZoneInfo("America/Los_Angeles")
EASTERN = ZoneInfo("America/New_York")

# One inside daylight time, one inside standard time, so a pass really is season
# independent and not a fixed UTC offset in disguise.
SAMPLES = [
    ("summer (PDT)", datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)),
    ("winter (PST)", datetime(2026, 12, 15, 12, 0, tzinfo=timezone.utc)),
]

# rounds -> the set of Pacific weekdays (Mon=0) the windows should fall on.
EXPECTED_DAYS = {
    1: {6},              # Sun
    2: {5, 6},           # Sat, Sun
    3: {4, 5, 6},        # Fri, Sat, Sun  (the 5-8 player cup, one a night)
    4: {4, 5, 6},        # Fri, Sat, Sun
    5: {4, 5, 6},        # Fri, Sat, Sun
    6: {3, 4, 5, 6},     # Thu, Fri, Sat, Sun  (the full 33-64 field)
}


def _anchor(now: datetime) -> datetime:
    """The tournament's stored play_opens_at: Thursday 14:00 Pacific."""
    _closes, opens, _wall = eng.weekend_anchors(now)
    return opens


def test_final_is_always_sunday_evening() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            assert len(windows) == rounds, f"{label} r{rounds}: got {len(windows)} windows"
            open_final, close_final = windows[-1]
            o, c = open_final.astimezone(PACIFIC), close_final.astimezone(PACIFIC)
            assert o.weekday() == 6 and o.hour == 14, f"{label} r{rounds}: final opens {o:%a %H:%M}"
            assert c.weekday() == 6 and c.hour == 19, f"{label} r{rounds}: final closes {c:%a %H:%M}"
            # The final's close is the hard wall the weekend anchors publish.
            _closes, _opens, wall = eng.weekend_anchors(now)
            assert close_final == wall, f"{label} r{rounds}: final close {close_final} != wall {wall}"
    print("the final is the Sunday 2-7pm PT slot for every field size, both seasons")


def test_floor_wall_and_ordering() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            prev_close = None
            for open_utc, close_utc in windows:
                o = open_utc.astimezone(PACIFIC)
                c = close_utc.astimezone(PACIFIC)
                assert o.hour >= 8, f"{label} r{rounds}: opens {o:%a %H:%M}, before the 8am PT floor"
                assert (o.hour, c.hour) in {eng.EVENING, eng.MORNING}, (
                    f"{label} r{rounds}: window {o:%H:%M}-{c:%H:%M} is neither slot shape"
                )
                # Evening rounds are the nightly wall: 19:00 PT == 22:00 ET.
                if (o.hour, c.hour) == eng.EVENING:
                    assert c.astimezone(EASTERN).hour == 22, (
                        f"{label} r{rounds}: evening closes {c.astimezone(EASTERN):%H:%M} ET, not 10pm"
                    )
                if prev_close is not None:
                    assert open_utc >= prev_close, f"{label} r{rounds}: windows overlap or go backwards"
                prev_close = close_utc
    print("nothing opens before 8am PT, evenings close at 10pm ET, windows never overlap")


def test_same_day_buffer_is_one_hour() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            by_day: dict = {}
            for open_utc, close_utc in windows:
                o = open_utc.astimezone(PACIFIC)
                by_day.setdefault(o.date(), []).append((open_utc, close_utc))
            for day, wins in by_day.items():
                if len(wins) < 2:
                    continue
                wins.sort()
                for (_, a_close), (b_open, _) in zip(wins, wins[1:]):
                    gap = (b_open - a_close).total_seconds() / 3600
                    assert gap == 1.0, f"{label} r{rounds} {day}: {gap}h between rounds, not 1h"
    print("two-round days carry exactly a one-hour buffer between their rounds")


def test_field_size_spreads_correctly() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds, expected in EXPECTED_DAYS.items():
            windows = eng.round_windows(opens, rounds)
            days = {o.astimezone(PACIFIC).weekday() for o, _ in windows}
            assert days == expected, f"{label} r{rounds}: runs on {sorted(days)}, expected {sorted(expected)}"
            # Thursday (weekday 3) is reserved for the full six-round field.
            assert (3 in days) == (rounds == 6), f"{label} r{rounds}: Thursday used at the wrong size"
    print("small fields spread Fri-Sun; only a full six-round field starts Thursday")


def main() -> None:
    test_final_is_always_sunday_evening()
    test_floor_wall_and_ordering()
    test_same_day_buffer_is_one_hour()
    test_field_size_spreads_correctly()
    print("\nPASS: the schedule lands where the rulebook says it does")


if __name__ == "__main__":
    main()
