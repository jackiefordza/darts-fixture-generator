from datetime import date

from app.persistence import SQLiteRepository
from app.services import SeasonService


def test_persist_generate_reload_filter_and_validate(tmp_path) -> None:
    repository = SQLiteRepository(f"sqlite:///{tmp_path / 'fixtures.db'}")
    repository.migrate()
    service = SeasonService(repository)
    season = service.create_season("League", "2026", date(2026, 9, 2))
    burnaby = service.add("venue", season["id"], {"name": "Burnaby", "board_capacity": 2})
    for index, count in enumerate((4, 5, 6, 7), start=1):
        division = service.add(
            "division", season["id"], {"name": f"Division {index}", "position": index}
        )
        for team in range(count):
            venue = (
                burnaby
                if index <= 3 and team == 0
                else service.add(
                    "venue", season["id"], {"name": f"V{index}-{team}", "board_capacity": 1}
                )
            )
            service.add(
                "team",
                season["id"],
                {
                    "division_id": division["id"],
                    "name": f"T{index}-{team}",
                    "position": team + 1,
                    "venue_id": venue["id"],
                },
            )
    generated = service.generate(season["id"], seed=12)
    assert generated["success"]
    assert service.get_season(season["id"])["generation_seed"] == 12
    assert service.schedule(season["id"], week=1)
    assert service.schedule(
        season["id"], division_id=service.get_season(season["id"])["divisions"][0]["id"]
    )
    assert service.validate(season["id"])["is_valid"]


def test_referential_integrity_prevents_deleting_team_venue(tmp_path) -> None:
    repository = SQLiteRepository(f"sqlite:///{tmp_path / 'fixtures.db'}")
    repository.migrate()
    service = SeasonService(repository)
    season = service.create_season("League", "2026", date(2026, 9, 2))
    venue = service.add("venue", season["id"], {"name": "V", "board_capacity": 1})
    division = service.add("division", season["id"], {"name": "D", "position": 1})
    service.add(
        "team",
        season["id"],
        {"division_id": division["id"], "name": "T", "position": 1, "venue_id": venue["id"]},
    )
    try:
        service.delete("venue", venue["id"])
    except Exception as error:
        assert "referenced" in str(error)
    else:
        raise AssertionError("Venue deletion should be rejected")
