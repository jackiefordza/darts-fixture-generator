"""HTTP boundary for season management."""

from dataclasses import asdict
from datetime import date
from os import getenv

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.domain import CalendarEventType
from app.persistence import SQLiteRepository
from app.services.seasons import ConflictError, ExportValidationError, NotFoundError, SeasonService


def health_check() -> dict[str, str]:
    """Return a minimal status response for local and deployment checks."""
    return {"status": "ok"}


class SeasonInput(BaseModel):
    league_name: str | None = None
    name: str | None = None
    first_fixture_date: date | None = None
    cadence_days: int | None = Field(default=None, ge=1)


class DivisionInput(BaseModel):
    name: str
    position: int = Field(ge=1)


class VenueInput(BaseModel):
    name: str
    board_capacity: int = Field(ge=1)


class TeamInput(BaseModel):
    division_id: str
    name: str
    position: int = Field(ge=1)
    venue_id: str


class EventInput(BaseModel):
    name: str
    start_date: date
    end_date: date | None = None
    event_type: CalendarEventType
    blocks_initial_generation: bool
    appears_on_poster: bool = False


def create_app(database_url: str | None = None) -> FastAPI:
    repository = SQLiteRepository(
        database_url or getenv("FIXTURE_GENERATOR_DATABASE_URL", "sqlite:///fixture_generator.db")
    )
    repository.migrate()
    service = SeasonService(repository)
    app = FastAPI(title="Fixture Generator API", version="0.2.0")

    def svc() -> SeasonService:
        return service

    def call(callback):
        try:
            return callback()
        except NotFoundError as error:
            raise HTTPException(404, str(error)) from error
        except ConflictError as error:
            raise HTTPException(409, str(error)) from error
        except ExportValidationError as error:
            raise HTTPException(
                409,
                {
                    "message": str(error),
                    "issues": [asdict(issue) for issue in error.validation.issues],
                },
            ) from error
        except (ValueError, KeyError) as error:
            raise HTTPException(422, str(error)) from error

    app.get("/health", tags=["health"])(health_check)

    @app.post("/seasons", status_code=201)
    def create_season(payload: SeasonInput, service: SeasonService = Depends(svc)):
        values = payload.model_dump()
        if any(values[key] is None for key in ("league_name", "name", "first_fixture_date")):
            raise HTTPException(422, "league_name, name, and first_fixture_date are required")
        values["cadence_days"] = values["cadence_days"] or 7
        return call(lambda: service.create_season(**values))

    @app.get("/seasons")
    def list_seasons(service: SeasonService = Depends(svc)):
        return service.list_seasons()

    @app.get("/seasons/{season_id}")
    def get_season(season_id: str, service: SeasonService = Depends(svc)):
        return call(lambda: service.get_season(season_id))

    @app.patch("/seasons/{season_id}")
    def update_season(season_id: str, payload: SeasonInput, service: SeasonService = Depends(svc)):
        return call(
            lambda: service.update_season(season_id, payload.model_dump(exclude_unset=True))
        )

    def route_entities(kind: str, model) -> None:
        plural = f"{kind}s"

        @app.post(f"/seasons/{{season_id}}/{plural}", status_code=201)
        def create(season_id: str, payload: model, service: SeasonService = Depends(svc)):
            return call(lambda: service.add(kind, season_id, payload.model_dump()))

        @app.patch(f"/{plural}/{{entity_id}}")
        def update(entity_id: str, payload: model, service: SeasonService = Depends(svc)):
            return call(
                lambda: service.update(kind, entity_id, payload.model_dump(exclude_unset=True))
            )

        @app.delete(f"/{plural}/{{entity_id}}", status_code=204)
        def delete(entity_id: str, service: SeasonService = Depends(svc)):
            call(lambda: service.delete(kind, entity_id))

    route_entities("division", DivisionInput)
    route_entities("venue", VenueInput)
    route_entities("team", TeamInput)
    route_entities("event", EventInput)

    @app.post("/seasons/{season_id}/generate")
    def generate(season_id: str, seed: int | None = None, service: SeasonService = Depends(svc)):
        return call(lambda: service.generate(season_id, seed))

    @app.get("/seasons/{season_id}/fixtures")
    def fixtures(
        season_id: str,
        division_id: str | None = None,
        week: int | None = Query(default=None, ge=1),
        fixture_date: date | None = None,
        service: SeasonService = Depends(svc),
    ):
        return call(lambda: service.schedule(season_id, division_id, week, fixture_date))

    @app.post("/seasons/{season_id}/validate")
    def validate(season_id: str, service: SeasonService = Depends(svc)):
        return call(lambda: service.validate(season_id))

    def csv_response(csv_text: str, filename: str) -> Response:
        return Response(
            content=csv_text,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.get("/seasons/{season_id}/fixtures.csv")
    def export_season_csv(season_id: str, service: SeasonService = Depends(svc)):
        csv_text = call(lambda: service.export_csv(season_id))
        return csv_response(csv_text, f"season-{season_id}-fixtures.csv")

    @app.get("/seasons/{season_id}/divisions/{division_id}/fixtures.csv")
    def export_division_csv(
        season_id: str, division_id: str, service: SeasonService = Depends(svc)
    ):
        csv_text = call(lambda: service.export_csv(season_id, division_id))
        return csv_response(csv_text, f"season-{season_id}-division-{division_id}-fixtures.csv")

    return app


app = create_app()
