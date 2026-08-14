"""The v6 per-round schedule: wide, field-scaled windows, not fixed slots.

Usage:  python tests/tournament_schedule.py   (inside the api container)

round_windows splits the play window into `rounds` equal slices, from a start
sized to the field to the Sunday 7pm Pacific wall, each open nudged out of the
dead of night and contiguous with a one-hour settle buffer between rounds. A
small field therefore gets a few wide windows instead of tight 5-hour slots.
These checks pin the promises made on the rulebook:

  - one window per round, ordered, never overlapping;
  - nothing opens before 8am Pacific;
  - the final always closes on the Sunday 7pm wall (10pm Eastern);
  - consecutive rounds carry exactly a one-hour buffer;
  - every window is generous (>= 5h), wider than the old fixed slots;
  - play starts no earlier than Thursday 2pm, and only a full six-round field
    starts that early;
  - and the local hours hold across a DST change, not a fixed UTC offset.
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


def _anchor(now: datetime) -> datetime:
    """The tournament's stored play_opens_at anchor: Thursday 14:00 Pacific."""
    _closes, opens, _wall = eng.weekend_anchors(now)
    return opens


def test_count_wall_and_floor() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        _c, _o, wall = eng.weekend_anchors(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            assert len(windows) == rounds, f"{label} r{rounds}: got {len(windows)} windows"
            for open_utc, close_utc in windows:
                o = open_utc.astimezone(PACIFIC)
                assert o.hour >= 8, f"{label} r{rounds}: opens {o:%a %H:%M}, before the 8am PT floor"
                assert open_utc < close_utc, f"{label} r{rounds}: a window is empty or backwards"
            close_final = windows[-1][1]
            assert close_final == wall, f"{label} r{rounds}: final close {close_final} != wall {wall}"
            cfp = close_final.astimezone(PACIFIC)
            assert cfp.weekday() == 6 and cfp.hour == 19, f"{label} r{rounds}: final closes {cfp:%a %H:%M}, not Sun 19:00"
            assert close_final.astimezone(EASTERN).hour == 22, f"{label} r{rounds}: wall is not 10pm ET"
    print("one window per round; opens >= 8am PT; the final closes on the Sunday 7pm wall (10pm ET)")


def test_order_no_overlap_and_buffer() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            for (_, a_close), (b_open, _) in zip(windows, windows[1:]):
                assert b_open >= a_close, f"{label} r{rounds}: windows overlap or go backwards"
                gap = (b_open - a_close).total_seconds() / 3600
                assert gap == 1.0, f"{label} r{rounds}: {gap}h between rounds, not the 1h buffer"
    print("windows are ordered, never overlap, and carry exactly a one-hour settle buffer")


def test_windows_are_generous() -> None:
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            for open_utc, close_utc in windows:
                hours = (close_utc - open_utc).total_seconds() / 3600
                assert hours >= 5, f"{label} r{rounds}: a {hours:.0f}h window is tighter than the old 5h slot"
    print("every window is at least 5h - a small field gets room, not the old tight slots")


def test_start_scales_with_field() -> None:
    for label, now in SAMPLES:
        thursday_2pm = _anchor(now).astimezone(PACIFIC)  # Thu 14:00 Pacific
        for rounds in range(1, 7):
            windows = eng.round_windows(_anchor(now), rounds)
            first = windows[0][0].astimezone(PACIFIC)
            assert first >= thursday_2pm, f"{label} r{rounds}: starts {first:%a %H:%M}, before Thursday 2pm"
            # Only a full six-round field (33-64 players) reaches back to Thursday.
            assert (first.weekday() == 3) == (rounds == 6), (
                f"{label} r{rounds}: starts {first:%a}, Thursday used at the wrong field size"
            )
    print("play starts no earlier than Thursday 2pm; only a six-round field starts Thursday")


def test_hours_hold_across_dst() -> None:
    shapes: dict[int, dict[str, list]] = {}
    for label, now in SAMPLES:
        opens = _anchor(now)
        for rounds in range(1, 7):
            windows = eng.round_windows(opens, rounds)
            shape = [
                (
                    o.astimezone(PACIFIC).weekday(), o.astimezone(PACIFIC).hour,
                    c.astimezone(PACIFIC).weekday(), c.astimezone(PACIFIC).hour,
                )
                for o, c in windows
            ]
            shapes.setdefault(rounds, {})[label] = shape
    for rounds, by_label in shapes.items():
        vals = list(by_label.values())
        assert all(v == vals[0] for v in vals), f"r{rounds}: the schedule's local hours drift across DST"
    print("every window's Pacific weekday+hour holds identically across a DST change")


def main() -> None:
    test_count_wall_and_floor()
    test_order_no_overlap_and_buffer()
    test_windows_are_generous()
    test_start_scales_with_field()
    test_hours_hold_across_dst()
    print("\nPASS: the v6 wide-window schedule lands where the rulebook says it does")


if __name__ == "__main__":
    main()
