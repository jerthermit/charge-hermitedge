from __future__ import annotations

import uuid
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas
from .service import (
    ACTIVE_STATUSES,
    ChargingServiceError,
    _connector_context,
    _as_utc,
    _decimal,
    _energy,
    _estimate,
    _fail,
    _money,
    _now,
    _session_read,
    _vehicle,
)


def _owned_session(
    db: Session,
    user_id: int,
    session_id: str,
) -> models.ChargingSession:
    session = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.id == session_id,
            models.ChargingSession.user_id == user_id,
        )
        .first()
    )

    if session is None:
        _fail(
            404,
            "session_not_found",
            "Charging session not found",
        )

    return session


def _command_exists(
    db: Session,
    session_id: str,
    idempotency_key: str,
) -> bool:
    return (
        db.query(models.ChargingSessionEvent.id)
        .filter(
            models.ChargingSessionEvent.session_id == session_id,
            models.ChargingSessionEvent.idempotency_key
            == idempotency_key,
        )
        .first()
        is not None
    )


def _connector_holder(
    db: Session,
    connector_id: str,
) -> models.ChargingSession | None:
    return (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.connector_id == connector_id,
            models.ChargingSession.status.in_(
                ACTIVE_STATUSES,
            ),
        )
        .order_by(
            models.ChargingSession.created_at.asc(),
        )
        .first()
    )


def _move_connector(
    db: Session,
    connector: models.ChargerConnector,
    current_status: str,
    next_status: str,
) -> None:
    changed = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id == connector.id,
            models.ChargerConnector.status == current_status,
            models.ChargerConnector.version
            == connector.version,
        )
        .update(
            {
                models.ChargerConnector.status: next_status,
                models.ChargerConnector.version:
                    connector.version + 1,
            },
            synchronize_session=False,
        )
    )

    if changed != 1:
        db.rollback()
        _fail(
            409,
            "connector_changed",
            "Connector data changed; refresh and try again",
        )


def _commit_command(
    db: Session,
    user_id: int,
    session_id: str,
    idempotency_key: str,
) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()

        session = (
            db.query(models.ChargingSession)
            .filter(
                models.ChargingSession.id == session_id,
                models.ChargingSession.user_id == user_id,
            )
            .first()
        )

        if (
            session
            and _command_exists(
                db,
                session.id,
                idempotency_key,
            )
        ):
            return

        raise ChargingServiceError(
            409,
            "session_conflict",
            "The session could not be updated",
        ) from exc


def _synthetic_progress(
    session: models.ChargingSession,
    ready_event: models.ChargingSessionEvent,
    now,
) -> tuple[Decimal, Decimal, Decimal, str]:
    detail = ready_event.detail or {}

    try:
        estimated_energy = _energy(
            _decimal(detail["estimated_energy_kwh"])
        )
    except (KeyError, TypeError, ValueError):
        _fail(
            409,
            "progress_data_missing",
            "The original charge estimate is incomplete",
        )

    if estimated_energy <= 0:
        _fail(
            409,
            "progress_data_invalid",
            "The original charge estimate is invalid",
        )

    try:
        effective_power = _decimal(
            detail["effective_power_kw"]
        )
    except (KeyError, TypeError, ValueError):
        try:
            estimated_minutes = _decimal(
                detail["estimated_minutes"]
            )
            effective_power = (
                estimated_energy
                * Decimal("60")
                / estimated_minutes
            )
        except (
            KeyError,
            TypeError,
            ValueError,
            ArithmeticError,
        ):
            _fail(
                409,
                "progress_data_missing",
                "Charging progress data is incomplete",
            )

    if effective_power <= 0:
        _fail(
            409,
            "progress_data_invalid",
            "Charging progress data is invalid",
        )

    stored_energy = max(
        Decimal("0"),
        min(
            estimated_energy,
            _energy(_decimal(session.energy_kwh)),
        ),
    )
    anchor = _as_utc(
        session.updated_at
        if stored_energy > 0
        else session.started_at
    )

    if anchor is None:
        _fail(
            409,
            "progress_data_missing",
            "The charging start time is missing",
        )

    elapsed_seconds = Decimal(
        str(max(0.0, (now - anchor).total_seconds()))
    )
    delivered_energy = _energy(
        min(
            estimated_energy,
            stored_energy
            + effective_power
            * elapsed_seconds
            / Decimal("3600"),
        )
    )
    total_amount = _money(
        delivered_energy
        * _decimal(session.unit_price_per_kwh)
    )
    completion_reason = (
        "target_reached"
        if delivered_energy >= estimated_energy
        else "driver_stopped"
    )

    return (
        delivered_energy,
        total_amount,
        estimated_energy,
        completion_reason,
    )


def create_session(
    db: Session,
    user_id: int,
    payload: schemas.SessionStartRequest,
) -> schemas.ChargingSessionRead:
    existing = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.idempotency_key
            == payload.idempotency_key,
        )
        .first()
    )

    if existing:
        return _session_read(db, existing)

    active_session = (
        db.query(models.ChargingSession.id)
        .filter(
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.status.in_(
                ACTIVE_STATUSES,
            ),
        )
        .first()
    )

    if active_session:
        _fail(
            409,
            "active_session_exists",
            "Finish the current charge first",
        )

    vehicle = _vehicle(
        db,
        user_id,
        payload.vehicle_profile_id,
    )

    connector, charger, location, network = (
        _connector_context(
            db,
            payload.connector_id,
        )
    )

    if (
        network.status != "active"
        or location.status != "active"
        or not location.is_public
    ):
        _fail(
            409,
            "station_unavailable",
            "This station is not accepting sessions",
        )

    if charger.connection_status != "online":
        _fail(
            409,
            "charger_offline",
            "This charger went offline. Choose another available charger.",
        )

    if (
        connector.status != "available"
        or connector.version
        != payload.connector_version
    ):
        _fail(
            409,
            "connector_unavailable",
            "This connector was just taken or changed. Choose another available connector.",
        )

    (
        energy,
        power,
        minutes,
        total,
    ) = _estimate(
        vehicle,
        connector,
        payload.target_battery_percent,
    )

    _move_connector(
        db,
        connector,
        "available",
        "reserved",
    )

    now = _now()

    session = models.ChargingSession(
        user_id=user_id,
        vehicle_profile_id=vehicle.id,
        connector_id=connector.id,
        status="ready",
        idempotency_key=payload.idempotency_key,
        station_name_snapshot=location.name,
        connector_type_snapshot=connector.connector_type,
        currency_code=network.currency_code,
        unit_price_per_kwh=connector.price_per_kwh,
        start_battery_percent=vehicle.battery_percent,
        target_battery_percent=(
            payload.target_battery_percent
        ),
        energy_kwh=Decimal("0.000"),
        total_amount=Decimal("0.00"),
        version=1,
        authorized_at=now,
    )

    try:
        db.add(session)
        db.flush()

        payment = models.ChargingPayment(
            session_id=session.id,
            created_by_user_id=user_id,
            provider="sandbox",
            method=payload.payment_method,
            status="authorized",
            currency_code=network.currency_code,
            amount=total,
            provider_reference=(
                f"sbx_{uuid.uuid4().hex[:18]}"
            ),
            idempotency_key=payload.idempotency_key,
        )

        event = models.ChargingSessionEvent(
            session_id=session.id,
            version=1,
            actor_user_id=user_id,
            event_type="session_ready",
            idempotency_key=payload.idempotency_key,
            detail={
                "source": "synthetic",
                "estimated_energy_kwh": str(energy),
                "effective_power_kw": str(power),
                "estimated_minutes": minutes,
                "estimated_total": str(total),
            },
        )

        db.add_all([payment, event])
        db.commit()

    except IntegrityError as exc:
        db.rollback()

        existing = (
            db.query(models.ChargingSession)
            .filter(
                models.ChargingSession.user_id
                == user_id,
                models.ChargingSession.idempotency_key
                == payload.idempotency_key,
            )
            .first()
        )

        if existing:
            return _session_read(db, existing)

        raise ChargingServiceError(
            409,
            "session_conflict",
            "The session could not be created",
        ) from exc

    db.refresh(session)
    return _session_read(db, session)


def begin_session(
    db: Session,
    user_id: int,
    session_id: str,
    payload: schemas.SessionCommandRequest,
) -> schemas.ChargingSessionRead:
    session = _owned_session(
        db,
        user_id,
        session_id,
    )

    if _command_exists(
        db,
        session.id,
        payload.idempotency_key,
    ):
        return _session_read(db, session)

    if (
        session.version != payload.expected_version
        or session.status != "ready"
    ):
        _fail(
            409,
            "session_changed",
            "This session is no longer ready",
        )

    holder = _connector_holder(
        db,
        session.connector_id,
    )

    if holder is None or holder.id != session.id:
        _fail(
            409,
            "reservation_lost",
            "Connector reservation was lost",
        )

    payment = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id
            == session.id,
        )
        .first()
    )

    connector = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == session.connector_id,
        )
        .first()
    )

    if (
        payment is None
        or payment.provider != "sandbox"
        or payment.status != "authorized"
    ):
        _fail(
            409,
            "payment_not_authorized",
            "Payment authorization is required",
        )

    if connector is None:
        _fail(
            409,
            "connector_missing",
            "Connector record is missing",
        )

    now = _now()
    next_version = session.version + 1

    changed = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.id == session.id,
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.status == "ready",
            models.ChargingSession.version
            == payload.expected_version,
        )
        .update(
            {
                models.ChargingSession.status:
                    "charging",
                models.ChargingSession.version:
                    next_version,
                models.ChargingSession.started_at:
                    now,
                models.ChargingSession.meter_start_wh:
                    0,
            },
            synchronize_session=False,
        )
    )

    if changed != 1:
        db.rollback()
        _fail(
            409,
            "session_changed",
            "Session data changed; refresh and try again",
        )

    _move_connector(
        db,
        connector,
        "reserved",
        "charging",
    )

    db.add(
        models.ChargingSessionEvent(
            session_id=session.id,
            version=next_version,
            actor_user_id=user_id,
            event_type="charging_started",
            idempotency_key=(
                payload.idempotency_key
            ),
            detail={"source": "synthetic"},
        )
    )

    _commit_command(
        db,
        user_id,
        session.id,
        payload.idempotency_key,
    )

    updated = _owned_session(
        db,
        user_id,
        session.id,
    )

    return _session_read(db, updated)


def complete_synthetic_session(
    db: Session,
    user_id: int,
    session_id: str,
    payload: schemas.SessionCommandRequest,
) -> schemas.ChargingSessionRead:
    session = _owned_session(
        db,
        user_id,
        session_id,
    )

    if _command_exists(
        db,
        session.id,
        payload.idempotency_key,
    ):
        return _session_read(db, session)

    if (
        session.version != payload.expected_version
        or session.status != "charging"
    ):
        _fail(
            409,
            "session_changed",
            "This session is no longer charging",
        )

    holder = _connector_holder(
        db,
        session.connector_id,
    )

    if holder is None or holder.id != session.id:
        _fail(
            409,
            "session_mismatch",
            "Connector session does not match",
        )

    first_event = (
        db.query(models.ChargingSessionEvent)
        .filter(
            models.ChargingSessionEvent.session_id
            == session.id,
            models.ChargingSessionEvent.event_type
            == "session_ready",
        )
        .first()
    )

    if (
        first_event is None
        or "estimated_energy_kwh"
        not in first_event.detail
    ):
        _fail(
            409,
            "estimate_missing",
            "The original session estimate is missing",
        )

    now = _now()
    (
        delivered_energy,
        total_amount,
        estimated_energy,
        completion_reason,
    ) = _synthetic_progress(
        session,
        first_event,
        now,
    )

    connector = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == session.connector_id,
        )
        .first()
    )

    payment = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id
            == session.id,
        )
        .first()
    )

    if connector is None:
        _fail(
            409,
            "connector_missing",
            "Connector record is missing",
        )

    if (
        payment is None
        or payment.provider != "sandbox"
        or payment.status != "authorized"
    ):
        _fail(
            409,
            "payment_not_authorized",
            "Payment authorization is required",
        )

    next_version = session.version + 1

    changed = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.id == session.id,
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.status
            == "charging",
            models.ChargingSession.version
            == payload.expected_version,
        )
        .update(
            {
                models.ChargingSession.status:
                    "completed",
                models.ChargingSession.version:
                    next_version,
                models.ChargingSession.energy_kwh:
                    delivered_energy,
                models.ChargingSession.total_amount:
                    total_amount,
                models.ChargingSession.meter_end_wh:
                    (session.meter_start_wh or 0)
                    + int(delivered_energy * 1000),
                models.ChargingSession.completed_at:
                    now,
            },
            synchronize_session=False,
        )
    )

    if changed != 1:
        db.rollback()
        _fail(
            409,
            "session_changed",
            "Session data changed; refresh and try again",
        )

    _move_connector(
        db,
        connector,
        "charging",
        "available",
    )

    payment.status = "captured"
    payment.amount = total_amount
    payment.captured_at = now

    actual_battery = None

    if (
        session.vehicle_profile_id
        and session.start_battery_percent is not None
        and session.target_battery_percent
        is not None
    ):
        vehicle = _vehicle(
            db,
            user_id,
            session.vehicle_profile_id,
        )
        start_battery = _decimal(
            session.start_battery_percent
        )
        target_battery = _decimal(
            session.target_battery_percent
        )
        actual_battery = min(
            target_battery,
            start_battery
            + (target_battery - start_battery)
            * delivered_energy
            / estimated_energy,
        ).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        vehicle.battery_percent = actual_battery
        vehicle.battery_source = "manual"
        vehicle.battery_updated_at = now

    completion_detail = {
        "source": "synthetic",
        "completion_reason": completion_reason,
        "energy_kwh": str(delivered_energy),
        "total_amount": str(total_amount),
    }

    if actual_battery is not None:
        completion_detail["battery_percent"] = str(
            actual_battery
        )

    db.add(
        models.ChargingSessionEvent(
            session_id=session.id,
            version=next_version,
            actor_user_id=user_id,
            event_type="charging_completed",
            idempotency_key=(
                payload.idempotency_key
            ),
            detail=completion_detail,
        )
    )

    _commit_command(
        db,
        user_id,
        session.id,
        payload.idempotency_key,
    )

    updated = _owned_session(
        db,
        user_id,
        session.id,
    )

    return _session_read(db, updated)


def cancel_session(
    db: Session,
    user_id: int,
    session_id: str,
    payload: schemas.SessionCommandRequest,
) -> schemas.ChargingSessionRead:
    session = _owned_session(
        db,
        user_id,
        session_id,
    )

    if _command_exists(
        db,
        session.id,
        payload.idempotency_key,
    ):
        return _session_read(db, session)

    if (
        session.version != payload.expected_version
        or session.status
        not in ("payment_pending", "ready")
    ):
        _fail(
            409,
            "session_changed",
            "This session can no longer be cancelled",
        )

    holder = _connector_holder(
        db,
        session.connector_id,
    )

    if holder is None or holder.id != session.id:
        _fail(
            409,
            "reservation_lost",
            "Connector reservation was lost",
        )

    connector = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == session.connector_id,
        )
        .first()
    )

    if connector is None:
        _fail(
            409,
            "connector_missing",
            "Connector record is missing",
        )

    next_version = session.version + 1

    changed = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.id == session.id,
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.status.in_(
                ("payment_pending", "ready")
            ),
            models.ChargingSession.version
            == payload.expected_version,
        )
        .update(
            {
                models.ChargingSession.status:
                    "cancelled",
                models.ChargingSession.version:
                    next_version,
            },
            synchronize_session=False,
        )
    )

    if changed != 1:
        db.rollback()
        _fail(
            409,
            "session_changed",
            "Session data changed; refresh and try again",
        )

    _move_connector(
        db,
        connector,
        "reserved",
        "available",
    )

    payment = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id
            == session.id,
        )
        .first()
    )

    if (
        payment
        and payment.provider == "sandbox"
        and payment.status == "authorized"
    ):
        payment.status = "refunded"

    db.add(
        models.ChargingSessionEvent(
            session_id=session.id,
            version=next_version,
            actor_user_id=user_id,
            event_type="session_cancelled",
            idempotency_key=(
                payload.idempotency_key
            ),
            detail={"source": "synthetic"},
        )
    )

    _commit_command(
        db,
        user_id,
        session.id,
        payload.idempotency_key,
    )

    updated = _owned_session(
        db,
        user_id,
        session.id,
    )

    return _session_read(db, updated)


def get_session(
    db: Session,
    user_id: int,
    session_id: str,
) -> schemas.ChargingSessionRead:
    session = _owned_session(
        db,
        user_id,
        session_id,
    )

    return _session_read(db, session)


def list_sessions(
    db: Session,
    user_id: int,
    limit: int = 50,
) -> list[schemas.ChargingSessionRead]:
    sessions = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.user_id == user_id,
        )
        .order_by(
            models.ChargingSession.created_at.desc(),
        )
        .limit(max(1, min(limit, 100)))
        .all()
    )

    return [
        _session_read(db, session)
        for session in sessions
    ]


def get_receipt(
    db: Session,
    user_id: int,
    session_id: str,
) -> schemas.ReceiptRead:
    session = _owned_session(
        db,
        user_id,
        session_id,
    )

    if (
        session.status != "completed"
        or session.started_at is None
        or session.completed_at is None
    ):
        _fail(
            409,
            "receipt_unavailable",
            "Receipt is available after charging completes",
        )

    payment = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id
            == session.id,
            models.ChargingPayment.status
            == "captured",
        )
        .first()
    )

    if payment is None:
        _fail(
            409,
            "payment_incomplete",
            "The completed payment record is missing",
        )

    return schemas.ReceiptRead(
        session_id=session.id,
        station_name=session.station_name_snapshot,
        connector_type=(
            session.connector_type_snapshot
        ),
        started_at=session.started_at,
        completed_at=session.completed_at,
        energy_kwh=session.energy_kwh,
        unit_price_per_kwh=(
            session.unit_price_per_kwh
        ),
        total_amount=session.total_amount,
        currency_code=session.currency_code,
        payment_method=payment.method,
        payment_reference=(
            payment.provider_reference
        ),
    )
