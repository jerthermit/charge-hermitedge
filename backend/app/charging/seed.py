from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import models as auth_models
from app.core import security

from . import models


NETWORK_SLUG = "charge-metro-recording"
SAMPLE_DRIVER_EMAIL = "sample.driver@charge.invalid"


STATIONS: tuple[dict[str, Any], ...] = (
    {
        "name": "BGC Central",
        "address": (
            "Bonifacio High Street, "
            "5th Avenue, Taguig"
        ),
        "city": "Taguig",
        "latitude": Decimal("14.550700"),
        "longitude": Decimal("121.051300"),
        "chargers": (
            {
                "external_id": "MNL-BGC-DC-01",
                "display_name": (
                    "Basement 1 · Bay 04"
                ),
                "manufacturer": "StarCharge",
                "model": "DC 120",
                "serial_number": "BGC-120-004",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 24,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "120.00",
                        "34.00",
                        "available",
                    ),
                    (
                        2,
                        "TYPE_2",
                        "22.00",
                        "27.00",
                        "available",
                    ),
                ),
            },
            {
                "external_id": "MNL-BGC-DC-02",
                "display_name": (
                    "Basement 1 · Bays 05–06"
                ),
                "manufacturer": "StarCharge",
                "model": "DC 120",
                "serial_number": "BGC-120-006",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 19,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "120.00",
                        "34.00",
                        "available",
                    ),
                    (
                        2,
                        "CCS2",
                        "120.00",
                        "34.00",
                        "available",
                    ),
                ),
            },
        ),
    },
    {
        "name": "Ayala Triangle",
        "address": (
            "Ayala Triangle, "
            "Ayala Avenue, Makati"
        ),
        "city": "Makati",
        "latitude": Decimal("14.556000"),
        "longitude": Decimal("121.023600"),
        "chargers": (
            {
                "external_id": "MNL-MKT-DC-01",
                "display_name": (
                    "Level P2 · Bay 12"
                ),
                "manufacturer": "Autel",
                "model": "DC Compact",
                "serial_number": "MKT-060-012",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 18,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "60.00",
                        "33.00",
                        "available",
                    ),
                    (
                        2,
                        "TYPE_2",
                        "22.00",
                        "26.00",
                        "available",
                    ),
                ),
            },
        ),
    },
    {
        "name": "MOA Bay",
        "address": (
            "MOA Complex, "
            "Seaside Boulevard, Pasay"
        ),
        "city": "Pasay",
        "latitude": Decimal("14.535200"),
        "longitude": Decimal("120.982200"),
        "chargers": (
            {
                "external_id": "MNL-PSY-DC-01",
                "display_name": (
                    "Main Mall · North Wing"
                ),
                "manufacturer": "Sinexcel",
                "model": "DC 180",
                "serial_number": "MOA-180-008",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 37,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "180.00",
                        "35.00",
                        "available",
                    ),
                    (
                        2,
                        "CHADEMO",
                        "50.00",
                        "33.00",
                        "offline",
                    ),
                ),
            },
            {
                "external_id": "MNL-PSY-AC-02",
                "display_name": (
                    "South Wing · Bay 14"
                ),
                "manufacturer": "Autel",
                "model": "AC 22",
                "serial_number": "MOA-022-014",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 28,
                "connectors": (
                    (
                        1,
                        "TYPE_2",
                        "22.00",
                        "26.00",
                        "available",
                    ),
                ),
            },
        ),
    },
    {
        "name": "North Avenue",
        "address": (
            "Vertis North, "
            "North Avenue, Quezon City"
        ),
        "city": "Quezon City",
        "latitude": Decimal("14.651777"),
        "longitude": Decimal("121.035869"),
        "chargers": (
            {
                "external_id": "MNL-QC-DC-01",
                "display_name": (
                    "Level 3 · Bay 21"
                ),
                "manufacturer": "StarCharge",
                "model": "DC 120",
                "serial_number": "NVA-120-021",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 31,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "90.00",
                        "33.50",
                        "available",
                    ),
                    (
                        2,
                        "GB_T",
                        "120.00",
                        "34.00",
                        "available",
                    ),
                ),
            },
            {
                "external_id": "MNL-QC-AC-02",
                "display_name": (
                    "Level 3 · Bays 22–23"
                ),
                "manufacturer": "Autel",
                "model": "AC 22",
                "serial_number": "NVA-022-023",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 26,
                "connectors": (
                    (
                        1,
                        "TYPE_2",
                        "22.00",
                        "25.50",
                        "available",
                    ),
                    (
                        2,
                        "TYPE_2",
                        "22.00",
                        "25.50",
                        "available",
                    ),
                ),
            },
        ),
    },
    {
        "name": "Ortigas Center",
        "address": (
            "F. Ortigas Jr. Road, "
            "Ortigas Center, Pasig"
        ),
        "city": "Pasig",
        "latitude": Decimal("14.587300"),
        "longitude": Decimal("121.061300"),
        "chargers": (
            {
                "external_id": "MNL-ORT-DC-01",
                "display_name": (
                    "Ruby Road · Bay 06"
                ),
                "manufacturer": "Delta",
                "model": "DC 120",
                "serial_number": "ORT-120-006",
                "protocol": "ocpp_1_6j",
                "connection_status": "maintenance",
                "last_seen_seconds": 1080,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "120.00",
                        "34.00",
                        "offline",
                    ),
                    (
                        2,
                        "TYPE_2",
                        "22.00",
                        "27.00",
                        "offline",
                    ),
                ),
            },
        ),
    },
    {
        "name": "Alabang Central",
        "address": (
            "Alabang Town Center, "
            "Alabang–Zapote Road, Muntinlupa"
        ),
        "city": "Muntinlupa",
        "latitude": Decimal("14.423000"),
        "longitude": Decimal("121.030900"),
        "chargers": (
            {
                "external_id": "MNL-ALB-DC-01",
                "display_name": (
                    "Town Plaza · Bay 03"
                ),
                "manufacturer": "Autel",
                "model": "DC Compact",
                "serial_number": "ALB-060-003",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 43,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "60.00",
                        "32.50",
                        "available",
                    ),
                    (
                        2,
                        "TYPE_2",
                        "22.00",
                        "26.00",
                        "available",
                    ),
                ),
            },
            {
                "external_id": "MNL-ALB-DC-02",
                "display_name": (
                    "Town Plaza · Bay 04"
                ),
                "manufacturer": "Autel",
                "model": "DC Compact",
                "serial_number": "ALB-060-004",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 21,
                "connectors": (
                    (
                        1,
                        "CCS2",
                        "60.00",
                        "32.50",
                        "available",
                    ),
                ),
            },
        ),
    },
    {
        "name": "Manila Civic Garage",
        "address": "Natividad Lopez Street, Ermita, Manila",
        "city": "Manila",
        "latitude": Decimal("14.589800"),
        "longitude": Decimal("120.981600"),
        "chargers": (
            {
                "external_id": "MNL-ERM-DC-01",
                "display_name": "Ground floor · Bay 05",
                "manufacturer": "Delta",
                "model": "DC Wallbox",
                "serial_number": "ERM-060-005",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 29,
                "connectors": (
                    (1, "CCS2", "60.00", "32.00", "available"),
                    (2, "TYPE_2", "22.00", "25.50", "available"),
                ),
            },
        ),
    },
    {
        "name": "Monumento North Hub",
        "address": "EDSA / Rizal Avenue Extension, Caloocan",
        "city": "Caloocan",
        "latitude": Decimal("14.657100"),
        "longitude": Decimal("120.984000"),
        "chargers": (
            {
                "external_id": "MNL-CAL-DC-01",
                "display_name": "North deck · Bay 08",
                "manufacturer": "StarCharge",
                "model": "DC 120",
                "serial_number": "CAL-120-008",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 41,
                "connectors": (
                    (1, "CCS2", "90.00", "32.00", "available"),
                    (2, "GB_T", "60.00", "31.50", "available"),
                ),
            },
        ),
    },
    {
        "name": "Fairview North Hub",
        "address": "Commonwealth Avenue, Fairview, Quezon City",
        "city": "Quezon City",
        "latitude": Decimal("14.699600"),
        "longitude": Decimal("121.064100"),
        "chargers": (
            {
                "external_id": "MNL-FRV-DC-01",
                "display_name": "Transport wing · Bay 16",
                "manufacturer": "Autel",
                "model": "MaxiCharger DC",
                "serial_number": "FRV-120-016",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 16,
                "connectors": (
                    (1, "CCS2", "120.00", "34.00", "available"),
                    (2, "TYPE_2", "22.00", "26.00", "offline"),
                ),
            },
        ),
    },
    {
        "name": "Libis East Hub",
        "address": "E. Rodriguez Jr. Avenue, Bagumbayan, Quezon City",
        "city": "Quezon City",
        "latitude": Decimal("14.609700"),
        "longitude": Decimal("121.080100"),
        "chargers": (
            {
                "external_id": "MNL-LBS-DC-01",
                "display_name": "East wing · Bay 02",
                "manufacturer": "Sinexcel",
                "model": "DC 180",
                "serial_number": "LBS-180-002",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 22,
                "connectors": (
                    (1, "CCS2", "180.00", "35.50", "available"),
                    (2, "CHADEMO", "50.00", "33.00", "available"),
                ),
            },
        ),
    },
    {
        "name": "Marikina Central Hub",
        "address": "Shoe Avenue / Sumulong Highway, Marikina",
        "city": "Marikina",
        "latitude": Decimal("14.637000"),
        "longitude": Decimal("121.102300"),
        "chargers": (
            {
                "external_id": "MNL-MRK-DC-01",
                "display_name": "Civic deck · Bay 11",
                "manufacturer": "Delta",
                "model": "DC 100",
                "serial_number": "MRK-100-011",
                "protocol": "ocpp_1_6j",
                "connection_status": "online",
                "last_seen_seconds": 34,
                "connectors": (
                    (1, "CCS2", "100.00", "32.50", "available"),
                    (2, "TYPE_2", "22.00", "25.00", "available"),
                ),
            },
        ),
    },
    {
        "name": "Newport South Garage",
        "address": "Andrews Avenue, Newport, Pasay",
        "city": "Pasay",
        "latitude": Decimal("14.522300"),
        "longitude": Decimal("121.016100"),
        "chargers": (
            {
                "external_id": "MNL-NPT-DC-01",
                "display_name": "Parking B · Bay 09",
                "manufacturer": "StarCharge",
                "model": "DC 120",
                "serial_number": "NPT-120-009",
                "protocol": "ocpp_2_0_1",
                "connection_status": "online",
                "last_seen_seconds": 12,
                "connectors": (
                    (1, "CCS2", "120.00", "35.00", "available"),
                    (2, "TYPE_2", "22.00", "27.00", "available"),
                ),
            },
        ),
    },
)


def _ensure_network(
    db: Session,
) -> models.ChargingNetwork:
    network = (
        db.query(models.ChargingNetwork)
        .filter(
            models.ChargingNetwork.slug
            == NETWORK_SLUG
        )
        .first()
    )

    if network is None:
        network = models.ChargingNetwork(
            name="Charge Metro Manila",
            slug=NETWORK_SLUG,
            status="active",
            currency_code="PHP",
            country_code="PH",
        )
        db.add(network)
        db.flush()
    else:
        network.name = "Charge Metro Manila"
        network.status = "active"
        network.currency_code = "PHP"
        network.country_code = "PH"

    return network


def _ensure_membership(
    db: Session,
    network_id: str,
    user_id: int,
) -> None:
    membership = (
        db.query(
            models.ChargingNetworkMember
        )
        .filter(
            models.ChargingNetworkMember.network_id
            == network_id,
            models.ChargingNetworkMember.user_id
            == user_id,
        )
        .first()
    )

    if membership is None:
        db.add(
            models.ChargingNetworkMember(
                network_id=network_id,
                user_id=user_id,
                role="owner",
            )
        )
    elif membership.role != "owner":
        membership.role = "owner"


def _ensure_vehicle(
    db: Session,
    user_id: int,
    *,
    nickname: str,
    make: str,
    model_name: str,
    model_year: int,
    battery_capacity_kwh: str,
    connector_type: str,
    max_dc_power_kw: str,
    battery_percent: str,
    default: bool,
) -> models.VehicleProfile:
    vehicle = (
        db.query(models.VehicleProfile)
        .filter(
            models.VehicleProfile.user_id
            == user_id,
            models.VehicleProfile.make
            == make,
            models.VehicleProfile.model
            == model_name,
        )
        .first()
    )

    if vehicle is None:
        vehicle = models.VehicleProfile(
            user_id=user_id,
            nickname=nickname,
            make=make,
            model=model_name,
            model_year=model_year,
            battery_capacity_kwh=Decimal(
                battery_capacity_kwh
            ),
            connector_type=connector_type,
            max_dc_power_kw=Decimal(
                max_dc_power_kw
            ),
            battery_percent=Decimal(
                battery_percent
            ),
            battery_source="manual",
            battery_updated_at=datetime.now(
                timezone.utc
            ),
            is_default=default,
        )
        db.add(vehicle)
        db.flush()
    else:
        vehicle.nickname = nickname
        vehicle.model_year = model_year
        vehicle.battery_capacity_kwh = Decimal(
            battery_capacity_kwh
        )
        vehicle.connector_type = connector_type
        vehicle.max_dc_power_kw = Decimal(
            max_dc_power_kw
        )
        vehicle.battery_percent = Decimal(
            battery_percent
        )
        vehicle.battery_source = "manual"
        vehicle.battery_updated_at = datetime.now(
            timezone.utc
        )
        vehicle.is_default = default

    return vehicle


def _ensure_sample_driver(
    db: Session,
) -> auth_models.User:
    user = (
        db.query(auth_models.User)
        .filter(
            auth_models.User.email
            == SAMPLE_DRIVER_EMAIL
        )
        .first()
    )

    if user is None:
        user = auth_models.User(
            email=SAMPLE_DRIVER_EMAIL,
            full_name="Sample Driver",
            hashed_password=(
                security.get_password_hash(
                    secrets.token_urlsafe(48)
                )
            ),
            is_active=True,
            is_superuser=False,
            is_demo=True,
        )
        db.add(user)
        db.flush()

    return user


def _remove_stale_sample_sessions(
    db: Session,
    *,
    driver_user_id: int,
    sample_user_id: int,
) -> None:
    legacy_user = (
        db.query(auth_models.User)
        .filter(
            auth_models.User.email
            == "demo@hermitedge.dev",
            auth_models.User.is_demo.is_(True),
        )
        .first()
    )

    stale_query = db.query(
        models.ChargingSession.id
    ).filter(
        models.ChargingSession.user_id.in_(
            [driver_user_id, sample_user_id]
        ),
        models.ChargingSession.status.in_(
            (
                "payment_pending",
                "ready",
                "charging",
            )
        ),
        models.ChargingSession.idempotency_key
        != "seed-active-ayala-v1",
    )

    session_ids = [
        session_id
        for (session_id,) in stale_query.all()
    ]

    if legacy_user is not None:
        session_ids.extend(
            session_id
            for (session_id,) in db.query(
                models.ChargingSession.id
            )
            .filter(
                models.ChargingSession.user_id
                == legacy_user.id
            )
            .all()
        )

    session_ids = list(dict.fromkeys(session_ids))

    if not session_ids:
        return

    (
        db.query(models.ChargingSessionEvent)
        .filter(
            models.ChargingSessionEvent.session_id.in_(
                session_ids
            )
        )
        .delete(synchronize_session=False)
    )
    (
        db.query(models.ChargingPayment)
        .filter(
            models.ChargingPayment.session_id.in_(
                session_ids
            )
        )
        .delete(synchronize_session=False)
    )
    (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.id.in_(
                session_ids
            )
        )
        .delete(synchronize_session=False)
    )


def _maps_url(
    latitude: Decimal,
    longitude: Decimal,
) -> str:
    return (
        "https://www.google.com/maps/"
        "dir/?api=1&destination="
        f"{latitude},{longitude}"
    )


def _ensure_stations(
    db: Session,
    network_id: str,
    now: datetime,
) -> dict[
    tuple[str, int],
    models.ChargerConnector,
]:
    connector_map: dict[
        tuple[str, int],
        models.ChargerConnector,
    ] = {}

    for station_data in STATIONS:
        location = (
            db.query(models.ChargingLocation)
            .filter(
                models.ChargingLocation.network_id
                == network_id,
                models.ChargingLocation.name
                == station_data["name"],
            )
            .first()
        )

        if location is None:
            location = models.ChargingLocation(
                network_id=network_id,
                name=station_data["name"],
                address=station_data["address"],
                city=station_data["city"],
                country_code="PH",
                timezone="Asia/Manila",
                latitude=station_data["latitude"],
                longitude=station_data["longitude"],
                google_maps_url=_maps_url(
                    station_data["latitude"],
                    station_data["longitude"],
                ),
                status="active",
                is_public=True,
            )
            db.add(location)
            db.flush()
        else:
            location.address = (
                station_data["address"]
            )
            location.city = station_data["city"]
            location.country_code = "PH"
            location.timezone = "Asia/Manila"
            location.latitude = (
                station_data["latitude"]
            )
            location.longitude = (
                station_data["longitude"]
            )
            location.google_maps_url = _maps_url(
                station_data["latitude"],
                station_data["longitude"],
            )
            location.status = "active"
            location.is_public = True

        for charger_data in station_data[
            "chargers"
        ]:
            charger = (
                db.query(models.Charger)
                .filter(
                    models.Charger.location_id
                    == location.id,
                    models.Charger.external_id
                    == charger_data["external_id"],
                )
                .first()
            )

            last_seen_at = (
                now
                - timedelta(
                    seconds=charger_data[
                        "last_seen_seconds"
                    ]
                )
            )

            if charger is None:
                charger = models.Charger(
                    location_id=location.id,
                    external_id=charger_data[
                        "external_id"
                    ],
                    display_name=charger_data[
                        "display_name"
                    ],
                    manufacturer=charger_data[
                        "manufacturer"
                    ],
                    model=charger_data["model"],
                    serial_number=charger_data[
                        "serial_number"
                    ],
                    protocol=charger_data[
                        "protocol"
                    ],
                    connection_status=charger_data[
                        "connection_status"
                    ],
                    last_seen_at=last_seen_at,
                )
                db.add(charger)
                db.flush()
            else:
                charger.display_name = charger_data[
                    "display_name"
                ]
                charger.manufacturer = charger_data[
                    "manufacturer"
                ]
                charger.model = charger_data["model"]
                charger.serial_number = charger_data[
                    "serial_number"
                ]
                charger.protocol = charger_data[
                    "protocol"
                ]
                charger.connection_status = (
                    charger_data[
                        "connection_status"
                    ]
                )
                charger.last_seen_at = last_seen_at

            for (
                number,
                connector_type,
                power,
                price,
                connector_status,
            ) in charger_data["connectors"]:
                connector = (
                    db.query(
                        models.ChargerConnector
                    )
                    .filter(
                        models.ChargerConnector.charger_id
                        == charger.id,
                        models.ChargerConnector.connector_number
                        == number,
                    )
                    .first()
                )

                desired_power = Decimal(power)
                desired_price = Decimal(price)

                if connector is None:
                    connector = (
                        models.ChargerConnector(
                            charger_id=charger.id,
                            connector_number=number,
                            connector_type=(
                                connector_type
                            ),
                            max_power_kw=desired_power,
                            price_per_kwh=desired_price,
                            status=connector_status,
                        )
                    )
                    db.add(connector)
                    db.flush()
                else:
                    changed = False

                    if (
                        connector.connector_type
                        != connector_type
                    ):
                        connector.connector_type = (
                            connector_type
                        )
                        changed = True

                    if (
                        Decimal(
                            str(
                                connector.max_power_kw
                            )
                        )
                        != desired_power
                    ):
                        connector.max_power_kw = (
                            desired_power
                        )
                        changed = True

                    if (
                        Decimal(
                            str(
                                connector.price_per_kwh
                            )
                        )
                        != desired_price
                    ):
                        connector.price_per_kwh = (
                            desired_price
                        )
                        changed = True

                    has_active_session = (
                        db.query(models.ChargingSession.id)
                        .filter(
                            models.ChargingSession.connector_id
                            == connector.id,
                            models.ChargingSession.status.in_(
                                (
                                    "payment_pending",
                                    "ready",
                                    "charging",
                                )
                            ),
                        )
                        .first()
                        is not None
                    )

                    if (
                        not has_active_session
                        and connector.status
                        != connector_status
                    ):
                        connector.status = (
                            connector_status
                        )
                        changed = True

                    if changed:
                        connector.version = (
                            connector.version + 1
                        )

                connector_map[
                    (
                        charger.external_id,
                        number,
                    )
                ] = connector

    return connector_map


def _ensure_completed_session(
    db: Session,
    *,
    user_id: int,
    vehicle_id: str,
    connector: models.ChargerConnector,
    station_name: str,
    key: str,
    started_at: datetime,
    minutes: int,
    start_battery: str,
    target_battery: str,
    energy_kwh: str,
    payment_method: str,
) -> None:
    energy = Decimal(energy_kwh)
    total = (
        energy
        * Decimal(str(connector.price_per_kwh))
    ).quantize(Decimal("0.01"))
    completed_at = started_at + timedelta(
        minutes=minutes
    )

    existing = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.user_id
            == user_id,
            models.ChargingSession.idempotency_key
            == key,
        )
        .first()
    )

    if existing:
        existing.vehicle_profile_id = vehicle_id
        existing.connector_id = connector.id
        existing.status = "completed"
        existing.station_name_snapshot = station_name
        existing.connector_type_snapshot = (
            connector.connector_type
        )
        existing.unit_price_per_kwh = (
            connector.price_per_kwh
        )
        existing.start_battery_percent = Decimal(
            start_battery
        )
        existing.target_battery_percent = Decimal(
            target_battery
        )
        existing.meter_start_wh = 0
        existing.meter_end_wh = int(energy * 1000)
        existing.energy_kwh = energy
        existing.total_amount = total
        existing.authorized_at = (
            started_at - timedelta(minutes=2)
        )
        existing.started_at = started_at
        existing.completed_at = completed_at
        existing.created_at = (
            started_at - timedelta(minutes=3)
        )
        existing.updated_at = completed_at

        payment = (
            db.query(models.ChargingPayment)
            .filter(
                models.ChargingPayment.session_id
                == existing.id
            )
            .first()
        )

        if payment is not None:
            payment.method = payment_method
            payment.status = "captured"
            payment.amount = total
            payment.captured_at = completed_at
            payment.created_at = (
                started_at - timedelta(minutes=2)
            )
            payment.updated_at = completed_at

        return

    session = models.ChargingSession(
        user_id=user_id,
        vehicle_profile_id=vehicle_id,
        connector_id=connector.id,
        status="completed",
        idempotency_key=key,
        station_name_snapshot=station_name,
        connector_type_snapshot=(
            connector.connector_type
        ),
        currency_code="PHP",
        unit_price_per_kwh=(
            connector.price_per_kwh
        ),
        start_battery_percent=Decimal(
            start_battery
        ),
        target_battery_percent=Decimal(
            target_battery
        ),
        meter_start_wh=0,
        meter_end_wh=int(energy * 1000),
        energy_kwh=energy,
        total_amount=total,
        version=3,
        authorized_at=(
            started_at
            - timedelta(minutes=2)
        ),
        started_at=started_at,
        completed_at=completed_at,
        created_at=(
            started_at
            - timedelta(minutes=3)
        ),
        updated_at=completed_at,
    )

    db.add(session)
    db.flush()

    db.add(
        models.ChargingPayment(
            session_id=session.id,
            created_by_user_id=user_id,
            provider="sandbox",
            method=payment_method,
            status="captured",
            currency_code="PHP",
            amount=total,
            provider_reference=(
                f"sbx_{key[-16:]}"
            ),
            idempotency_key=key,
            captured_at=completed_at,
            created_at=(
                started_at
                - timedelta(minutes=2)
            ),
            updated_at=completed_at,
        )
    )

    db.add_all(
        [
            models.ChargingSessionEvent(
                session_id=session.id,
                version=1,
                actor_user_id=user_id,
                event_type="session_ready",
                detail={
                    "source": "synthetic",
                },
                idempotency_key=(
                    f"{key}:ready"
                ),
                created_at=(
                    started_at
                    - timedelta(minutes=2)
                ),
            ),
            models.ChargingSessionEvent(
                session_id=session.id,
                version=2,
                actor_user_id=user_id,
                event_type="charging_started",
                detail={
                    "source": "synthetic",
                },
                idempotency_key=(
                    f"{key}:start"
                ),
                created_at=started_at,
            ),
            models.ChargingSessionEvent(
                session_id=session.id,
                version=3,
                actor_user_id=user_id,
                event_type="charging_completed",
                detail={
                    "source": "synthetic",
                    "energy_kwh": str(energy),
                    "total_amount": str(total),
                },
                idempotency_key=(
                    f"{key}:complete"
                ),
                created_at=completed_at,
            ),
        ]
    )


def _ensure_active_session(
    db: Session,
    *,
    user_id: int,
    vehicle_id: str,
    connector: models.ChargerConnector,
    station_name: str,
    now: datetime,
) -> None:
    key = "seed-active-ayala-v1"
    started_at = now - timedelta(minutes=18)
    energy = Decimal("11.800")
    estimated_energy = Decimal("22.001")
    current_total = (
        energy
        * Decimal(str(connector.price_per_kwh))
    ).quantize(Decimal("0.01"))
    estimated_total = (
        estimated_energy
        * Decimal(str(connector.price_per_kwh))
    ).quantize(Decimal("0.01"))

    existing = (
        db.query(models.ChargingSession)
        .filter(
            models.ChargingSession.user_id
            == user_id,
            models.ChargingSession.idempotency_key
            == key,
        )
        .first()
    )

    if existing:
        if connector.status != "charging":
            connector.status = "charging"
            connector.version += 1
        existing.vehicle_profile_id = vehicle_id
        existing.connector_id = connector.id
        existing.status = "charging"
        existing.station_name_snapshot = station_name
        existing.connector_type_snapshot = (
            connector.connector_type
        )
        existing.unit_price_per_kwh = (
            connector.price_per_kwh
        )
        existing.start_battery_percent = Decimal(
            "31.00"
        )
        existing.target_battery_percent = Decimal(
            "80.00"
        )
        existing.meter_start_wh = 0
        existing.meter_end_wh = None
        existing.energy_kwh = energy
        existing.total_amount = current_total
        existing.version = 2
        existing.authorized_at = (
            started_at - timedelta(minutes=2)
        )
        existing.started_at = started_at
        existing.completed_at = None
        existing.created_at = (
            started_at - timedelta(minutes=3)
        )
        existing.updated_at = now

        payment = (
            db.query(models.ChargingPayment)
            .filter(
                models.ChargingPayment.session_id
                == existing.id
            )
            .first()
        )

        if payment is not None:
            payment.provider = "sandbox"
            payment.method = "qrph"
            payment.status = "authorized"
            payment.currency_code = "PHP"
            payment.amount = estimated_total
            payment.captured_at = None
            payment.created_at = (
                started_at - timedelta(minutes=2)
            )
            payment.updated_at = (
                started_at - timedelta(minutes=2)
            )

        events = (
            db.query(models.ChargingSessionEvent)
            .filter(
                models.ChargingSessionEvent.session_id
                == existing.id
            )
            .all()
        )

        for event in events:
            if event.event_type == "session_ready":
                event.created_at = (
                    started_at
                    - timedelta(minutes=2)
                )
                event.detail = {
                    "source": "synthetic",
                    "estimated_energy_kwh": str(
                        estimated_energy
                    ),
                    "effective_power_kw": "39.333",
                    "estimated_minutes": 34,
                    "estimated_total": str(
                        estimated_total
                    ),
                }
            elif event.event_type == "charging_started":
                event.created_at = started_at
                event.detail = {
                    "source": "synthetic"
                }

        return

    if connector.status != "available":
        return

    connector.status = "charging"
    connector.version += 1

    session = models.ChargingSession(
        user_id=user_id,
        vehicle_profile_id=vehicle_id,
        connector_id=connector.id,
        status="charging",
        idempotency_key=key,
        station_name_snapshot=station_name,
        connector_type_snapshot=(
            connector.connector_type
        ),
        currency_code="PHP",
        unit_price_per_kwh=(
            connector.price_per_kwh
        ),
        start_battery_percent=Decimal(
            "31.00"
        ),
        target_battery_percent=Decimal(
            "80.00"
        ),
        meter_start_wh=0,
        energy_kwh=energy,
        total_amount=current_total,
        version=2,
        authorized_at=(
            started_at
            - timedelta(minutes=2)
        ),
        started_at=started_at,
        created_at=(
            started_at
            - timedelta(minutes=3)
        ),
        updated_at=now,
    )

    db.add(session)
    db.flush()

    db.add(
        models.ChargingPayment(
            session_id=session.id,
            created_by_user_id=user_id,
            provider="sandbox",
            method="qrph",
            status="authorized",
            currency_code="PHP",
            amount=estimated_total,
            provider_reference=(
                "sbx_seed_active_ayala"
            ),
            idempotency_key=key,
            created_at=(
                started_at
                - timedelta(minutes=2)
            ),
            updated_at=(
                started_at
                - timedelta(minutes=2)
            ),
        )
    )

    db.add_all(
        [
            models.ChargingSessionEvent(
                session_id=session.id,
                version=1,
                actor_user_id=user_id,
                event_type="session_ready",
                detail={
                    "source": "synthetic",
                    "estimated_energy_kwh": (
                        str(estimated_energy)
                    ),
                    "effective_power_kw": "39.333",
                    "estimated_minutes": 34,
                    "estimated_total": (
                        str(estimated_total)
                    ),
                },
                idempotency_key=(
                    f"{key}:ready"
                ),
                created_at=(
                    started_at
                    - timedelta(minutes=2)
                ),
            ),
            models.ChargingSessionEvent(
                session_id=session.id,
                version=2,
                actor_user_id=user_id,
                event_type="charging_started",
                detail={
                    "source": "synthetic",
                },
                idempotency_key=(
                    f"{key}:start"
                ),
                created_at=started_at,
            ),
        ]
    )


def seed_recording_workspace(
    db: Session,
    *,
    driver_user_id: int,
    owner_user_id: int,
) -> str:
    now = datetime.now(timezone.utc)

    network = _ensure_network(db)

    _ensure_membership(
        db,
        network.id,
        owner_user_id,
    )

    (
        db.query(models.ChargingNetworkMember)
        .filter(
            models.ChargingNetworkMember.network_id
            == network.id,
            models.ChargingNetworkMember.user_id
            == driver_user_id,
        )
        .delete(synchronize_session=False)
    )

    driver_vehicle = _ensure_vehicle(
        db,
        driver_user_id,
        nickname="Atto",
        make="BYD",
        model_name="Atto 3",
        model_year=2025,
        battery_capacity_kwh="60.48",
        connector_type="CCS2",
        max_dc_power_kw="88.00",
        battery_percent="42.00",
        default=True,
    )

    _ensure_vehicle(
        db,
        driver_user_id,
        nickname="Ioniq",
        make="Hyundai",
        model_name="Ioniq 5",
        model_year=2025,
        battery_capacity_kwh="84.00",
        connector_type="CCS2",
        max_dc_power_kw="260.00",
        battery_percent="68.00",
        default=False,
    )

    sample_user = _ensure_sample_driver(db)

    _remove_stale_sample_sessions(
        db,
        driver_user_id=driver_user_id,
        sample_user_id=sample_user.id,
    )

    sample_vehicle = _ensure_vehicle(
        db,
        sample_user.id,
        nickname="Dolphin",
        make="BYD",
        model_name="Dolphin",
        model_year=2025,
        battery_capacity_kwh="44.90",
        connector_type="CCS2",
        max_dc_power_kw="60.00",
        battery_percent="31.00",
        default=True,
    )

    connectors = _ensure_stations(
        db,
        network.id,
        now,
    )

    _ensure_completed_session(
        db,
        user_id=driver_user_id,
        vehicle_id=driver_vehicle.id,
        connector=connectors[
            ("MNL-BGC-DC-01", 1)
        ],
        station_name="BGC Central",
        key="seed-completed-bgc-v1",
        started_at=now - timedelta(hours=2),
        minutes=27,
        start_battery="34.00",
        target_battery="72.00",
        energy_kwh="22.982",
        payment_method="qrph",
    )

    _ensure_completed_session(
        db,
        user_id=driver_user_id,
        vehicle_id=driver_vehicle.id,
        connector=connectors[
            ("MNL-PSY-DC-01", 1)
        ],
        station_name="MOA Bay",
        key="seed-completed-moa-v1",
        started_at=(
            now
            - timedelta(days=1, hours=3)
        ),
        minutes=19,
        start_battery="46.00",
        target_battery="80.00",
        energy_kwh="20.563",
        payment_method="qrph",
    )

    _ensure_completed_session(
        db,
        user_id=driver_user_id,
        vehicle_id=driver_vehicle.id,
        connector=connectors[
            ("MNL-QC-DC-01", 1)
        ],
        station_name="North Avenue",
        key="seed-completed-qc-v1",
        started_at=(
            now
            - timedelta(days=3, hours=2)
        ),
        minutes=24,
        start_battery="28.00",
        target_battery="66.00",
        energy_kwh="22.982",
        payment_method="card",
    )

    _ensure_completed_session(
        db,
        user_id=sample_user.id,
        vehicle_id=sample_vehicle.id,
        connector=connectors[
            ("MNL-BGC-DC-01", 1)
        ],
        station_name="BGC Central",
        key="seed-network-bgc-morning-v2",
        started_at=now - timedelta(hours=8),
        minutes=23,
        start_battery="29.00",
        target_battery="70.00",
        energy_kwh="18.400",
        payment_method="qrph",
    )

    _ensure_completed_session(
        db,
        user_id=sample_user.id,
        vehicle_id=sample_vehicle.id,
        connector=connectors[
            ("MNL-PSY-DC-01", 1)
        ],
        station_name="MOA Bay",
        key="seed-network-moa-midday-v2",
        started_at=(
            now - timedelta(hours=5, minutes=30)
        ),
        minutes=31,
        start_battery="22.00",
        target_battery="79.00",
        energy_kwh="25.600",
        payment_method="qrph",
    )

    _ensure_completed_session(
        db,
        user_id=sample_user.id,
        vehicle_id=sample_vehicle.id,
        connector=connectors[
            ("MNL-ALB-DC-01", 1)
        ],
        station_name="Alabang Central",
        key="seed-network-alabang-afternoon-v1",
        started_at=(
            now
            - timedelta(hours=4, minutes=15)
        ),
        minutes=29,
        start_battery="34.00",
        target_battery="72.00",
        energy_kwh="17.062",
        payment_method="qrph",
    )

    _ensure_completed_session(
        db,
        user_id=sample_user.id,
        vehicle_id=sample_vehicle.id,
        connector=connectors[
            ("MNL-QC-DC-01", 1)
        ],
        station_name="North Avenue",
        key="seed-network-north-afternoon-v2",
        started_at=now - timedelta(hours=3),
        minutes=34,
        start_battery="18.00",
        target_battery="82.00",
        energy_kwh="28.800",
        payment_method="card",
    )

    _ensure_active_session(
        db,
        user_id=sample_user.id,
        vehicle_id=sample_vehicle.id,
        connector=connectors[
            ("MNL-MKT-DC-01", 1)
        ],
        station_name="Ayala Triangle",
        now=now,
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()

        existing = (
            db.query(models.ChargingNetwork)
            .filter(
                models.ChargingNetwork.slug
                == NETWORK_SLUG
            )
            .first()
        )

        if existing:
            return existing.id

        raise RuntimeError(
            "Recording workspace could not be created"
        ) from exc

    return network.id
