"""GeoGuess 1v1 - tap a location on the globe, closest to target wins.

Simultaneous mode: both players drop a pin, each is scored by great-circle
distance from the secret target. 5 rounds. Per-round points fall off
exponentially with distance so a near-miss still scores well.
"""
from __future__ import annotations

import math
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

# Curated, recognizable places. Coordinates alone give infinite variation, but
# anchoring on known cities/landmarks keeps rounds satisfying to guess.
TARGETS: list[dict[str, Any]] = [
    {"name": "Paris, France", "lat": 48.8566, "lng": 2.3522},
    {"name": "Tokyo, Japan", "lat": 35.6762, "lng": 139.6503},
    {"name": "New York City, USA", "lat": 40.7128, "lng": -74.0060},
    {"name": "Cairo, Egypt", "lat": 30.0444, "lng": 31.2357},
    {"name": "Sydney, Australia", "lat": -33.8688, "lng": 151.2093},
    {"name": "Rio de Janeiro, Brazil", "lat": -22.9068, "lng": -43.1729},
    {"name": "Cape Town, South Africa", "lat": -33.9249, "lng": 18.4241},
    {"name": "Moscow, Russia", "lat": 55.7558, "lng": 37.6173},
    {"name": "Mumbai, India", "lat": 19.0760, "lng": 72.8777},
    {"name": "Reykjavik, Iceland", "lat": 64.1466, "lng": -21.9426},
    {"name": "Nairobi, Kenya", "lat": -1.2921, "lng": 36.8219},
    {"name": "Buenos Aires, Argentina", "lat": -34.6037, "lng": -58.3816},
    {"name": "Istanbul, Turkey", "lat": 41.0082, "lng": 28.9784},
    {"name": "Bangkok, Thailand", "lat": 13.7563, "lng": 100.5018},
    {"name": "Mexico City, Mexico", "lat": 19.4326, "lng": -99.1332},
    {"name": "Lagos, Nigeria", "lat": 6.5244, "lng": 3.3792},
    {"name": "Toronto, Canada", "lat": 43.6532, "lng": -79.3832},
    {"name": "Singapore", "lat": 1.3521, "lng": 103.8198},
    {"name": "Dubai, UAE", "lat": 25.2048, "lng": 55.2708},
    {"name": "Rome, Italy", "lat": 41.9028, "lng": 12.4964},
    {"name": "Honolulu, Hawaii", "lat": 21.3069, "lng": -157.8583},
    {"name": "Anchorage, Alaska", "lat": 61.2181, "lng": -149.9003},
    {"name": "Ushuaia, Argentina", "lat": -54.8019, "lng": -68.3030},
    {"name": "Kathmandu, Nepal", "lat": 27.7172, "lng": 85.3240},
    {"name": "Lima, Peru", "lat": -12.0464, "lng": -77.0428},
    {"name": "Stockholm, Sweden", "lat": 59.3293, "lng": 18.0686},
    {"name": "Marrakesh, Morocco", "lat": 31.6295, "lng": -7.9811},
    {"name": "Jakarta, Indonesia", "lat": -6.2088, "lng": 106.8456},
    {"name": "Vancouver, Canada", "lat": 49.2827, "lng": -123.1207},
    {"name": "Athens, Greece", "lat": 37.9838, "lng": 23.7275},
]

EARTH_RADIUS_KM = 6371.0
MAX_POINTS = 5000
# Distance (km) over which the score decays by a factor of e.
DECAY_KM = 1500.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


class GeoGuess(BaseGame):
    type = "geoguess"
    name = "GeoGuess 1v1"
    tagline = "Drop a pin. Closest to the target wins the round."
    total_rounds = 5
    round_time = 25.0
    result_delay = 5.0
    mode = SIMULTANEOUS

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        # Deterministic-but-varied selection without repeats within a game would
        # need game state; for MVP pick by a rotating offset + round.
        import random

        target = random.choice(TARGETS)
        public = {"prompt": target["name"], "round_time": self.round_time}
        secret = {"lat": target["lat"], "lng": target["lng"], "name": target["name"]}
        return public, secret

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        scores: dict[str, int] = {}
        for player_id, action in actions.items():
            try:
                lat = float(action["lat"])
                lng = float(action["lng"])
            except (KeyError, TypeError, ValueError):
                scores[player_id] = 0
                continue
            dist = _haversine_km(lat, lng, secret["lat"], secret["lng"])
            pts = round(MAX_POINTS * math.exp(-dist / DECAY_KM))
            scores[player_id] = pts
        return scores

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"lat": secret["lat"], "lng": secret["lng"], "name": secret["name"]}

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score:,} pts · {self.total_rounds} rounds"

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        guesses: dict[str, dict[str, Any]] = {}
        for player_id, action in actions.items():
            try:
                lat = float(action["lat"])
                lng = float(action["lng"])
            except (KeyError, TypeError, ValueError):
                continue
            guesses[player_id] = {
                "lat": lat,
                "lng": lng,
                "distance_km": round(
                    _haversine_km(lat, lng, secret["lat"], secret["lng"])
                ),
                "points": points.get(player_id, 0),
            }
        return {"guesses": guesses}
