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
    # --- North America ---
    {"name": "New York City, USA", "lat": 40.7128, "lng": -74.0060},
    {"name": "Los Angeles, USA", "lat": 34.0522, "lng": -118.2437},
    {"name": "Chicago, USA", "lat": 41.8781, "lng": -87.6298},
    {"name": "San Francisco, USA", "lat": 37.7749, "lng": -122.4194},
    {"name": "Miami, USA", "lat": 25.7617, "lng": -80.1918},
    {"name": "Seattle, USA", "lat": 47.6062, "lng": -122.3321},
    {"name": "Denver, USA", "lat": 39.7392, "lng": -104.9903},
    {"name": "Houston, USA", "lat": 29.7604, "lng": -95.3698},
    {"name": "New Orleans, USA", "lat": 29.9511, "lng": -90.0715},
    {"name": "Las Vegas, USA", "lat": 36.1699, "lng": -115.1398},
    {"name": "Washington, D.C., USA", "lat": 38.9072, "lng": -77.0369},
    {"name": "Boston, USA", "lat": 42.3601, "lng": -71.0589},
    {"name": "Atlanta, USA", "lat": 33.7490, "lng": -84.3880},
    {"name": "Austin, USA", "lat": 30.2672, "lng": -97.7431},
    {"name": "Nashville, USA", "lat": 36.1627, "lng": -86.7816},
    {"name": "Honolulu, Hawaii", "lat": 21.3069, "lng": -157.8583},
    {"name": "Anchorage, Alaska", "lat": 61.2181, "lng": -149.9003},
    {"name": "Toronto, Canada", "lat": 43.6532, "lng": -79.3832},
    {"name": "Vancouver, Canada", "lat": 49.2827, "lng": -123.1207},
    {"name": "Montreal, Canada", "lat": 45.5019, "lng": -73.5674},
    {"name": "Calgary, Canada", "lat": 51.0447, "lng": -114.0719},
    {"name": "Yellowknife, Canada", "lat": 62.4540, "lng": -114.3718},
    {"name": "Mexico City, Mexico", "lat": 19.4326, "lng": -99.1332},
    {"name": "Cancún, Mexico", "lat": 21.1619, "lng": -86.8515},
    {"name": "Guadalajara, Mexico", "lat": 20.6597, "lng": -103.3496},
    {"name": "Panama City, Panama", "lat": 8.9824, "lng": -79.5199},
    {"name": "San José, Costa Rica", "lat": 9.9281, "lng": -84.0907},
    {"name": "Guatemala City, Guatemala", "lat": 14.6349, "lng": -90.5069},
    {"name": "Havana, Cuba", "lat": 23.1136, "lng": -82.3666},
    {"name": "Kingston, Jamaica", "lat": 17.9714, "lng": -76.7920},
    {"name": "San Juan, Puerto Rico", "lat": 18.4655, "lng": -66.1057},
    {"name": "Santo Domingo, Dominican Republic", "lat": 18.4861, "lng": -69.9312},
    {"name": "Nassau, Bahamas", "lat": 25.0443, "lng": -77.3504},
    # --- South America ---
    {"name": "Rio de Janeiro, Brazil", "lat": -22.9068, "lng": -43.1729},
    {"name": "São Paulo, Brazil", "lat": -23.5558, "lng": -46.6396},
    {"name": "Brasília, Brazil", "lat": -15.7939, "lng": -47.8828},
    {"name": "Manaus, Brazil", "lat": -3.1190, "lng": -60.0217},
    {"name": "Buenos Aires, Argentina", "lat": -34.6037, "lng": -58.3816},
    {"name": "Ushuaia, Argentina", "lat": -54.8019, "lng": -68.3030},
    {"name": "Lima, Peru", "lat": -12.0464, "lng": -77.0428},
    {"name": "Cusco, Peru", "lat": -13.5320, "lng": -71.9675},
    {"name": "Machu Picchu, Peru", "lat": -13.1631, "lng": -72.5450},
    {"name": "Bogotá, Colombia", "lat": 4.7110, "lng": -74.0721},
    {"name": "Cartagena, Colombia", "lat": 10.3910, "lng": -75.4794},
    {"name": "Medellín, Colombia", "lat": 6.2442, "lng": -75.5812},
    {"name": "Santiago, Chile", "lat": -33.4489, "lng": -70.6693},
    {"name": "Caracas, Venezuela", "lat": 10.4806, "lng": -66.9036},
    {"name": "Quito, Ecuador", "lat": -0.1807, "lng": -78.4678},
    {"name": "Galápagos Islands", "lat": -0.7438, "lng": -90.3033},
    {"name": "La Paz, Bolivia", "lat": -16.4897, "lng": -68.1193},
    {"name": "Montevideo, Uruguay", "lat": -34.9011, "lng": -56.1645},
    {"name": "Asunción, Paraguay", "lat": -25.2637, "lng": -57.5759},
    {"name": "Easter Island, Chile", "lat": -27.1127, "lng": -109.3497},
    # --- Europe ---
    {"name": "London, England", "lat": 51.5074, "lng": -0.1278},
    {"name": "Edinburgh, Scotland", "lat": 55.9533, "lng": -3.1883},
    {"name": "Dublin, Ireland", "lat": 53.3498, "lng": -6.2603},
    {"name": "Paris, France", "lat": 48.8566, "lng": 2.3522},
    {"name": "Nice, France", "lat": 43.7102, "lng": 7.2620},
    {"name": "Madrid, Spain", "lat": 40.4168, "lng": -3.7038},
    {"name": "Barcelona, Spain", "lat": 41.3874, "lng": 2.1686},
    {"name": "Seville, Spain", "lat": 37.3891, "lng": -5.9845},
    {"name": "Lisbon, Portugal", "lat": 38.7223, "lng": -9.1393},
    {"name": "Porto, Portugal", "lat": 41.1579, "lng": -8.6291},
    {"name": "Rome, Italy", "lat": 41.9028, "lng": 12.4964},
    {"name": "Venice, Italy", "lat": 45.4408, "lng": 12.3155},
    {"name": "Florence, Italy", "lat": 43.7696, "lng": 11.2558},
    {"name": "Milan, Italy", "lat": 45.4642, "lng": 9.1900},
    {"name": "Naples, Italy", "lat": 40.8518, "lng": 14.2681},
    {"name": "Amsterdam, Netherlands", "lat": 52.3676, "lng": 4.9041},
    {"name": "Brussels, Belgium", "lat": 50.8503, "lng": 4.3517},
    {"name": "Berlin, Germany", "lat": 52.5200, "lng": 13.4050},
    {"name": "Munich, Germany", "lat": 48.1351, "lng": 11.5820},
    {"name": "Zurich, Switzerland", "lat": 47.3769, "lng": 8.5417},
    {"name": "Geneva, Switzerland", "lat": 46.2044, "lng": 6.1432},
    {"name": "Vienna, Austria", "lat": 48.2082, "lng": 16.3738},
    {"name": "Prague, Czechia", "lat": 50.0755, "lng": 14.4378},
    {"name": "Budapest, Hungary", "lat": 47.4979, "lng": 19.0402},
    {"name": "Warsaw, Poland", "lat": 52.2297, "lng": 21.0122},
    {"name": "Kraków, Poland", "lat": 50.0647, "lng": 19.9450},
    {"name": "Copenhagen, Denmark", "lat": 55.6761, "lng": 12.5683},
    {"name": "Oslo, Norway", "lat": 59.9139, "lng": 10.7522},
    {"name": "Stockholm, Sweden", "lat": 59.3293, "lng": 18.0686},
    {"name": "Helsinki, Finland", "lat": 60.1699, "lng": 24.9384},
    {"name": "Reykjavik, Iceland", "lat": 64.1466, "lng": -21.9426},
    {"name": "Tallinn, Estonia", "lat": 59.4370, "lng": 24.7536},
    {"name": "Riga, Latvia", "lat": 56.9496, "lng": 24.1052},
    {"name": "Vilnius, Lithuania", "lat": 54.6872, "lng": 25.2797},
    {"name": "Athens, Greece", "lat": 37.9838, "lng": 23.7275},
    {"name": "Istanbul, Turkey", "lat": 41.0082, "lng": 28.9784},
    {"name": "Kyiv, Ukraine", "lat": 50.4501, "lng": 30.5234},
    {"name": "Bucharest, Romania", "lat": 44.4268, "lng": 26.1025},
    {"name": "Belgrade, Serbia", "lat": 44.7866, "lng": 20.4489},
    {"name": "Sofia, Bulgaria", "lat": 42.6977, "lng": 23.3219},
    {"name": "Zagreb, Croatia", "lat": 45.8150, "lng": 15.9819},
    {"name": "Moscow, Russia", "lat": 55.7558, "lng": 37.6173},
    {"name": "St. Petersburg, Russia", "lat": 59.9311, "lng": 30.3609},
    {"name": "Valletta, Malta", "lat": 35.8989, "lng": 14.5146},
    {"name": "Longyearbyen, Svalbard", "lat": 78.2232, "lng": 15.6267},
    # --- Africa ---
    {"name": "Cairo, Egypt", "lat": 30.0444, "lng": 31.2357},
    {"name": "Marrakesh, Morocco", "lat": 31.6295, "lng": -7.9811},
    {"name": "Casablanca, Morocco", "lat": 33.5731, "lng": -7.5898},
    {"name": "Tunis, Tunisia", "lat": 36.8065, "lng": 10.1815},
    {"name": "Algiers, Algeria", "lat": 36.7538, "lng": 3.0588},
    {"name": "Timbuktu, Mali", "lat": 16.7735, "lng": -3.0074},
    {"name": "Dakar, Senegal", "lat": 14.7167, "lng": -17.4677},
    {"name": "Bamako, Mali", "lat": 12.6392, "lng": -8.0029},
    {"name": "Accra, Ghana", "lat": 5.6037, "lng": -0.1870},
    {"name": "Abidjan, Ivory Coast", "lat": 5.3600, "lng": -4.0083},
    {"name": "Lagos, Nigeria", "lat": 6.5244, "lng": 3.3792},
    {"name": "Kinshasa, DR Congo", "lat": -4.4419, "lng": 15.2663},
    {"name": "Luanda, Angola", "lat": -8.8390, "lng": 13.2894},
    {"name": "Khartoum, Sudan", "lat": 15.5007, "lng": 32.5599},
    {"name": "Addis Ababa, Ethiopia", "lat": 9.0300, "lng": 38.7400},
    {"name": "Nairobi, Kenya", "lat": -1.2921, "lng": 36.8219},
    {"name": "Mombasa, Kenya", "lat": -4.0435, "lng": 39.6682},
    {"name": "Kampala, Uganda", "lat": 0.3476, "lng": 32.5825},
    {"name": "Kigali, Rwanda", "lat": -1.9441, "lng": 30.0619},
    {"name": "Dar es Salaam, Tanzania", "lat": -6.7924, "lng": 39.2083},
    {"name": "Zanzibar, Tanzania", "lat": -6.1659, "lng": 39.2026},
    {"name": "Lusaka, Zambia", "lat": -15.3875, "lng": 28.3228},
    {"name": "Victoria Falls", "lat": -17.9243, "lng": 25.8572},
    {"name": "Harare, Zimbabwe", "lat": -17.8252, "lng": 31.0335},
    {"name": "Windhoek, Namibia", "lat": -22.5609, "lng": 17.0658},
    {"name": "Maputo, Mozambique", "lat": -25.9692, "lng": 32.5732},
    {"name": "Johannesburg, South Africa", "lat": -26.2041, "lng": 28.0473},
    {"name": "Cape Town, South Africa", "lat": -33.9249, "lng": 18.4241},
    {"name": "Durban, South Africa", "lat": -29.8587, "lng": 31.0218},
    {"name": "Antananarivo, Madagascar", "lat": -18.8792, "lng": 47.5079},
    {"name": "Port Louis, Mauritius", "lat": -20.1609, "lng": 57.5012},
    # --- Middle East ---
    {"name": "Jerusalem", "lat": 31.7683, "lng": 35.2137},
    {"name": "Tel Aviv, Israel", "lat": 32.0853, "lng": 34.7818},
    {"name": "Amman, Jordan", "lat": 31.9539, "lng": 35.9106},
    {"name": "Petra, Jordan", "lat": 30.3285, "lng": 35.4444},
    {"name": "Beirut, Lebanon", "lat": 33.8938, "lng": 35.5018},
    {"name": "Baghdad, Iraq", "lat": 33.3152, "lng": 44.3661},
    {"name": "Tehran, Iran", "lat": 35.6892, "lng": 51.3890},
    {"name": "Dubai, UAE", "lat": 25.2048, "lng": 55.2708},
    {"name": "Abu Dhabi, UAE", "lat": 24.4539, "lng": 54.3773},
    {"name": "Doha, Qatar", "lat": 25.2854, "lng": 51.5310},
    {"name": "Riyadh, Saudi Arabia", "lat": 24.7136, "lng": 46.6753},
    {"name": "Muscat, Oman", "lat": 23.5880, "lng": 58.3829},
    {"name": "Kuwait City, Kuwait", "lat": 29.3759, "lng": 47.9774},
    # --- Asia ---
    {"name": "Tokyo, Japan", "lat": 35.6762, "lng": 139.6503},
    {"name": "Osaka, Japan", "lat": 34.6937, "lng": 135.5023},
    {"name": "Kyoto, Japan", "lat": 35.0116, "lng": 135.7681},
    {"name": "Seoul, South Korea", "lat": 37.5665, "lng": 126.9780},
    {"name": "Busan, South Korea", "lat": 35.1796, "lng": 129.0756},
    {"name": "Beijing, China", "lat": 39.9042, "lng": 116.4074},
    {"name": "Shanghai, China", "lat": 31.2304, "lng": 121.4737},
    {"name": "Hong Kong", "lat": 22.3193, "lng": 114.1694},
    {"name": "Chengdu, China", "lat": 30.5728, "lng": 104.0668},
    {"name": "Xi'an, China", "lat": 34.3416, "lng": 108.9398},
    {"name": "Taipei, Taiwan", "lat": 25.0330, "lng": 121.5654},
    {"name": "Ulaanbaatar, Mongolia", "lat": 47.8864, "lng": 106.9057},
    {"name": "Mumbai, India", "lat": 19.0760, "lng": 72.8777},
    {"name": "Delhi, India", "lat": 28.6139, "lng": 77.2090},
    {"name": "Bengaluru, India", "lat": 12.9716, "lng": 77.5946},
    {"name": "Kolkata, India", "lat": 22.5726, "lng": 88.3639},
    {"name": "Jaipur, India", "lat": 26.9124, "lng": 75.7873},
    {"name": "Kathmandu, Nepal", "lat": 27.7172, "lng": 85.3240},
    {"name": "Thimphu, Bhutan", "lat": 27.4728, "lng": 89.6390},
    {"name": "Colombo, Sri Lanka", "lat": 6.9271, "lng": 79.8612},
    {"name": "Malé, Maldives", "lat": 4.1755, "lng": 73.5093},
    {"name": "Dhaka, Bangladesh", "lat": 23.8103, "lng": 90.4125},
    {"name": "Karachi, Pakistan", "lat": 24.8607, "lng": 67.0011},
    {"name": "Lahore, Pakistan", "lat": 31.5497, "lng": 74.3436},
    {"name": "Bangkok, Thailand", "lat": 13.7563, "lng": 100.5018},
    {"name": "Singapore", "lat": 1.3521, "lng": 103.8198},
    {"name": "Kuala Lumpur, Malaysia", "lat": 3.1390, "lng": 101.6869},
    {"name": "Jakarta, Indonesia", "lat": -6.2088, "lng": 106.8456},
    {"name": "Bali, Indonesia", "lat": -8.3405, "lng": 115.0920},
    {"name": "Manila, Philippines", "lat": 14.5995, "lng": 120.9842},
    {"name": "Hanoi, Vietnam", "lat": 21.0278, "lng": 105.8342},
    {"name": "Ho Chi Minh City, Vietnam", "lat": 10.8231, "lng": 106.6297},
    {"name": "Phnom Penh, Cambodia", "lat": 11.5564, "lng": 104.9282},
    {"name": "Angkor Wat, Cambodia", "lat": 13.4125, "lng": 103.8670},
    {"name": "Yangon, Myanmar", "lat": 16.8661, "lng": 96.1951},
    {"name": "Almaty, Kazakhstan", "lat": 43.2220, "lng": 76.8512},
    {"name": "Samarkand, Uzbekistan", "lat": 39.6270, "lng": 66.9750},
    {"name": "Vladivostok, Russia", "lat": 43.1155, "lng": 131.8855},
    # --- Oceania ---
    {"name": "Sydney, Australia", "lat": -33.8688, "lng": 151.2093},
    {"name": "Melbourne, Australia", "lat": -37.8136, "lng": 144.9631},
    {"name": "Brisbane, Australia", "lat": -27.4698, "lng": 153.0251},
    {"name": "Perth, Australia", "lat": -31.9505, "lng": 115.8605},
    {"name": "Adelaide, Australia", "lat": -34.9285, "lng": 138.6007},
    {"name": "Darwin, Australia", "lat": -12.4634, "lng": 130.8456},
    {"name": "Uluru, Australia", "lat": -25.3444, "lng": 131.0369},
    {"name": "Auckland, New Zealand", "lat": -36.8485, "lng": 174.7633},
    {"name": "Wellington, New Zealand", "lat": -41.2865, "lng": 174.7762},
    {"name": "Queenstown, New Zealand", "lat": -45.0312, "lng": 168.6626},
    {"name": "Suva, Fiji", "lat": -18.1416, "lng": 178.4419},
    {"name": "Papeete, Tahiti", "lat": -17.5516, "lng": -149.5585},
    {"name": "Bora Bora", "lat": -16.5004, "lng": -151.7415},
    {"name": "Nouméa, New Caledonia", "lat": -22.2758, "lng": 166.4580},
    {"name": "Port Moresby, Papua New Guinea", "lat": -9.4438, "lng": 147.1803},
    # --- Landmarks & extremes ---
    {"name": "Grand Canyon, USA", "lat": 36.1069, "lng": -112.1129},
    {"name": "Niagara Falls", "lat": 43.0962, "lng": -79.0377},
    {"name": "Mount Everest", "lat": 27.9881, "lng": 86.9250},
    {"name": "Mount Kilimanjaro", "lat": -3.0674, "lng": 37.3556},
    {"name": "Serengeti, Tanzania", "lat": -2.3333, "lng": 34.8333},
    {"name": "Great Wall of China (Badaling)", "lat": 40.3587, "lng": 116.0169},
    {"name": "Nazca, Peru", "lat": -14.7390, "lng": -75.1300},
    {"name": "McMurdo Station, Antarctica", "lat": -77.8460, "lng": 166.6760},
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
        """A random target. The engine prefers new_round_unique so a game never
        repeats a place; this is the stateless fallback."""
        import random

        return self._round(random.choice(TARGETS))

    def new_round_unique(
        self, round_number: int, used: list[str]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """A target this game has not shown yet. `used` is the prompt names
        already served this game, so five rounds are five different places.
        Falls back to the full pool only if it were somehow exhausted (200
        places, 5 rounds - it never is)."""
        import random

        seen = set(used or [])
        pool = [t for t in TARGETS if t["name"] not in seen] or TARGETS
        return self._round(random.choice(pool))

    def _round(self, target: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
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
