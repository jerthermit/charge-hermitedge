"""Create the initial Charge schema.

Revision ID: 0001_charge
Revises: none
Create Date: 2026-09-17 18:23:56.291552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_charge"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "charging_networks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('setup', 'active', 'suspended')",
            name="ck_charging_network_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_charging_networks_slug"), "charging_networks", ["slug"], unique=True
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("is_superuser", sa.Boolean(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_full_name"), "users", ["full_name"], unique=False)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_table(
        "charging_locations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("network_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("latitude", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("longitude", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("google_place_id", sa.String(length=255), nullable=True),
        sa.Column("google_maps_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'offline')",
            name="ck_charging_location_status",
        ),
        sa.CheckConstraint(
            "latitude BETWEEN -90 AND 90", name="ck_charging_location_latitude"
        ),
        sa.CheckConstraint(
            "longitude BETWEEN -180 AND 180", name="ck_charging_location_longitude"
        ),
        sa.ForeignKeyConstraint(
            ["network_id"], ["charging_networks.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "network_id", "name", name="uq_charging_location_network_name"
        ),
    )
    op.create_index(
        op.f("ix_charging_locations_network_id"),
        "charging_locations",
        ["network_id"],
        unique=False,
    )
    op.create_table(
        "charging_network_members",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'manager', 'viewer')",
            name="ck_charging_network_member_role",
        ),
        sa.ForeignKeyConstraint(
            ["network_id"], ["charging_networks.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("network_id", "user_id", name="uq_charging_network_member"),
    )
    op.create_index(
        op.f("ix_charging_network_members_network_id"),
        "charging_network_members",
        ["network_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_charging_network_members_user_id"),
        "charging_network_members",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "vehicle_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("nickname", sa.String(length=100), nullable=True),
        sa.Column("make", sa.String(length=100), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("model_year", sa.Integer(), nullable=True),
        sa.Column(
            "battery_capacity_kwh", sa.Numeric(precision=8, scale=2), nullable=False
        ),
        sa.Column("connector_type", sa.String(length=24), nullable=False),
        sa.Column("max_dc_power_kw", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("battery_percent", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("battery_source", sa.String(length=24), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("battery_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "battery_source IN ('manual', 'vehicle_api')",
            name="ck_vehicle_battery_source",
        ),
        sa.CheckConstraint(
            "connector_type IN ('CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'NACS', 'OTHER')",
            name="ck_vehicle_connector_type",
        ),
        sa.CheckConstraint(
            "battery_capacity_kwh > 0", name="ck_vehicle_battery_capacity"
        ),
        sa.CheckConstraint(
            "battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)",
            name="ck_vehicle_battery_percent",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vehicle_profiles_user_id"),
        "vehicle_profiles",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "chargers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("location_id", sa.String(length=36), nullable=False),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("manufacturer", sa.String(length=120), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("serial_number", sa.String(length=160), nullable=True),
        sa.Column("protocol", sa.String(length=24), nullable=False),
        sa.Column("connection_status", sa.String(length=24), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "connection_status IN ('pending', 'online', 'offline', 'maintenance')",
            name="ck_charger_connection_status",
        ),
        sa.CheckConstraint(
            "protocol IN ('unconnected', 'ocpp_1_6j', 'ocpp_2_0_1')",
            name="ck_charger_protocol",
        ),
        sa.ForeignKeyConstraint(
            ["location_id"], ["charging_locations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "location_id", "external_id", name="uq_charger_location_external_id"
        ),
    )
    op.create_index(
        op.f("ix_chargers_location_id"), "chargers", ["location_id"], unique=False
    )
    op.create_table(
        "charger_connectors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("charger_id", sa.String(length=36), nullable=False),
        sa.Column("connector_number", sa.Integer(), nullable=False),
        sa.Column("connector_type", sa.String(length=24), nullable=False),
        sa.Column("max_power_kw", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("price_per_kwh", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "connector_type IN ('CCS2', 'TYPE_2', 'CHADEMO', 'GB_T', 'NACS', 'OTHER')",
            name="ck_charger_connector_type",
        ),
        sa.CheckConstraint(
            "status IN ('available', 'reserved', 'charging', 'offline')",
            name="ck_charger_connector_status",
        ),
        sa.CheckConstraint("max_power_kw > 0", name="ck_charger_connector_power"),
        sa.CheckConstraint("price_per_kwh >= 0", name="ck_charger_connector_price"),
        sa.ForeignKeyConstraint(["charger_id"], ["chargers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "charger_id", "connector_number", name="uq_charger_connector_number"
        ),
    )
    op.create_index(
        op.f("ix_charger_connectors_charger_id"),
        "charger_connectors",
        ["charger_id"],
        unique=False,
    )
    op.create_table(
        "charging_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("vehicle_profile_id", sa.String(length=36), nullable=True),
        sa.Column("connector_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("station_name_snapshot", sa.String(length=180), nullable=False),
        sa.Column("connector_type_snapshot", sa.String(length=24), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column(
            "unit_price_per_kwh", sa.Numeric(precision=10, scale=2), nullable=False
        ),
        sa.Column(
            "start_battery_percent", sa.Numeric(precision=5, scale=2), nullable=True
        ),
        sa.Column(
            "target_battery_percent", sa.Numeric(precision=5, scale=2), nullable=True
        ),
        sa.Column("meter_start_wh", sa.Integer(), nullable=True),
        sa.Column("meter_end_wh", sa.Integer(), nullable=True),
        sa.Column("energy_kwh", sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('payment_pending', 'ready', 'charging', 'completed', 'cancelled', 'failed')",
            name="ck_charging_session_status",
        ),
        sa.CheckConstraint("energy_kwh >= 0", name="ck_charging_session_energy"),
        sa.CheckConstraint(
            "start_battery_percent IS NULL OR (start_battery_percent >= 0 AND start_battery_percent <= 100)",
            name="ck_charging_session_start_battery",
        ),
        sa.CheckConstraint(
            "target_battery_percent IS NULL OR (target_battery_percent >= 0 AND target_battery_percent <= 100)",
            name="ck_charging_session_target_battery",
        ),
        sa.CheckConstraint("total_amount >= 0", name="ck_charging_session_total"),
        sa.ForeignKeyConstraint(
            ["connector_id"], ["charger_connectors.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["vehicle_profile_id"], ["vehicle_profiles.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "idempotency_key", name="uq_charging_session_user_idempotency"
        ),
    )
    op.create_index(
        op.f("ix_charging_sessions_connector_id"),
        "charging_sessions",
        ["connector_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_charging_sessions_user_id"),
        "charging_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "charging_payments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("method", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("provider_reference", sa.String(length=180), nullable=True),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "method IN ('qrph', 'card')", name="ck_charging_payment_method"
        ),
        sa.CheckConstraint(
            "provider IN ('sandbox')", name="ck_charging_payment_provider"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'authorized', 'captured', 'failed', 'refunded')",
            name="ck_charging_payment_status",
        ),
        sa.CheckConstraint("amount >= 0", name="ck_charging_payment_amount"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["charging_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_charging_payment_session_idempotency",
        ),
    )
    op.create_index(
        op.f("ix_charging_payments_session_id"),
        "charging_payments",
        ["session_id"],
        unique=False,
    )
    op.create_table(
        "charging_session_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["session_id"], ["charging_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_charging_session_event_idempotency",
        ),
        sa.UniqueConstraint(
            "session_id", "version", name="uq_charging_session_event_version"
        ),
    )
    op.create_index(
        op.f("ix_charging_session_events_session_id"),
        "charging_session_events",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_charging_session_events_session_id"),
        table_name="charging_session_events",
    )
    op.drop_table("charging_session_events")
    op.drop_index(
        op.f("ix_charging_payments_session_id"), table_name="charging_payments"
    )
    op.drop_table("charging_payments")
    op.drop_index(op.f("ix_charging_sessions_user_id"), table_name="charging_sessions")
    op.drop_index(
        op.f("ix_charging_sessions_connector_id"), table_name="charging_sessions"
    )
    op.drop_table("charging_sessions")
    op.drop_index(
        op.f("ix_charger_connectors_charger_id"), table_name="charger_connectors"
    )
    op.drop_table("charger_connectors")
    op.drop_index(op.f("ix_chargers_location_id"), table_name="chargers")
    op.drop_table("chargers")
    op.drop_index(op.f("ix_vehicle_profiles_user_id"), table_name="vehicle_profiles")
    op.drop_table("vehicle_profiles")
    op.drop_index(
        op.f("ix_charging_network_members_user_id"),
        table_name="charging_network_members",
    )
    op.drop_index(
        op.f("ix_charging_network_members_network_id"),
        table_name="charging_network_members",
    )
    op.drop_table("charging_network_members")
    op.drop_index(
        op.f("ix_charging_locations_network_id"), table_name="charging_locations"
    )
    op.drop_table("charging_locations")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_full_name"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_charging_networks_slug"), table_name="charging_networks")
    op.drop_table("charging_networks")
