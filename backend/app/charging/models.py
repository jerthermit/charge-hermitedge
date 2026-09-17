from __future__ import annotations

import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ChargingNetwork(Base):
    __tablename__ = "charging_networks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('setup', 'active', 'suspended')",
            name="ck_charging_network_status",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(160), nullable=False)
    slug = Column(String(120), nullable=False, unique=True, index=True)
    status = Column(String(24), nullable=False, default="setup")
    currency_code = Column(String(3), nullable=False, default="PHP")
    country_code = Column(String(2), nullable=False, default="PH")
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChargingNetworkMember(Base):
    __tablename__ = "charging_network_members"
    __table_args__ = (
        UniqueConstraint(
            "network_id",
            "user_id",
            name="uq_charging_network_member",
        ),
        CheckConstraint(
            "role IN ('owner', 'manager', 'viewer')",
            name="ck_charging_network_member_role",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    network_id = Column(
        String(36),
        ForeignKey("charging_networks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(24), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class ChargingLocation(Base):
    __tablename__ = "charging_locations"
    __table_args__ = (
        UniqueConstraint(
            "network_id",
            "name",
            name="uq_charging_location_network_name",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'offline')",
            name="ck_charging_location_status",
        ),
        CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name="ck_charging_location_latitude",
        ),
        CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name="ck_charging_location_longitude",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    network_id = Column(
        String(36),
        ForeignKey("charging_networks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(180), nullable=False)
    address = Column(Text, nullable=False)
    city = Column(String(100), nullable=False)
    country_code = Column(String(2), nullable=False, default="PH")
    timezone = Column(
        String(64),
        nullable=False,
        default="Asia/Manila",
    )
    latitude = Column(Numeric(9, 6), nullable=False)
    longitude = Column(Numeric(9, 6), nullable=False)
    google_place_id = Column(String(255), nullable=True)
    google_maps_url = Column(Text, nullable=True)
    status = Column(String(24), nullable=False, default="draft")
    is_public = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Charger(Base):
    __tablename__ = "chargers"
    __table_args__ = (
        UniqueConstraint(
            "location_id",
            "external_id",
            name="uq_charger_location_external_id",
        ),
        CheckConstraint(
            "connection_status IN "
            "('pending', 'online', 'offline', 'maintenance')",
            name="ck_charger_connection_status",
        ),
        CheckConstraint(
            "protocol IN ('unconnected', 'ocpp_1_6j', 'ocpp_2_0_1')",
            name="ck_charger_protocol",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    location_id = Column(
        String(36),
        ForeignKey("charging_locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id = Column(String(120), nullable=False)
    display_name = Column(String(160), nullable=False)
    manufacturer = Column(String(120), nullable=True)
    model = Column(String(120), nullable=True)
    serial_number = Column(String(160), nullable=True)
    protocol = Column(
        String(24),
        nullable=False,
        default="unconnected",
    )
    connection_status = Column(
        String(24),
        nullable=False,
        default="pending",
    )
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChargerConnector(Base):
    __tablename__ = "charger_connectors"
    __table_args__ = (
        UniqueConstraint(
            "charger_id",
            "connector_number",
            name="uq_charger_connector_number",
        ),
        CheckConstraint(
            "connector_type IN "
            "('CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'NACS', 'OTHER')",
            name="ck_charger_connector_type",
        ),
        CheckConstraint(
            "status IN "
            "('available', 'reserved', 'charging', 'offline')",
            name="ck_charger_connector_status",
        ),
        CheckConstraint(
            "max_power_kw > 0",
            name="ck_charger_connector_power",
        ),
        CheckConstraint(
            "price_per_kwh >= 0",
            name="ck_charger_connector_price",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    charger_id = Column(
        String(36),
        ForeignKey("chargers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_number = Column(Integer, nullable=False)
    connector_type = Column(String(24), nullable=False)
    max_power_kw = Column(Numeric(8, 2), nullable=False)
    price_per_kwh = Column(Numeric(10, 2), nullable=False)
    status = Column(
        String(24),
        nullable=False,
        default="offline",
    )
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class VehicleProfile(Base):
    __tablename__ = "vehicle_profiles"
    __table_args__ = (
        CheckConstraint(
            "connector_type IN "
            "('CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'NACS', 'OTHER')",
            name="ck_vehicle_connector_type",
        ),
        CheckConstraint(
            "battery_percent IS NULL OR "
            "(battery_percent >= 0 AND battery_percent <= 100)",
            name="ck_vehicle_battery_percent",
        ),
        CheckConstraint(
            "battery_source IN ('manual', 'vehicle_api')",
            name="ck_vehicle_battery_source",
        ),
        CheckConstraint(
            "battery_capacity_kwh > 0",
            name="ck_vehicle_battery_capacity",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nickname = Column(String(100), nullable=True)
    make = Column(String(100), nullable=False)
    model = Column(String(120), nullable=False)
    model_year = Column(Integer, nullable=True)
    battery_capacity_kwh = Column(Numeric(8, 2), nullable=False)
    connector_type = Column(String(24), nullable=False)
    max_dc_power_kw = Column(Numeric(8, 2), nullable=False)
    battery_percent = Column(Numeric(5, 2), nullable=True)
    battery_source = Column(
        String(24),
        nullable=False,
        default="manual",
    )
    is_default = Column(Boolean, nullable=False, default=False)
    battery_updated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChargingSession(Base):
    __tablename__ = "charging_sessions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_charging_session_user_idempotency",
        ),
        CheckConstraint(
            "status IN "
            "('payment_pending', 'ready', 'charging', "
            "'completed', 'cancelled', 'failed')",
            name="ck_charging_session_status",
        ),
        CheckConstraint(
            "start_battery_percent IS NULL OR "
            "(start_battery_percent >= 0 "
            "AND start_battery_percent <= 100)",
            name="ck_charging_session_start_battery",
        ),
        CheckConstraint(
            "target_battery_percent IS NULL OR "
            "(target_battery_percent >= 0 "
            "AND target_battery_percent <= 100)",
            name="ck_charging_session_target_battery",
        ),
        CheckConstraint(
            "energy_kwh >= 0",
            name="ck_charging_session_energy",
        ),
        CheckConstraint(
            "total_amount >= 0",
            name="ck_charging_session_total",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    vehicle_profile_id = Column(
        String(36),
        ForeignKey("vehicle_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    connector_id = Column(
        String(36),
        ForeignKey("charger_connectors.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(
        String(24),
        nullable=False,
        default="payment_pending",
    )
    idempotency_key = Column(String(120), nullable=False)
    station_name_snapshot = Column(String(180), nullable=False)
    connector_type_snapshot = Column(String(24), nullable=False)
    currency_code = Column(String(3), nullable=False, default="PHP")
    unit_price_per_kwh = Column(Numeric(10, 2), nullable=False)
    start_battery_percent = Column(Numeric(5, 2), nullable=True)
    target_battery_percent = Column(Numeric(5, 2), nullable=True)
    meter_start_wh = Column(Integer, nullable=True)
    meter_end_wh = Column(Integer, nullable=True)
    energy_kwh = Column(
        Numeric(10, 3),
        nullable=False,
        default=0,
    )
    total_amount = Column(
        Numeric(12, 2),
        nullable=False,
        default=0,
    )
    version = Column(Integer, nullable=False, default=1)
    authorized_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChargingPayment(Base):
    __tablename__ = "charging_payments"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_charging_payment_session_idempotency",
        ),
        CheckConstraint(
            "provider IN ('sandbox')",
            name="ck_charging_payment_provider",
        ),
        CheckConstraint(
            "method IN ('qrph', 'card')",
            name="ck_charging_payment_method",
        ),
        CheckConstraint(
            "status IN "
            "('pending', 'authorized', 'captured', 'failed', 'refunded')",
            name="ck_charging_payment_status",
        ),
        CheckConstraint(
            "amount >= 0",
            name="ck_charging_payment_amount",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    session_id = Column(
        String(36),
        ForeignKey("charging_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    provider = Column(String(24), nullable=False)
    method = Column(String(24), nullable=False)
    status = Column(String(24), nullable=False, default="pending")
    currency_code = Column(String(3), nullable=False, default="PHP")
    amount = Column(Numeric(12, 2), nullable=False)
    provider_reference = Column(String(180), nullable=True)
    idempotency_key = Column(String(120), nullable=False)
    failure_code = Column(String(80), nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChargingSessionEvent(Base):
    __tablename__ = "charging_session_events"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "version",
            name="uq_charging_session_event_version",
        ),
        UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_charging_session_event_idempotency",
        ),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    session_id = Column(
        String(36),
        ForeignKey("charging_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, nullable=False)
    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type = Column(String(80), nullable=False)
    detail = Column(JSON, nullable=False, default=dict)
    idempotency_key = Column(String(120), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
