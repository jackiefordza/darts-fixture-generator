"""Typed domain models for the fixture-generation engine."""

from .models import (
    CalendarEvent,
    CalendarEventType,
    Division,
    Fixture,
    GenerationConfig,
    GenerationResult,
    GenerationStatistics,
    RescheduleEntry,
    Season,
    SoftPreferenceWeights,
    Team,
    ValidationIssue,
    ValidationResult,
    Venue,
)

__all__ = [
    "CalendarEvent",
    "CalendarEventType",
    "Division",
    "Fixture",
    "GenerationConfig",
    "GenerationResult",
    "GenerationStatistics",
    "RescheduleEntry",
    "Season",
    "SoftPreferenceWeights",
    "Team",
    "ValidationIssue",
    "ValidationResult",
    "Venue",
]
