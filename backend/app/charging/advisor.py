from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)
from sqlalchemy.orm import Session

from app.ai.cost_monitor import get_cost_monitor
from app.ai.providers.together import TogetherAIProvider
from app.core.config import settings

from . import management, schemas


class _ChargePlanOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_battery_percent: int | None = Field(ge=20, le=100)
    area: str | None = Field(max_length=80)
    origin: str | None = Field(max_length=100)
    destination: str | None = Field(max_length=100)
    departure_time: str | None = Field(max_length=40)
    arrival_battery_percent: int | None = Field(ge=5, le=100)
    max_total_php: Decimal | None = Field(gt=0, le=100_000)
    priority: schemas.ChargePlanPriority

    @field_validator(
        "area",
        "origin",
        "destination",
        "departure_time",
        mode="before",
    )
    @classmethod
    def clean_area(cls, value: Any) -> str | None:
        if value is None:
            return None

        cleaned = " ".join(str(value).split()).strip(" ,.-")
        return cleaned or None


class _NetworkQuestionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: Literal["prioritize", "inspect", "unsupported"]
    location_name: str | None = Field(max_length=180)
    include_revenue: bool


@dataclass(frozen=True)
class _LocationSignal:
    location_id: str
    location_name: str
    total_ports: int
    unavailable_ports: int
    available_ports: int
    average_basis_sessions: int
    average_basis_is_network: bool
    average_charge: Decimal
    revenue_exposure: Decimal
    score: int
    reason: str
    action: str | None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_content(response: dict[str, Any]) -> str:
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""

    if not isinstance(content, str):
        return ""

    cleaned = content.strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(
            r"^```(?:json)?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s*```$", "", cleaned)

    return cleaned.strip()


def _normalized_numbers(text: str) -> set[str]:
    values: set[str] = set()

    for match in re.findall(r"\d+(?:\.\d+)?", text):
        normalized = match.lstrip("0") or "0"

        if "." in normalized:
            normalized = normalized.rstrip("0").rstrip(".")

        values.add(normalized)

    return values


def _plain_decimal(value: Any) -> str:
    return f"{Decimal(str(value)):.2f}".rstrip("0").rstrip(".")


def _normalized_phrase(value: str) -> str:
    return " ".join(value.casefold().split()).strip(" ,.-")


def _is_current_location(value: str | None) -> bool:
    if value is None:
        return False

    return bool(
        re.fullmatch(
            r"(?:from\s+)?(?:me|my location|current location|here|near me)",
            _normalized_phrase(value),
        )
    )


def _phrase_is_grounded(value: str | None, source: str) -> bool:
    return value is None or _normalized_phrase(value) in _normalized_phrase(source)


def _percent_is_grounded(
    value: int | None,
    source: str,
    *,
    arrival: bool,
) -> bool:
    if value is None:
        return True

    percent_mentions = list(
        re.finditer(r"(?<!\d)(\d{1,3})\s*(?:%|percent\b)", source, re.I)
    )
    if not any(int(match.group(1)) == value for match in percent_mentions):
        return False

    arrival_cues = re.compile(
        r"\b(arriv\w*|destination|reserve|remaining|left)\b",
        re.I,
    )
    target_cues = re.compile(
        r"\b(charge|charging|target|top\s*up|fill)\b",
        re.I,
    )
    current_cues = re.compile(
        r"\b(current|currently|now|battery\s+is|starting|start\w*)\b",
        re.I,
    )

    clauses = re.split(r"[,;.]|\b(?:and|but|then)\b", source, flags=re.I)

    for clause in clauses:
        clause_has_value = any(
            int(match.group(1)) == value
            for match in re.finditer(
                r"(?<!\d)(\d{1,3})\s*(?:%|percent\b)",
                clause,
                re.I,
            )
        )
        if not clause_has_value:
            continue

        if arrival and arrival_cues.search(clause):
            return True
        if (
            not arrival
            and target_cues.search(clause)
            and not arrival_cues.search(clause)
            and not current_cues.search(clause)
        ):
            return True

    return (
        not arrival
        and len(percent_mentions) == 1
        and not arrival_cues.search(source)
        and not current_cues.search(source)
    )


def _budget_is_grounded(value: Decimal | None, source: str) -> bool:
    if value is None:
        return True

    has_budget_cue = bool(
        re.search(
            r"(?:₱|\bphp\b|\bpesos?\b|\bbudget\b|\bunder\b|\bmax(?:imum)?\b|\bup to\b)",
            source,
            re.I,
        )
    )
    return has_budget_cue and _plain_decimal(value) in _normalized_numbers(
        source.replace(",", "")
    )


async def _record_usage(
    user_id: int,
    response: dict[str, Any],
    default_model: str,
) -> None:
    usage = response.get("usage", {})

    await get_cost_monitor().record_usage(
        user_id=user_id,
        provider="together",
        model=str(response.get("model", default_model)),
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
        request_id=response.get("id"),
    )


async def _provider_request(
    *,
    user_id: int,
    messages: list[dict[str, str]],
    response_schema: dict[str, Any],
    schema_name: str = "charge_plan",
    max_tokens: int = 200,
) -> dict[str, Any] | None:
    if not settings.TOGETHER_API_KEY:
        return None

    monitor = get_cost_monitor()
    allowed, _, _ = await monitor.check_quota(
        user_id,
        requested_tokens=max_tokens,
    )

    if not allowed:
        return None

    provider = TogetherAIProvider(
        api_key=settings.TOGETHER_API_KEY
    )
    response = await provider.chat_completion(
        messages,
        response_schema=response_schema,
        schema_name=schema_name,
        reasoning_enabled=False,
        temperature=0,
        max_tokens=max_tokens,
    )

    if "error" in response:
        return None

    await _record_usage(user_id, response, provider.model)

    try:
        finish_reason = response["choices"][0].get("finish_reason")
    except (KeyError, IndexError, TypeError):
        return None

    return None if finish_reason == "length" else response


async def parse_charge_plan(
    user_id: int,
    payload: schemas.ChargePlanIntentRequest,
) -> schemas.ChargePlanIntentRead:
    generated_at = _now()
    empty = {
        "target_battery_percent": None,
        "area": None,
        "origin": None,
        "destination": None,
        "departure_time": None,
        "arrival_battery_percent": None,
        "max_total_php": None,
        "priority": "balanced",
    }

    if not settings.TOGETHER_API_KEY:
        return schemas.ChargePlanIntentRead(
            status="unavailable",
            generated_at=generated_at,
            **empty,
        )

    response_schema = _ChargePlanOutput.model_json_schema()
    schema_text = json.dumps(response_schema, separators=(",", ":"))
    messages = [
        {
            "role": "system",
            "content": (
                "Extract a driver's charging preferences into structured filters. "
                "Understand concise Philippine English and common Metro Manila place "
                "names. Extract only what the driver explicitly asks for. "
                "target_battery_percent is only a stated charge-to target from 20 to "
                "100, otherwise null. area is only where the driver explicitly wants "
                "to charge, otherwise null. origin and destination describe an explicit "
                "trip such as 'BGC to Alabang'; do not copy the destination into area. "
                "For nearest or farthest requests from a named place, put that place "
                "in origin and leave destination null. "
                "Use null for origin when the driver says current location, here, or "
                "near me; never return 'me' as a place. departure_time copies the "
                "driver's time phrase exactly, such "
                "as '5:30 PM', otherwise null. arrival_battery_percent is only a stated "
                "minimum battery on arrival, otherwise null. Ignore a stated current "
                "battery because the app supplies it; never put current battery or an "
                "arrival reserve into target_battery_percent. For 'near me', 'nearby', "
                "or 'closest', set priority to nearest. For 'farthest', 'furthest', "
                "or 'most distant', set priority to farthest even when the request "
                "also says 'from me'. max_total_php is an explicit "
                "total peso budget, otherwise null. priority is fastest, cheapest, "
                "nearest, farthest, or balanced. "
                "Choose fastest for urgency or speed, cheapest for saving money, "
                "nearest for shortest distance, farthest for greatest distance, and "
                "balanced when no preference is stated. "
                "Do not choose a station, calculate a route or price, explain, advise, "
                "or add facts. Return JSON only. "
                f"Required response schema: {schema_text}"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {"request": payload.message},
                separators=(",", ":"),
            ),
        },
    ]
    response = await _provider_request(
        user_id=user_id,
        messages=messages,
        response_schema=response_schema,
    )

    if response is None:
        return schemas.ChargePlanIntentRead(
            status="unavailable",
            generated_at=generated_at,
            **empty,
        )

    try:
        parsed = _ChargePlanOutput.model_validate_json(
            _safe_content(response)
        )
        source = payload.message

        if not all(
            _phrase_is_grounded(value, source)
            for value in (
                parsed.area,
                parsed.origin,
                parsed.destination,
                parsed.departure_time,
            )
        ):
            raise ValueError("The plan introduced an unstated phrase")

        if not _percent_is_grounded(
            parsed.target_battery_percent,
            source,
            arrival=False,
        ):
            raise ValueError("The charge target was not grounded")

        if not _percent_is_grounded(
            parsed.arrival_battery_percent,
            source,
            arrival=True,
        ):
            raise ValueError("The arrival reserve was not grounded")

        if not _budget_is_grounded(parsed.max_total_php, source):
            raise ValueError("The budget was not grounded")
    except (ValidationError, ValueError):
        return schemas.ChargePlanIntentRead(
            status="unavailable",
            generated_at=generated_at,
            **empty,
        )

    origin = None if _is_current_location(parsed.origin) else parsed.origin

    has_constraint = any(
        value is not None
        for value in (
            parsed.target_battery_percent,
            parsed.area,
            origin,
            parsed.destination,
            parsed.departure_time,
            parsed.arrival_battery_percent,
            parsed.max_total_php,
        )
    ) or parsed.priority != "balanced"

    return schemas.ChargePlanIntentRead(
        status="answered" if has_constraint else "insufficient_data",
        target_battery_percent=parsed.target_battery_percent,
        area=parsed.area,
        origin=origin,
        destination=parsed.destination,
        departure_time=parsed.departure_time,
        arrival_battery_percent=parsed.arrival_battery_percent,
        max_total_php=parsed.max_total_php,
        priority=parsed.priority,
        generated_at=generated_at,
    )


def _money(value: Decimal, currency: str) -> str:
    amount = value.quantize(Decimal("0.01"))
    prefix = "₱" if currency.upper() == "PHP" else f"{currency.upper()} "
    return f"{prefix}{amount:,.2f}".replace(".00", "")


def _mentioned_location_name(
    workspace: schemas.ManagementWorkspaceRead,
    question: str,
) -> str | None:
    question_text = question.casefold()
    question_tokens = set(re.findall(r"[a-z0-9]+", question_text))
    ignored = {
        "station",
        "center",
        "centre",
        "charger",
        "charging",
        "road",
        "hub",
        "bay",
    }
    matches: list[tuple[int, int, str]] = []

    for location in workspace.locations:
        aliases = [
            location.name,
            *(charger.display_name for charger in location.chargers),
        ]

        for alias in aliases:
            alias_text = alias.casefold()
            alias_tokens = {
                token
                for token in re.findall(r"[a-z0-9]+", alias_text)
                if len(token) >= 3 and token not in ignored
            }
            overlap = alias_tokens & question_tokens

            if alias_text in question_text or overlap:
                matches.append(
                    (
                        len(overlap),
                        max((len(token) for token in overlap), default=0),
                        location.name,
                    )
                )

    return max(matches)[2] if matches else None


def _network_signals(
    workspace: schemas.ManagementWorkspaceRead,
) -> list[_LocationSignal]:
    completed_network = [
        session
        for session in workspace.recent_sessions
        if session.status == "completed"
    ]
    network_average = (
        sum(
            (Decimal(str(session.total_amount)) for session in completed_network),
            Decimal("0"),
        )
        / len(completed_network)
        if completed_network
        else Decimal("0")
    )
    signals: list[_LocationSignal] = []

    for location in workspace.locations:
        sessions = [
            session
            for session in workspace.recent_sessions
            if session.station_name == location.name
        ]
        completed = [session for session in sessions if session.status == "completed"]
        failed_count = sum(1 for session in sessions if session.status == "failed")
        location_average = (
            sum(
                (Decimal(str(session.total_amount)) for session in completed),
                Decimal("0"),
            )
            / len(completed)
            if completed
            else network_average
        )
        average_basis_sessions = len(completed) or len(completed_network)

        all_connectors = [
            connector
            for charger in location.chargers
            for connector in charger.connectors
        ]
        unavailable_ids: set[str] = set()
        maintenance_names: list[str] = []
        offline_names: list[str] = []
        pending_names: list[str] = []

        if location.status != "active":
            unavailable_ids.update(connector.id for connector in all_connectors)

        for charger in location.chargers:
            if charger.connection_status != "online":
                unavailable_ids.update(
                    connector.id for connector in charger.connectors
                )
                if charger.connection_status == "maintenance":
                    maintenance_names.append(charger.display_name)
                elif charger.connection_status == "offline":
                    offline_names.append(charger.display_name)
                elif charger.connection_status == "pending":
                    pending_names.append(charger.display_name)
                continue

            unavailable_ids.update(
                connector.id
                for connector in charger.connectors
                if connector.status == "offline"
            )

        unavailable_count = len(unavailable_ids)
        available_count = sum(
            1
            for charger in location.chargers
            for connector in charger.connectors
            if (
                location.status == "active"
                and charger.connection_status == "online"
                and connector.status == "available"
            )
        )
        score = unavailable_count * 20 + failed_count * 5

        if location.status == "offline":
            score += 100
            reason = f"{location.name} is offline, leaving {unavailable_count} plugs unavailable."
            action = "Confirm the site is ready, then bring it online."
        elif location.status == "draft":
            score += 15
            reason = f"{location.name} is not yet live."
            action = "Finish charger setup, then publish the station."
        elif maintenance_names:
            score += 60
            charger_name = maintenance_names[0]
            reason = f"{charger_name} is under maintenance, leaving {unavailable_count} plugs unavailable."
            action = f"Confirm the maintenance end time, then return {charger_name} online."
        elif offline_names:
            score += 50
            charger_name = offline_names[0]
            reason = f"{charger_name} is offline, leaving {unavailable_count} plugs unavailable."
            action = f"Check the connection, then return {charger_name} online."
        elif pending_names:
            score += 20
            charger_name = pending_names[0]
            reason = f"{charger_name} has not connected yet."
            action = f"Complete the connection check for {charger_name}."
        elif unavailable_count:
            noun = "plug is" if unavailable_count == 1 else "plugs are"
            reason = f"{unavailable_count} {noun} offline at {location.name}."
            action = "Inspect the affected plugs, then return them online."
        elif failed_count:
            reason = f"{location.name} has {failed_count} recent failed charge{'s' if failed_count != 1 else ''}."
            action = "Review the latest failed charge before the next driver arrives."
        else:
            reason = "No immediate operating issue is visible in the current data."
            action = None

        exposure = (location_average * unavailable_count).quantize(
            Decimal("0.01")
        )
        signals.append(
            _LocationSignal(
                location_id=location.id,
                location_name=location.name,
                total_ports=len(all_connectors),
                unavailable_ports=unavailable_count,
                available_ports=available_count,
                average_basis_sessions=average_basis_sessions,
                average_basis_is_network=not completed and bool(completed_network),
                average_charge=location_average.quantize(Decimal("0.01")),
                revenue_exposure=exposure,
                score=score,
                reason=reason,
                action=action,
            )
        )

    return signals


async def answer_network_question(
    db: Session,
    user_id: int,
    network_id: str,
    payload: schemas.NetworkQuestionRequest,
) -> schemas.NetworkAnswerRead:
    generated_at = _now()
    workspace = management.get_management_workspace(db, user_id, network_id)

    if not settings.TOGETHER_API_KEY:
        return schemas.NetworkAnswerRead(
            status="unavailable",
            headline="Network AI is unavailable",
            reason="Try again after Together AI is connected.",
            generated_at=generated_at,
        )

    station_context = [
        {
            "name": location.name,
            "city": location.city,
            "chargers": [
                charger.display_name
                for charger in location.chargers
            ],
        }
        for location in workspace.locations
    ]
    response_schema = _NetworkQuestionOutput.model_json_schema()
    messages = [
        {
            "role": "system",
            "content": (
                "Classify one charging-network owner's question. "
                "Use prioritize for broad, natural questions about what to handle, "
                "how the network is doing, operating problems, or revenue at risk. "
                "Use inspect when they refer to a station, its city, or one of its "
                "chargers. Return the parent station's exact name only when the "
                "reference is unambiguous. "
                "Use unsupported only for anything "
                "outside station priority, operating status, and revenue exposure. "
                "Set location_name to an exact name from the supplied list only when "
                "the owner refers to that station; otherwise null. Set include_revenue "
                "true only for questions about revenue, loss, money, financial impact, "
                "or risk. Do not answer, diagnose, calculate, or add facts. Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "question": payload.message,
                    "stations": station_context,
                },
                separators=(",", ":"),
            ),
        },
    ]
    response = await _provider_request(
        user_id=user_id,
        messages=messages,
        response_schema=response_schema,
        schema_name="network_question",
        max_tokens=100,
    )

    if response is None:
        return schemas.NetworkAnswerRead(
            status="unavailable",
            headline="Network AI is unavailable",
            reason="Try again in a moment.",
            generated_at=generated_at,
        )

    try:
        parsed = _NetworkQuestionOutput.model_validate_json(
            _safe_content(response)
        )
    except ValidationError:
        return schemas.NetworkAnswerRead(
            status="unavailable",
            headline="Network AI is unavailable",
            reason="Try asking again in a shorter sentence.",
            generated_at=generated_at,
        )

    signal_by_name = {
        signal.location_name.casefold(): signal
        for signal in _network_signals(workspace)
    }
    mentioned_location = _mentioned_location_name(
        workspace,
        payload.message,
    )
    resolved_location = mentioned_location or (
        parsed.location_name
        if parsed.location_name
        and parsed.location_name.casefold() in signal_by_name
        else None
    )
    selected = (
        signal_by_name.get(resolved_location.casefold())
        if resolved_location
        else None
    )

    if selected is None and signal_by_name:
        selected = max(
            signal_by_name.values(),
            key=lambda signal: (
                signal.score,
                signal.revenue_exposure,
                signal.unavailable_ports,
                signal.location_name,
            ),
        )

    if selected is None:
        return schemas.NetworkAnswerRead(
            status="insufficient_data",
            headline="No stations to compare",
            reason="Add a station before asking the network.",
            generated_at=generated_at,
        )

    if selected.score <= 0:
        return schemas.NetworkAnswerRead(
            status="answered",
            headline="No station needs immediate attention",
            reason="No offline stations, chargers, or plugs appear in the current data.",
            evidence=[f"{sum(item.available_ports for item in signal_by_name.values())} plugs ready"],
            generated_at=generated_at,
        )

    evidence = [
        (
            f"{selected.unavailable_ports} of {selected.total_ports} plugs unavailable"
            if selected.total_ports
            else "No plugs configured"
        )
    ]
    include_revenue = parsed.include_revenue or bool(
        re.search(
            r"\b(revenue|loss|money|financial|impact|risk|earnings?)\b|₱|\bphp\b",
            payload.message,
            re.I,
        )
    )
    if include_revenue:
        if selected.unavailable_ports == 0:
            evidence.append("No offline-port revenue exposure identified")
        elif selected.average_basis_sessions and selected.average_charge > 0:
            evidence.extend(
                [
                    f"About {_money(selected.revenue_exposure, workspace.network.currency_code)} exposed per missed cycle",
                    (
                        f"Based on {selected.average_basis_sessions} completed charges across the network"
                        if selected.average_basis_is_network
                        else f"Based on {selected.average_basis_sessions} completed charges at this station"
                    ),
                ]
            )
        else:
            evidence.append("No completed-charge history for an exposure estimate")

    return schemas.NetworkAnswerRead(
        status="answered",
        headline=(
            f"{selected.location_name} needs attention first"
            if not resolved_location
            else selected.location_name
        ),
        reason=selected.reason,
        action=selected.action,
        evidence=evidence,
        location_id=selected.location_id,
        location_name=selected.location_name,
        generated_at=generated_at,
    )
