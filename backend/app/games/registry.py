"""Game registry — single source of truth mapping game_type -> instance."""
from __future__ import annotations

from app.games.base import BaseGame
from app.games.color_clash import ColorClash
from app.games.flag_rush import FlagRush
from app.games.geoguesss import GeoGuess
from app.games.outline_quiz import OutlineQuiz
from app.games.reaction_grid import ReactionGrid
from app.games.word_duel import WordDuel

_GAMES: dict[str, BaseGame] = {
    g.type: g
    for g in (
        GeoGuess(),
        ColorClash(),
        FlagRush(),
        OutlineQuiz(),
        WordDuel(),
        ReactionGrid(),
    )
}


def get_game(game_type: str) -> BaseGame | None:
    return _GAMES.get(game_type)


def all_games() -> list[BaseGame]:
    return list(_GAMES.values())


def is_valid(game_type: str) -> bool:
    return game_type in _GAMES
