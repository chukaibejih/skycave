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
    created_at: datetime | None = None  # account created (admin list only)


# --- Player profile ---
class ProfileGame(BaseModel):
    game_type: str
    best_score: int
    plays: int


class ProfileRecent(BaseModel):
    game_type: str
    mode: str  # versus | solo
    result: str  # win | loss | draw | solo
    opponent: str | None  # opponent handle, or "Caver" for solo
    your_score: int
    created_at: datetime


class ProfileRival(BaseModel):
    handle: str
    wins: int
    losses: int
    games: int


class Badge(BaseModel):
    key: str
    label: str
    detail: str


class ProfileResponse(BaseModel):
    handle: str
    display_name: str | None
    avatar_url: str | None
    joined: datetime
    games_played: int  # all modes (1v1 + solo)
    games_won: int  # 1v1 wins (solo has no winner)
    win_rate: float  # legacy: wins / all games (diluted by solo)
    versus_played: int  # 1v1 games
    versus_won: int  # 1v1 wins
    versus_lost: int  # 1v1 losses (draws = played - won - lost)
    versus_win_rate: float  # 1v1 wins / 1v1 games
    solo_played: int  # solo runs
    total_score: int
    rank: int  # overall, by 1v1 wins
    bests: list[ProfileGame]
    recent: list[ProfileRecent]
    rivals: list[ProfileRival]
    badges: list[Badge]


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


class SplitCount(BaseModel):
    guest: int
    bluesky: int


class FunnelStat(BaseModel):
    filled: int  # 1v1 rooms that found an opponent and played
    expired: int  # 1v1 rooms that timed out with no opponent


class LabelCount(BaseModel):
    label: str
    count: int


class DeviceSplit(BaseModel):
    mobile: int
    desktop: int
    unknown: int


class ActiveUsers(BaseModel):
    dau: int  # distinct Bluesky members who played in the last 1 / 7 / 30 days
    wau: int
    mau: int


class RetentionSplit(BaseModel):
    new: int  # active in the last 7 days, first ever game also in that window
    returning: int  # active in the last 7 days and had played before


class TopPlayer(BaseModel):
    handle: str
    games: int  # all modes (1v1 + solo)
    versus_games: int  # 1v1 games
    solo: int  # solo runs
    wins: int  # 1v1 wins
    win_rate: float  # 1v1 wins / 1v1 games (0..1)


class GameBalance(BaseModel):
    game_type: str
    games: int  # total sessions
    versus: int  # 1v1 sessions
    solo: int
    decisive: int  # 1v1 sessions with a winner
    first_player_win_rate: float  # of decisive 1v1, how often player 1 won (0..1)
    draw_rate: float  # of 1v1, how often it tied (0..1)
    avg_score: float  # average player-1 score (a game's typical scale)


class AdminInsights(BaseModel):
    plays: SplitCount  # guest vs Bluesky share of all plays
    funnel: FunnelStat
    feedback_by_page: list[LabelCount]
    feedback_by_device: DeviceSplit
    # Retention is Bluesky-only: guest ids are fresh each session, so a guest can
    # never be "returning" and would inflate the counts.
    active: ActiveUsers
    retention: RetentionSplit
    top_players: list[TopPlayer]
    game_balance: list[GameBalance]


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
    resolved: bool


class AdminFeedbackResponse(BaseModel):
    total: int
    feedback: list[AdminFeedbackRow]


class FeedbackResolveRequest(BaseModel):
    resolved: bool


class RankingEntry(BaseModel):
    rank: int
    did: str
    handle: str
    display_name: str | None
    avatar_url: str | None
    games_won: int
    total_score: int


class RankingResponse(BaseModel):
    entries: list[RankingEntry]
