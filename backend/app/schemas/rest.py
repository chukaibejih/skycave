from datetime import datetime

from pydantic import BaseModel, Field


# --- Identity ---

class Identity(BaseModel):
    """Resolved identity from a JWT (Bluesky user or guest)."""

    id: str  # DID or guest:<id>
    is_guest: bool
    handle: str
    display_name: str
    avatar_url: str | None = None


# --- Auth ---

class GuestRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=24)


class TokenResponse(BaseModel):
    token: str
    identity: Identity


class LoginStartResponse(BaseModel):
    authorize_url: str


# --- Games ---

class GameInfo(BaseModel):
    type: str
    name: str
    tagline: str
    total_rounds: int
    mode: str  # "race" | "simultaneous"
    min_players: int = 2
    max_players: int = 2


# --- Rooms ---

class CreateRoomRequest(BaseModel):
    game_type: str
    mode: str = "versus"  # "versus" (1v1) | "solo"


class PlayerSlot(BaseModel):
    id: str
    handle: str
    display_name: str
    avatar_url: str | None = None
    is_guest: bool
    connected: bool = False
    ready: bool = False


class GameSummary(BaseModel):
    """Safe view of game state for REST (results page, recovery). Never the
    current round's secret answer."""

    game_type: str
    total_rounds: int
    mode: str
    round: int
    phase: str
    scores: dict[str, int]
    history: list[dict]
    round_data: dict | None = None
    round_ends_at: float | None = None
    last_result: dict | None = None
    # Present only for finished solo games (score + metric + personal-best info).
    solo_summary: dict | None = None


class RoomResponse(BaseModel):
    id: str
    game_type: str
    game_name: str
    mode: str = "versus"  # "versus" | "solo"
    status: str  # waiting | in_progress | finished
    host_id: str
    host_handle: str
    players: list[PlayerSlot]
    invite_url: str
    # Unix seconds when a waiting versus room auto-closes; null once claimed/solo.
    expires_at: int | None = None
    game: GameSummary | None = None


class JoinRoomResponse(BaseModel):
    room: RoomResponse
    you: PlayerSlot


# --- Stats ---

class UserStats(BaseModel):
    did: str
    handle: str
    display_name: str | None
    avatar_url: str | None
    games_played: int
    games_won: int
    total_score: int
    win_rate: float


# --- Score card ---

class ScorecardRequest(BaseModel):
    room_id: str


class ScorecardResponse(BaseModel):
    text: str
    intent_url: str  # bsky.app compose intent
    image_url: str | None = None


# --- Admin / backoffice ---

class AdminLoginRequest(BaseModel):
    password: str


class AdminTokenResponse(BaseModel):
    token: str


class GameTypeCount(BaseModel):
    game_type: str
    count: int


class AdminOverview(BaseModel):
    users: int
    games_played: int
    games_24h: int
    active_rooms: int
    rooms_in_progress: int
    by_game: list[GameTypeCount]


class DayBucket(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    versus: int
    solo: int
    users: int
    feedback: int


class AdminTimeseries(BaseModel):
    days: int
    buckets: list[DayBucket]


class AdminUsersResponse(BaseModel):
    total: int
    users: list["UserStats"]


class AdminGameRow(BaseModel):
    id: int
    game_type: str
    mode: str
    player1_handle: str
    player1_score: int
    player2_handle: str | None
    player2_score: int
    winner_id: str | None
    created_at: datetime


class AdminGamesResponse(BaseModel):
    total: int
    games: list[AdminGameRow]


# --- Leaderboard (public) ---

class LeaderboardEntry(BaseModel):
    rank: int
    did: str
    handle: str
    display_name: str | None
    avatar_url: str | None
    games_played: int
    games_won: int
    total_score: int
    win_rate: float


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]


# --- Feedback ---

class FeedbackRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    page: str | None = Field(default=None, max_length=255)


class FeedbackAck(BaseModel):
    ok: bool = True


class AdminFeedbackRow(BaseModel):
    id: int
    message: str
    submitter_handle: str | None
    is_guest: bool
    page: str | None
    created_at: datetime


class AdminFeedbackResponse(BaseModel):
    total: int
    feedback: list[AdminFeedbackRow]
