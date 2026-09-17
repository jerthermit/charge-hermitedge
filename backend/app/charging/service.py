from __future__ import annotations
from app.core.config import settings

from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from typing import Any, NoReturn

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas


ACTIVE_STATUSES = ("payment_pending", "ready", "charging")
WRITE_ROLES = ("owner", "manager")


class ChargingServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _fail(status_code: int, code: str, message: str) -> NoReturn:
    raise ChargingServiceError(status_code, code, message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _energy(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _commit(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ChargingServiceError(
            409,
            "duplicate_record",
            message,
        ) from exc


def get_account_access(
    db: Session,
    user_id: int,
) -> schemas.AccountAccessRead:
    rows = (
        db.query(
            models.ChargingNetworkMember,
            models.ChargingNetwork,
        )
        .join(
            models.ChargingNetwork,
            models.ChargingNetwork.id
            == models.ChargingNetworkMember.network_id,
        )
        .filter(
            models.ChargingNetworkMember.user_id == user_id,
        )
        .order_by(models.ChargingNetwork.name.asc())
        .all()
    )

    networks = [
        schemas.NetworkAccessRead(
            network_id=network.id,
            network_name=network.name,
            role=member.role,
        )
        for member, network in rows
    ]

    has_vehicle = (
        db.query(models.VehicleProfile.id)
        .filter(models.VehicleProfile.user_id == user_id)
        .first()
        is not None
    )

    can_manage = bool(networks)
    can_find = has_vehicle or not can_manage

    return schemas.AccountAccessRead(
        can_find=can_find,
        can_manage=can_manage,
        default_mode=(
            "find"
            if can_find
            else "manage"
            if can_manage
            else None
        ),
        networks=networks,
    )


def require_network_access(
    db: Session,
    user_id: int,
    network_id: str,
    *,
    write: bool = False,
) -> tuple[
    models.ChargingNetwork,
    models.ChargingNetworkMember,
]:
    row = (
        db.query(
            models.ChargingNetwork,
            models.ChargingNetworkMember,
        )
        .join(
            models.ChargingNetworkMember,
            models.ChargingNetworkMember.network_id
            == models.ChargingNetwork.id,
        )
        .filter(
            models.ChargingNetwork.id == network_id,
            models.ChargingNetworkMember.user_id == user_id,
        )
        .first()
    )

    if row is None:
        _fail(
            403,
            "network_access_denied",
            "You do not have access to this network",
        )

    network, member = row

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

    return network, member


def _vehicle(
    db: Session,
    user_id: int,
    vehicle_id: str,
) -> models.VehicleProfile:
    vehicle = (
        db.query(models.VehicleProfile)
        .filter(
            models.VehicleProfile.id == vehicle_id,
            models.VehicleProfile.user_id == user_id,
        )
        .first()
    )

    if vehicle is None:
        _fail(
            404,
            "vehicle_not_found",
            "Vehicle not found",
        )

    return vehicle


def list_vehicles(
    db: Session,
    user_id: int,
) -> list[schemas.VehicleRead]:
    rows = (
        db.query(models.VehicleProfile)
        .filter(models.VehicleProfile.user_id == user_id)
        .order_by(
            models.VehicleProfile.is_default.desc(),
            models.VehicleProfile.created_at.asc(),
        )
        .all()
    )

    return [
        schemas.VehicleRead.model_validate(row)
        for row in rows
    ]


def create_vehicle(
    db: Session,
    user_id: int,
    payload: schemas.VehicleCreate,
) -> schemas.VehicleRead:
    has_vehicle = (
        db.query(models.VehicleProfile.id)
        .filter(models.VehicleProfile.user_id == user_id)
        .first()
        is not None
    )

    make_default = payload.is_default or not has_vehicle

    if make_default:
        (
            db.query(models.VehicleProfile)
            .filter(models.VehicleProfile.user_id == user_id)
            .update(
                {models.VehicleProfile.is_default: False},
                synchronize_session=False,
            )
        )

    vehicle = models.VehicleProfile(
        user_id=user_id,
        nickname=payload.nickname,
        make=payload.make,
        model=payload.model,
        model_year=payload.model_year,
        battery_capacity_kwh=payload.battery_capacity_kwh,
        connector_type=payload.connector_type,
        max_dc_power_kw=payload.max_dc_power_kw,
        battery_percent=payload.battery_percent,
        battery_source="manual",
        battery_updated_at=(
            _now()
            if payload.battery_percent is not None
            else None
        ),
        is_default=make_default,
    )

    db.add(vehicle)
    _commit(db, "Vehicle could not be created")
    db.refresh(vehicle)

    return schemas.VehicleRead.model_validate(vehicle)


def update_vehicle(
    db: Session,
    user_id: int,
    vehicle_id: str,
    payload: schemas.VehicleUpdate,
) -> schemas.VehicleRead:
    vehicle = _vehicle(db, user_id, vehicle_id)
    changes = payload.model_dump(exclude_unset=True)

    required_fields = {
        "make",
        "model",
        "battery_capacity_kwh",
        "connector_type",
        "max_dc_power_kw",
    }

    clearing_required_field = any(
        changes.get(field) is None
        for field in required_fields
        if field in changes
    )

    if clearing_required_field:
        _fail(
            422,
            "invalid_vehicle",
            "Required vehicle fields cannot be cleared",
        )

    if changes.get("is_default") is True:
        (
            db.query(models.VehicleProfile)
            .filter(
                models.VehicleProfile.user_id == user_id,
                models.VehicleProfile.id != vehicle.id,
            )
            .update(
                {models.VehicleProfile.is_default: False},
                synchronize_session=False,
            )
        )

    for field, value in changes.items():
        setattr(vehicle, field, value)

    _commit(db, "Vehicle could not be updated")
    db.refresh(vehicle)

    return schemas.VehicleRead.model_validate(vehicle)


def update_vehicle_battery(
    db: Session,
    user_id: int,
    vehicle_id: str,
    payload: schemas.VehicleBatteryUpdate,
) -> schemas.VehicleRead:
    vehicle = _vehicle(db, user_id, vehicle_id)

    vehicle.battery_percent = payload.battery_percent
    vehicle.battery_source = "manual"
    vehicle.battery_updated_at = _now()

    db.commit()
    db.refresh(vehicle)

    return schemas.VehicleRead.model_validate(vehicle)


def _connector_context(
    db: Session,
    connector_id: str,
) -> tuple[
    models.ChargerConnector,
    models.Charger,
    models.ChargingLocation,
    models.ChargingNetwork,
]:
    row = (
        db.query(
            models.ChargerConnector,
            models.Charger,
            models.ChargingLocation,
            models.ChargingNetwork,
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
        .filter(
            models.ChargerConnector.id == connector_id,
        )
        .first()
    )

    if row is None:
        _fail(
            404,
            "connector_not_found",
            "Charging connector not found",
        )

    return row


def _maps_url(
    location: models.ChargingLocation,
) -> str:
    if location.google_maps_url:
        return location.google_maps_url

    return (
        "https://www.google.com/maps/dir/"
        "?api=1&destination="
        f"{location.latitude},{location.longitude}"
    )


def _session_read(
    db: Session,
    session: models.ChargingSession,
) -> schemas.ChargingSessionRead:
    payment = (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id == session.id,
        )
        .order_by(models.ChargingPayment.created_at.desc())
        .first()
    )

    events = (
        db.query(models.ChargingSessionEvent)
        .filter(
            models.ChargingSessionEvent.session_id == session.id,
        )
        .order_by(models.ChargingSessionEvent.version.asc())
        .all()
    )

    payment_read = None

    if payment is not None:
        payment_read = schemas.PaymentRead.model_validate(payment)
        payment_read = payment_read.model_copy(
            update={
                "captured_at": _as_utc(payment_read.captured_at),
                "created_at": _as_utc(payment_read.created_at),
                "updated_at": _as_utc(payment_read.updated_at),
            }
        )

    history = []

    for event in events:
        event_read = schemas.SessionEventRead.model_validate(event)
        history.append(
            event_read.model_copy(
                update={"created_at": _as_utc(event_read.created_at)}
            )
        )

    return schemas.ChargingSessionRead(
        id=session.id,
        vehicle_profile_id=session.vehicle_profile_id,
        connector_id=session.connector_id,
        status=session.status,
        station_name=session.station_name_snapshot,
        connector_type=session.connector_type_snapshot,
        currency_code=session.currency_code,
        unit_price_per_kwh=session.unit_price_per_kwh,
        start_battery_percent=session.start_battery_percent,
        target_battery_percent=session.target_battery_percent,
        energy_kwh=session.energy_kwh,
        total_amount=session.total_amount,
        version=session.version,
        authorized_at=_as_utc(session.authorized_at),
        started_at=_as_utc(session.started_at),
        completed_at=_as_utc(session.completed_at),
        created_at=_as_utc(session.created_at),
        updated_at=_as_utc(session.updated_at),
        payment=payment_read,
        history=history,
    )


def get_driver_workspace(
    db: Session,
    user_id: int,
) -> schemas.DriverWorkspaceRead:
    access = get_account_access(db, user_id)

    if not access.can_find:
        _fail(
            403,
            "find_access_denied",
            "Add a vehicle to use Find",
        )

    vehicles = (
        db.query(models.VehicleProfile)
        .filter(models.VehicleProfile.user_id == user_id)
        .order_by(
            models.VehicleProfile.is_default.desc(),
            models.VehicleProfile.created_at.asc(),
        )
        .all()
    )

    selected_vehicle = vehicles[0] if vehicles else None

    rows = (
        db.query(
            models.ChargingLocation,
            models.ChargingNetwork,
            models.Charger,
            models.ChargerConnector,
        )
        .join(
            models.ChargingNetwork,
            models.ChargingNetwork.id
            == models.ChargingLocation.network_id,
        )
        .join(
            models.Charger,
            models.Charger.location_id
            == models.ChargingLocation.id,
        )
        .join(
            models.ChargerConnector,
            models.ChargerConnector.charger_id
            == models.Charger.id,
        )
        .filter(
            models.ChargingNetwork.status == "active",
            models.ChargingLocation.status == "active",
            models.ChargingLocation.is_public.is_(True),
        )
        .order_by(
            models.ChargingLocation.name,
            models.ChargerConnector.connector_number,
        )
        .all()
    )

    grouped: dict[str, dict[str, Any]] = {}

    for location, network, charger, connector in rows:
        station = grouped.setdefault(
            location.id,
            {
                "id": location.id,
                "network_name": network.name,
                "name": location.name,
                "address": location.address,
                "city": location.city,
                "latitude": location.latitude,
                "longitude": location.longitude,
                "google_maps_url": _maps_url(location),
                "available_connector_count": 0,
                "connectors": [],
                "route": schemas.RouteRead(
                    source="unavailable",
                    maps_url=_maps_url(location),
                ),
            },
        )

        effective_status = (
            connector.status
            if charger.connection_status == "online"
            else "offline"
        )

        compatible = bool(
            selected_vehicle
            and selected_vehicle.connector_type
            == connector.connector_type
        )

        if effective_status == "available":
            station["available_connector_count"] += 1

        station["connectors"].append(
            schemas.PublicConnectorRead(
                id=connector.id,
                charger_id=charger.id,
                charger_name=charger.display_name,
                connector_number=connector.connector_number,
                connector_type=connector.connector_type,
                max_power_kw=connector.max_power_kw,
                price_per_kwh=connector.price_per_kwh,
                currency_code=network.currency_code,
                status=effective_status,
                compatible=compatible,
                version=connector.version,
                updated_at=connector.updated_at,
            )
        )

    stations = [
        schemas.StationRead.model_validate(station)
        for station in grouped.values()
    ]

    stations.sort(
        key=lambda station: (
            not any(
                connector.compatible
                and connector.status == "available"
                for connector in station.connectors
            ),
            station.name.lower(),
        )
    )

    active_session = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.user_id == user_id,
            models.ChargingSession.status.in_(
                ACTIVE_STATUSES,
            ),
        )
        .order_by(
            models.ChargingSession.created_at.desc(),
        )
        .first()
    )

    return schemas.DriverWorkspaceRead(
        access=access,
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
        vehicles=[
            schemas.VehicleRead.model_validate(vehicle)
            for vehicle in vehicles
        ],
        stations=stations,
        active_session=(
            _session_read(db, active_session)
            if active_session
            else None
        ),
    )


def _estimate(
    vehicle: models.VehicleProfile,
    connector: models.ChargerConnector,
    target_battery_percent: Decimal,
) -> tuple[
    Decimal,
    Decimal,
    int,
    Decimal,
]:
    if vehicle.battery_percent is None:
        _fail(
            422,
            "battery_required",
            "Add the vehicle's current battery level",
        )

    current_battery = _decimal(vehicle.battery_percent)
    target_battery = _decimal(target_battery_percent)

    if target_battery <= current_battery:
        _fail(
            422,
            "invalid_target",
            "Target battery must be above the current level",
        )

    if vehicle.connector_type != connector.connector_type:
        _fail(
            422,
            "incompatible_connector",
            "This connector does not fit the vehicle",
        )

    energy_needed = _energy(
        _decimal(vehicle.battery_capacity_kwh)
        * (target_battery - current_battery)
        / Decimal("100")
    )

    effective_power = min(
        _decimal(vehicle.max_dc_power_kw),
        _decimal(connector.max_power_kw),
    )

    estimated_minutes = int(
        (
            energy_needed
            / effective_power
            * Decimal("60")
        ).to_integral_value(
            rounding=ROUND_CEILING,
        )
    )

    estimated_total = _money(
        energy_needed
        * _decimal(connector.price_per_kwh)
    )

    return (
        energy_needed,
        effective_power,
        estimated_minutes,
        estimated_total,
    )


def calculate_estimate(
    db: Session,
    user_id: int,
    payload: schemas.ChargeEstimateRequest,
) -> schemas.ChargeEstimateRead:
    vehicle = _vehicle(
        db,
        user_id,
        payload.vehicle_profile_id,
    )

    connector, _, location, network = _connector_context(
        db,
        payload.connector_id,
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

    (
        energy_needed,
        effective_power,
        estimated_minutes,
        estimated_total,
    ) = _estimate(
        vehicle,
        connector,
        payload.target_battery_percent,
    )

    return schemas.ChargeEstimateRead(
        connector_id=connector.id,
        vehicle_profile_id=vehicle.id,
        station_name=location.name,
        connector_type=connector.connector_type,
        start_battery_percent=vehicle.battery_percent,
        target_battery_percent=payload.target_battery_percent,
        estimated_energy_kwh=energy_needed,
        effective_power_kw=effective_power,
        estimated_minutes=estimated_minutes,
        price_per_kwh=connector.price_per_kwh,
        estimated_total=estimated_total,
        currency_code=network.currency_code,
        calculated_at=_now(),
    )
