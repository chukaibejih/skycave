"""Game registry - single source of truth mapping game_type -> instance.

Keep the tuple below in LAUNCH ORDER (oldest first, append new games at the
end): routers/games.py reverses it so the hub always leads with the newest game.
"""
from __future__ import annotations

from app.games.base import BaseGame
from app.games.clay import Clay
from app.games.color_clash import ColorClash
from app.games.connect4 import Connect4
from app.games.dots_boxes import DotsAndBoxes
from app.games.flag_rush import FlagRush
from app.games.geoguesss import GeoGuess
from app.games.mad_math import MadMath
from app.games.outline_quiz import OutlineQuiz
from app.games.reaction_grid import ReactionGrid
from app.games.tile_takeover import TileTakeover
from app.games.uno import Uno
from app.games.word_duel import WordDuel
from app.games.word_hunt import WordHunt

_GAMES: dict[str, BaseGame] = {
    g.type: g
    for g in (
        GeoGuess(),
        ColorClash(),
        FlagRush(),
        OutlineQuiz(),
        WordDuel(),
        ReactionGrid(),
        MadMath(),
        WordHunt(),
        TileTakeover(),
        Connect4(),
        DotsAndBoxes(),
        Clay(),
        Uno(),
    )
}


def get_game(game_type: str) -> BaseGame | None:
    return _GAMES.get(game_type)


def all_games() -> list[BaseGame]:
    return list(_GAMES.values())


def is_valid(game_type: str) -> bool:
    return game_type in _GAMES
