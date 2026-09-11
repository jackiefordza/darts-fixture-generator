"""Randomised circle-method round-robin pairing generation."""

from __future__ import annotations

from dataclasses import dataclass
from random import Random

from app.domain import Division

Pair = tuple[str, str]


@dataclass(frozen=True, slots=True)
class DivisionPairings:
    division_id: str
    first_half_rounds: tuple[tuple[Pair, ...], ...]

    @property
    def rounds_per_half(self) -> int:
        return len(self.first_half_rounds)


class RoundRobinPairingGenerator:
    """Creates unique round structures by shuffling the circle-method slots first."""

    bye_slot = "__BYE__"

    def generate(self, division: Division, random: Random) -> DivisionPairings:
        team_ids = [team.id for team in division.teams]
        if len(team_ids) < 2:
            raise ValueError(f"Division {division.id} needs at least two teams")
        if len(team_ids) % 2:
            team_ids.append(self.bye_slot)
        random.shuffle(team_ids)

        rounds: list[tuple[Pair, ...]] = []
        slots = team_ids[:]
        for _ in range(len(slots) - 1):
            pairs = tuple((slots[index], slots[-1 - index]) for index in range(len(slots) // 2))
            rounds.append(pairs)
            slots = [slots[0], slots[-1], *slots[1:-1]]
        return DivisionPairings(division_id=division.id, first_half_rounds=tuple(rounds))
