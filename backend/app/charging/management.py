
from __future__ import annotations
from app.core.config import settings

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas
from .service import (
    ACTIVE_STATUSES,
    WRITE_ROLES,
    ChargingServiceError,
    _fail,
    get_account_access,
    require_network_access,
)


def _location_access(
    db: Session,
    user_id: int,
    location_id: str,
    *,
    write: bool = False,
) -> tuple[
    models.ChargingLocation,
    models.ChargingNetwork,
    models.ChargingNetworkMember,
]:
    row = (
        db.query(
            models.ChargingLocation,
            models.ChargingNetwork,
            models.ChargingNetworkMember,
        )
        .join(
            models.ChargingNetwork,
            models.ChargingNetwork.id
            == models.ChargingLocation.network_id,
        )
        .join(
            models.ChargingNetworkMember,
            models.ChargingNetworkMember.network_id
            == models.ChargingNetwork.id,
        )
        .filter(
            models.ChargingLocation.id == location_id,
            models.ChargingNetworkMember.user_id == user_id,
        )
        .first()
    )

    if row is None:
        _fail(
            404,
            "location_not_found",
            "Charging location not found",
        )

    location, network, member = row

    if write and member.role not in WRITE_ROLES:
        _fail(
            403,
            "network_write_denied",
            "Your network access is read-only",
        )

    if write and network.status == "suspended":
        _fail(
            409,
            "network_suspended",
            "This network is suspended",
        )

    return location, network, member


def _connector_access(
    db: Session,
    user_id: int,
    connector_id: str,
    *,
    write: bool = False,
) -> tuple[
    models.ChargerConnector,
    models.Charger,
    models.ChargingLocation,
    models.ChargingNetwork,
    models.ChargingNetworkMember,
]:
    row = (
        db.query(
            models.ChargerConnector,
            models.Charger,
            models.ChargingLocation,
            models.ChargingNetwork,
            models.ChargingNetworkMember,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .join(
            models.ChargingLocation,
            models.ChargingLocation.id
            == models.Charger.location_id,
        )
        .join(
            models.ChargingNetwork,
            models.ChargingNetwork.id
            == models.ChargingLocation.network_id,
        )
        .join(
            models.ChargingNetworkMember,
            models.ChargingNetworkMember.network_id
            == models.ChargingNetwork.id,
        )
        .filter(
            models.ChargerConnector.id == connector_id,
            models.ChargingNetworkMember.user_id == user_id,
        )
        .first()
    )

    if row is None:
        _fail(
            404,
            "connector_not_found",
            "Charging connector not found",
        )

    connector, charger, location, network, member = row

    if write and member.role not in WRITE_ROLES:
        _fail(
            403,
            "network_write_denied",
            "Your network access is read-only",
        )

    if write and network.status == "suspended":
        _fail(
            409,
            "network_suspended",
            "This network is suspended",
        )

    return connector, charger, location, network, member


def _read_sessions(
    db: Session,
    sessions: list[models.ChargingSession],
) -> list[schemas.ChargingSessionRead]:
    session_ids = [session.id for session in sessions]

    if not session_ids:
        return []

    payments = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id.in_(
                session_ids,
            )
        )
        .order_by(
            models.ChargingPayment.created_at.asc(),
        )
        .all()
    )

    events = (
        db.query(models.ChargingSessionEvent)
        .filter(
            models.ChargingSessionEvent.session_id.in_(
                session_ids,
            )
        )
        .order_by(
            models.ChargingSessionEvent.session_id.asc(),
            models.ChargingSessionEvent.version.asc(),
        )
        .all()
    )

    payment_by_session = {
        payment.session_id: payment
        for payment in payments
    }

    events_by_session: dict[
        str,
        list[models.ChargingSessionEvent],
    ] = defaultdict(list)

    for event in events:
        events_by_session[event.session_id].append(event)

    result = []

    for session in sessions:
        payment = payment_by_session.get(session.id)

        result.append(
            schemas.ChargingSessionRead(
                id=session.id,
                vehicle_profile_id=(
                    session.vehicle_profile_id
                ),
                connector_id=session.connector_id,
                status=session.status,
                station_name=(
                    session.station_name_snapshot
                ),
                connector_type=(
                    session.connector_type_snapshot
                ),
                currency_code=session.currency_code,
                unit_price_per_kwh=(
                    session.unit_price_per_kwh
                ),
                start_battery_percent=(
                    session.start_battery_percent
                ),
                target_battery_percent=(
                    session.target_battery_percent
                ),
                energy_kwh=session.energy_kwh,
                total_amount=session.total_amount,
                version=session.version,
                authorized_at=session.authorized_at,
                started_at=session.started_at,
                completed_at=session.completed_at,
                created_at=session.created_at,
                updated_at=session.updated_at,
                payment=(
                    schemas.PaymentRead.model_validate(
                        payment
                    )
                    if payment
                    else None
                ),
                history=[
                    schemas.SessionEventRead.model_validate(
                        event
                    )
                    for event in events_by_session[
                        session.id
                    ]
                ],
            )
        )

    return result


def _managed_locations(
    db: Session,
    network_id: str,
) -> list[schemas.ManagedLocationRead]:
    locations = (
        db.query(models.ChargingLocation)
        .filter(
            models.ChargingLocation.network_id
            == network_id,
        )
        .order_by(
            models.ChargingLocation.name.asc(),
        )
        .all()
    )

    location_ids = [
        location.id
        for location in locations
    ]

    chargers = (
        db.query(models.Charger)
        .filter(
            models.Charger.location_id.in_(
                location_ids,
            )
        )
        .order_by(
            models.Charger.display_name.asc(),
        )
        .all()
        if location_ids
        else []
    )

    charger_ids = [
        charger.id
        for charger in chargers
    ]

    connectors = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.charger_id.in_(
                charger_ids,
            )
        )
        .order_by(
            models.ChargerConnector.connector_number.asc(),
        )
        .all()
        if charger_ids
        else []
    )

    connectors_by_charger: dict[
        str,
        list[models.ChargerConnector],
    ] = defaultdict(list)

    chargers_by_location: dict[
        str,
        list[models.Charger],
    ] = defaultdict(list)

    for connector in connectors:
        connectors_by_charger[
            connector.charger_id
        ].append(connector)

    for charger in chargers:
        chargers_by_location[
            charger.location_id
        ].append(charger)

    result = []

    for location in locations:
        managed_chargers = []

        for charger in chargers_by_location[
            location.id
        ]:
            managed_chargers.append(
                schemas.ManagedChargerRead(
                    id=charger.id,
                    location_id=charger.location_id,
                    external_id=charger.external_id,
                    display_name=charger.display_name,
                    manufacturer=charger.manufacturer,
                    model=charger.model,
                    serial_number=charger.serial_number,
                    protocol=charger.protocol,
                    connection_status=(
                        charger.connection_status
                    ),
                    last_seen_at=charger.last_seen_at,
                    connectors=[
                        schemas.ManagedConnectorRead.model_validate(
                            connector
                        )
                        for connector
                        in connectors_by_charger[
                            charger.id
                        ]
                    ],
                    created_at=charger.created_at,
                    updated_at=charger.updated_at,
                )
            )

        result.append(
            schemas.ManagedLocationRead(
                id=location.id,
                network_id=location.network_id,
                name=location.name,
                address=location.address,
                city=location.city,
                country_code=location.country_code,
                timezone=location.timezone,
                latitude=location.latitude,
                longitude=location.longitude,
                google_place_id=(
                    location.google_place_id
                ),
                google_maps_url=(
                    location.google_maps_url
                ),
                status=location.status,
                is_public=location.is_public,
                chargers=managed_chargers,
                created_at=location.created_at,
                updated_at=location.updated_at,
            )
        )

    return result


def _metrics(
    db: Session,
    network: models.ChargingNetwork,
    locations: list[schemas.ManagedLocationRead],
) -> schemas.ManagementMetricsRead:
    connector_rows = (
        db.query(
            models.ChargerConnector.status,
            models.Charger.connection_status,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .join(
            models.ChargingLocation,
            models.ChargingLocation.id
            == models.Charger.location_id,
        )
        .filter(
            models.ChargingLocation.network_id
            == network.id,
        )
        .all()
    )

    available = sum(
        1
        for connector_status, charger_status
        in connector_rows
        if (
            connector_status == "available"
            and charger_status == "online"
        )
    )

    offline = sum(
        1
        for connector_status, charger_status
        in connector_rows
        if (
            connector_status == "offline"
            or charger_status != "online"
        )
    )

    active_sessions = (
        db.query(
            func.count(models.ChargingSession.id)
        )
        .join(
            models.ChargerConnector,
            models.ChargerConnector.id
            == models.ChargingSession.connector_id,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .join(
            models.ChargingLocation,
            models.ChargingLocation.id
            == models.Charger.location_id,
        )
        .filter(
            models.ChargingLocation.network_id
            == network.id,
            models.ChargingSession.status.in_(
                ACTIVE_STATUSES,
            ),
        )
        .scalar()
        or 0
    )

    timezone_name = (
        locations[0].timezone
        if locations
        else "Asia/Manila"
    )

    try:
        report_zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        report_zone = ZoneInfo("Asia/Manila")

    today_start = (
        datetime.now(report_zone)
        .replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        .astimezone(timezone.utc)
    )

    energy_today, revenue_today = (
        db.query(
            func.coalesce(
                func.sum(
                    models.ChargingSession.energy_kwh
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    models.ChargingSession.total_amount
                ),
                0,
            ),
        )
        .join(
            models.ChargerConnector,
            models.ChargerConnector.id
            == models.ChargingSession.connector_id,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .join(
            models.ChargingLocation,
            models.ChargingLocation.id
            == models.Charger.location_id,
        )
        .filter(
            models.ChargingLocation.network_id
            == network.id,
            models.ChargingSession.status
            == "completed",
            models.ChargingSession.completed_at
            >= today_start,
        )
        .one()
    )

    energy_value = Decimal(
        str(energy_today)
    ).quantize(
        Decimal("0.001"),
        rounding=ROUND_HALF_UP,
    )

    revenue_value = Decimal(
        str(revenue_today)
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    return schemas.ManagementMetricsRead(
        active_sessions=int(active_sessions),
        available_connectors=available,
        offline_connectors=offline,
        energy_today_kwh=energy_value,
        revenue_today=revenue_value,
        currency_code=network.currency_code,
    )


def get_management_workspace(
    db: Session,
    user_id: int,
    network_id: str,
) -> schemas.ManagementWorkspaceRead:
    network, _ = require_network_access(
        db,
        user_id,
        network_id,
    )

    locations = _managed_locations(
        db,
        network.id,
    )

    recent_sessions = (
        db.query(models.ChargingSession)
        .join(
            models.ChargerConnector,
            models.ChargerConnector.id
            == models.ChargingSession.connector_id,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .join(
            models.ChargingLocation,
            models.ChargingLocation.id
            == models.Charger.location_id,
        )
        .filter(
            models.ChargingLocation.network_id
            == network.id,
        )
        .order_by(
            models.ChargingSession.created_at.desc(),
        )
        .limit(20)
        .all()
    )

    return schemas.ManagementWorkspaceRead(
        access=get_account_access(db, user_id),
        sources=schemas.SourceStateRead(
            charging="synthetic",
            routing="unavailable",
            payments="sandbox",
            assistant=(
                "together"
                if settings.TOGETHER_API_KEY
                else "unavailable"
            ),
        ),
        network=schemas.NetworkRead.model_validate(
            network
        ),
        metrics=_metrics(
            db,
            network,
            locations,
        ),
        locations=locations,
        recent_sessions=_read_sessions(
            db,
            recent_sessions,
        ),
    )


def create_location(
    db: Session,
    user_id: int,
    network_id: str,
    payload: schemas.LocationCreate,
) -> schemas.ManagedLocationRead:
    require_network_access(
        db,
        user_id,
        network_id,
        write=True,
    )

    try:
        ZoneInfo(payload.timezone)
    except ZoneInfoNotFoundError:
        _fail(
            422,
            "invalid_timezone",
            "Choose a valid station timezone",
        )

    location = models.ChargingLocation(
        network_id=network_id,
        name=payload.name,
        address=payload.address,
        city=payload.city,
        country_code=payload.country_code,
        timezone=payload.timezone,
        latitude=payload.latitude,
        longitude=payload.longitude,
        google_place_id=payload.google_place_id,
        google_maps_url=payload.google_maps_url,
        status="draft",
        is_public=payload.is_public,
    )

    try:
        db.add(location)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ChargingServiceError(
            409,
            "location_exists",
            "A location with this name already exists",
        ) from exc

    db.refresh(location)

    return next(
        item
        for item in _managed_locations(
            db,
            network_id,
        )
        if item.id == location.id
    )


def update_location(
    db: Session,
    user_id: int,
    location_id: str,
    payload: schemas.LocationUpdate,
) -> schemas.ManagedLocationRead:
    location, network, _ = _location_access(
        db,
        user_id,
        location_id,
        write=True,
    )

    changes = payload.model_dump(
        exclude_unset=True,
    )

    for field, value in changes.items():
        setattr(location, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ChargingServiceError(
            409,
            "location_exists",
            "A location with this name already exists",
        ) from exc

    return next(
        item
        for item in _managed_locations(
            db,
            network.id,
        )
        if item.id == location.id
    )


def publish_location(
    db: Session,
    user_id: int,
    location_id: str,
) -> schemas.ManagedLocationRead:
    location, network, _ = _location_access(
        db,
        user_id,
        location_id,
        write=True,
    )

    connector_count = (
        db.query(
            func.count(
                models.ChargerConnector.id
            )
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .filter(
            models.Charger.location_id
            == location.id,
        )
        .scalar()
        or 0
    )

    if connector_count == 0:
        _fail(
            409,
            "location_incomplete",
            "Add a charger before publishing",
        )

    location.status = "active"
    db.commit()

    return next(
        item
        for item in _managed_locations(
            db,
            network.id,
        )
        if item.id == location.id
    )


def take_location_offline(
    db: Session,
    user_id: int,
    location_id: str,
) -> schemas.ManagedLocationRead:
    location, network, _ = _location_access(
        db,
        user_id,
        location_id,
        write=True,
    )

    active_count = (
        db.query(
            func.count(
                models.ChargingSession.id
            )
        )
        .join(
            models.ChargerConnector,
            models.ChargerConnector.id
            == models.ChargingSession.connector_id,
        )
        .join(
            models.Charger,
            models.Charger.id
            == models.ChargerConnector.charger_id,
        )
        .filter(
            models.Charger.location_id
            == location.id,
            models.ChargingSession.status.in_(
                ACTIVE_STATUSES,
            ),
        )
        .scalar()
        or 0
    )

    if active_count:
        _fail(
            409,
            "location_in_use",
            "Finish active sessions before going offline",
        )

    location.status = "offline"
    db.commit()

    return next(
        item
        for item in _managed_locations(
            db,
            network.id,
        )
        if item.id == location.id
    )


def create_charger(
    db: Session,
    user_id: int,
    location_id: str,
    payload: schemas.ChargerCreate,
) -> schemas.ManagedChargerRead:
    location, network, _ = _location_access(
        db,
        user_id,
        location_id,
        write=True,
    )

    connector_numbers = [
        connector.connector_number
        for connector in payload.connectors
    ]

    if (
        len(connector_numbers)
        != len(set(connector_numbers))
    ):
        _fail(
            422,
            "duplicate_connector_number",
            "Connector numbers must be unique",
        )

    charger = models.Charger(
        location_id=location.id,
        external_id=payload.external_id,
        display_name=payload.display_name,
        manufacturer=payload.manufacturer,
        model=payload.model,
        serial_number=payload.serial_number,
        protocol=payload.protocol,
        connection_status="pending",
    )

    try:
        db.add(charger)
        db.flush()

        for connector in payload.connectors:
            db.add(
                models.ChargerConnector(
                    charger_id=charger.id,
                    connector_number=(
                        connector.connector_number
                    ),
                    connector_type=(
                        connector.connector_type
                    ),
                    max_power_kw=(
                        connector.max_power_kw
                    ),
                    price_per_kwh=(
                        connector.price_per_kwh
                    ),
                    status="offline",
                )
            )

        db.commit()

    except IntegrityError as exc:
        db.rollback()
        raise ChargingServiceError(
            409,
            "charger_exists",
            "This charger or connector number already exists",
        ) from exc

    locations = _managed_locations(
        db,
        network.id,
    )

    return next(
        charger_read
        for location_read in locations
        if location_read.id == location.id
        for charger_read in location_read.chargers
        if charger_read.id == charger.id
    )


def update_connector_price(
    db: Session,
    user_id: int,
    connector_id: str,
    payload: schemas.ConnectorPriceUpdate,
) -> schemas.ManagedConnectorRead:
    _connector_access(
        db,
        user_id,
        connector_id,
        write=True,
    )

    changed = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == connector_id,
            models.ChargerConnector.version
            == payload.expected_version,
        )
        .update(
            {
                models.ChargerConnector.price_per_kwh:
                    payload.price_per_kwh,
                models.ChargerConnector.version:
                    payload.expected_version + 1,
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

    db.commit()

    connector = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == connector_id,
        )
        .one()
    )

    return schemas.ManagedConnectorRead.model_validate(
        connector
    )


def update_connector_status(
    db: Session,
    user_id: int,
    connector_id: str,
    payload: schemas.ConnectorStatusUpdate,
) -> schemas.ManagedConnectorRead:
    connector, charger, _, _, _ = (
        _connector_access(
            db,
            user_id,
            connector_id,
            write=True,
        )
    )

    if connector.status in (
        "reserved",
        "charging",
    ):
        _fail(
            409,
            "connector_in_use",
            "An active session controls this connector",
        )

    if (
        payload.status == "available"
        and charger.connection_status != "online"
    ):
        _fail(
            409,
            "charger_not_online",
            "The charger must be online first",
        )

    changed = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == connector_id,
            models.ChargerConnector.version
            == payload.expected_version,
            models.ChargerConnector.status.notin_(
                ("reserved", "charging")
            ),
        )
        .update(
            {
                models.ChargerConnector.status:
                    payload.status,
                models.ChargerConnector.version:
                    payload.expected_version + 1,
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

    db.commit()

    updated = (
        db.query(models.ChargerConnector)
        .filter(
            models.ChargerConnector.id
            == connector_id,
        )
        .one()
    )

    return schemas.ManagedConnectorRead.model_validate(
        updated
    )
