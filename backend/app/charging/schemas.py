from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AppMode = Literal["find", "manage"]
MemberRole = Literal["owner", "manager", "viewer"]
NetworkStatus = Literal["setup", "active", "suspended"]
LocationStatus = Literal["draft", "active", "offline"]
ChargerProtocol = Literal["unconnected", "ocpp_1_6j", "ocpp_2_0_1"]
ConnectionStatus = Literal["pending", "online", "offline", "maintenance"]
ConnectorType = Literal["CCS2", "TYPE_2", "CHADEMO", "GB_T", "NACS", "OTHER"]
ConnectorStatus = Literal["available", "reserved", "charging", "offline"]
ManagerConnectorStatus = Literal["available", "offline"]
BatterySource = Literal["manual", "vehicle_api"]
SessionStatus = Literal[
    "payment_pending",
    "ready",
    "charging",
    "completed",
    "cancelled",
    "failed",
]
PaymentMethod = Literal["qrph", "card"]
PaymentProvider = Literal["sandbox"]
PaymentStatus = Literal[
    "pending",
    "authorized",
    "captured",
    "failed",
    "refunded",
]
DataMode = Literal["live", "replayed", "simulated", "synthetic"]
AiAnswerStatus = Literal["answered", "insufficient_data", "unavailable"]
ChargePlanPriority = Literal[
    "balanced",
    "fastest",
    "cheapest",
    "nearest",
    "farthest",
]
Percentage = Annotated[
    Decimal,
    Field(ge=0, le=100, max_digits=5, decimal_places=2),
]
PositivePower = Annotated[
    Decimal,
    Field(gt=0, max_digits=8, decimal_places=2),
]
Money = Annotated[
    Decimal,
    Field(ge=0, max_digits=12, decimal_places=2),
]
Energy = Annotated[
    Decimal,
    Field(ge=0, max_digits=10, decimal_places=3),
]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class NetworkAccessRead(ApiModel):
    network_id: str
    network_name: str
    role: MemberRole


class AccountAccessRead(ApiModel):
    can_find: bool
    can_manage: bool
    default_mode: AppMode | None = None
    networks: list[NetworkAccessRead] = Field(default_factory=list)


class SourceStateRead(ApiModel):
    charging: DataMode
    routing: Literal["google_maps", "unavailable"]
    payments: Literal["sandbox", "live"]
    assistant: Literal["together", "unavailable"]


class NetworkRead(ApiModel):
    id: str
    name: str
    slug: str
    status: NetworkStatus
    currency_code: str
    country_code: str
    created_at: datetime
    updated_at: datetime


class VehicleCreate(ApiModel):
    nickname: str | None = Field(default=None, max_length=100)
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=120)
    model_year: int | None = Field(default=None, ge=2008, le=2100)
    battery_capacity_kwh: PositivePower
    connector_type: ConnectorType
    max_dc_power_kw: PositivePower
    battery_percent: Percentage | None = None
    is_default: bool = False


class VehicleUpdate(ApiModel):
    nickname: str | None = Field(default=None, max_length=100)
    make: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    model_year: int | None = Field(default=None, ge=2008, le=2100)
    battery_capacity_kwh: PositivePower | None = None
    connector_type: ConnectorType | None = None
    max_dc_power_kw: PositivePower | None = None
    is_default: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> VehicleUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one vehicle field to update")
        return self


class VehicleBatteryUpdate(ApiModel):
    battery_percent: Percentage


class VehicleRead(ApiModel):
    id: str
    nickname: str | None
    make: str
    model: str
    model_year: int | None
    battery_capacity_kwh: Decimal
    connector_type: ConnectorType
    max_dc_power_kw: Decimal
    battery_percent: Decimal | None
    battery_source: BatterySource
    is_default: bool
    battery_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RouteRead(ApiModel):
    distance_km: Decimal | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0)
    maps_url: str | None = None
    source: Literal["google_maps", "unavailable"]
    updated_at: datetime | None = None


class PublicConnectorRead(ApiModel):
    id: str
    charger_id: str
    charger_name: str
    connector_number: int
    connector_type: ConnectorType
    max_power_kw: Decimal
    price_per_kwh: Decimal
    currency_code: str
    status: ConnectorStatus
    compatible: bool
    version: int = Field(ge=1)
    updated_at: datetime


class StationRead(ApiModel):
    id: str
    network_name: str
    name: str
    address: str
    city: str
    latitude: Decimal
    longitude: Decimal
    google_maps_url: str | None
    available_connector_count: int = Field(ge=0)
    connectors: list[PublicConnectorRead]
    route: RouteRead | None = None


class DriverWorkspaceRead(ApiModel):
    access: AccountAccessRead
    sources: SourceStateRead
    vehicles: list[VehicleRead]
    stations: list[StationRead]
    active_session: ChargingSessionRead | None = None


class LocationCreate(ApiModel):
    name: str = Field(min_length=1, max_length=180)
    address: str = Field(min_length=1, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    country_code: str = Field(default="PH", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Manila", min_length=1, max_length=64)
    latitude: Decimal = Field(ge=-90, le=90)
    longitude: Decimal = Field(ge=-180, le=180)
    google_place_id: str | None = Field(default=None, max_length=255)
    google_maps_url: str | None = Field(default=None, max_length=1000)
    is_public: bool = True

    @field_validator("country_code")
    @classmethod
    def normalize_country_code(cls, value: str) -> str:
        return value.upper()


class LocationUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    google_place_id: str | None = Field(default=None, max_length=255)
    google_maps_url: str | None = Field(default=None, max_length=1000)
    is_public: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> LocationUpdate:
        if not self.model_fields_set:
            raise ValueError("Provide at least one location field to update")
        return self


class ConnectorCreate(ApiModel):
    connector_number: int = Field(ge=1)
    connector_type: ConnectorType
    max_power_kw: PositivePower
    price_per_kwh: Money


class ChargerCreate(ApiModel):
    external_id: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=160)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=160)
    protocol: ChargerProtocol = "unconnected"
    connectors: list[ConnectorCreate] = Field(min_length=1, max_length=12)


class ConnectorPriceUpdate(ApiModel):
    price_per_kwh: Money
    expected_version: int = Field(ge=1)


class ConnectorStatusUpdate(ApiModel):
    status: ManagerConnectorStatus
    expected_version: int = Field(ge=1)


class ManagedConnectorRead(ApiModel):
    id: str
    charger_id: str
    connector_number: int
    connector_type: ConnectorType
    max_power_kw: Decimal
    price_per_kwh: Decimal
    status: ConnectorStatus
    version: int
    created_at: datetime
    updated_at: datetime


class ManagedChargerRead(ApiModel):
    id: str
    location_id: str
    external_id: str
    display_name: str
    manufacturer: str | None
    model: str | None
    serial_number: str | None
    protocol: ChargerProtocol
    connection_status: ConnectionStatus
    last_seen_at: datetime | None
    connectors: list[ManagedConnectorRead]
    created_at: datetime
    updated_at: datetime


class ManagedLocationRead(ApiModel):
    id: str
    network_id: str
    name: str
    address: str
    city: str
    country_code: str
    timezone: str
    latitude: Decimal
    longitude: Decimal
    google_place_id: str | None
    google_maps_url: str | None
    status: LocationStatus
    is_public: bool
    chargers: list[ManagedChargerRead]
    created_at: datetime
    updated_at: datetime


class ManagementMetricsRead(ApiModel):
    active_sessions: int = Field(ge=0)
    available_connectors: int = Field(ge=0)
    offline_connectors: int = Field(ge=0)
    energy_today_kwh: Energy
    revenue_today: Money
    currency_code: str


class ManagementWorkspaceRead(ApiModel):
    access: AccountAccessRead
    sources: SourceStateRead
    network: NetworkRead
    metrics: ManagementMetricsRead
    locations: list[ManagedLocationRead]
    recent_sessions: list[ChargingSessionRead]


class ChargeEstimateRequest(ApiModel):
    connector_id: str = Field(min_length=1, max_length=36)
    vehicle_profile_id: str = Field(min_length=1, max_length=36)
    target_battery_percent: Percentage


class ChargeEstimateRead(ApiModel):
    connector_id: str
    vehicle_profile_id: str
    station_name: str
    connector_type: ConnectorType
    start_battery_percent: Decimal
    target_battery_percent: Decimal
    estimated_energy_kwh: Decimal
    effective_power_kw: Decimal
    estimated_minutes: int = Field(ge=0)
    price_per_kwh: Decimal
    estimated_total: Decimal
    currency_code: str
    calculated_at: datetime


class SessionStartRequest(ApiModel):
    connector_id: str = Field(min_length=1, max_length=36)
    vehicle_profile_id: str = Field(min_length=1, max_length=36)
    target_battery_percent: Percentage
    payment_method: PaymentMethod
    connector_version: int = Field(ge=1)
    idempotency_key: str = Field(
        min_length=8,
        max_length=120,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )


class SessionCommandRequest(ApiModel):
    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(
        min_length=8,
        max_length=120,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )


class PaymentRead(ApiModel):
    id: str
    session_id: str
    provider: PaymentProvider
    method: PaymentMethod
    status: PaymentStatus
    currency_code: str
    amount: Decimal
    provider_reference: str | None
    failure_code: str | None
    captured_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SessionEventRead(ApiModel):
    id: str
    session_id: str
    version: int
    actor_user_id: int | None
    event_type: str
    detail: dict[str, Any]
    created_at: datetime


class ChargingSessionRead(ApiModel):
    id: str
    vehicle_profile_id: str | None
    connector_id: str
    status: SessionStatus
    station_name: str
    connector_type: ConnectorType
    currency_code: str
    unit_price_per_kwh: Decimal
    start_battery_percent: Decimal | None
    target_battery_percent: Decimal | None
    energy_kwh: Decimal
    total_amount: Decimal
    version: int
    authorized_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    payment: PaymentRead | None = None
    history: list[SessionEventRead] = Field(default_factory=list)


class ReceiptRead(ApiModel):
    session_id: str
    station_name: str
    connector_type: ConnectorType
    started_at: datetime
    completed_at: datetime
    energy_kwh: Decimal
    unit_price_per_kwh: Decimal
    total_amount: Decimal
    currency_code: str
    payment_method: PaymentMethod
    payment_reference: str | None


class ChargePlanIntentRequest(ApiModel):
    message: str = Field(min_length=3, max_length=300)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return " ".join(value.split())


class ChargePlanIntentRead(ApiModel):
    status: AiAnswerStatus
    target_battery_percent: int | None = Field(default=None, ge=20, le=100)
    area: str | None = Field(default=None, max_length=80)
    origin: str | None = Field(default=None, max_length=100)
    destination: str | None = Field(default=None, max_length=100)
    departure_time: str | None = Field(default=None, max_length=40)
    arrival_battery_percent: int | None = Field(default=None, ge=5, le=100)
    max_total_php: Decimal | None = Field(default=None, gt=0, le=100_000)
    priority: ChargePlanPriority = "balanced"
    generated_at: datetime


class NetworkQuestionRequest(ApiModel):
    message: str = Field(min_length=3, max_length=240)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return " ".join(value.split())


class NetworkAnswerRead(ApiModel):
    status: AiAnswerStatus
    headline: str = Field(max_length=140)
    reason: str = Field(max_length=240)
    action: str | None = Field(default=None, max_length=180)
    evidence: list[str] = Field(default_factory=list, max_length=3)
    location_id: str | None = None
    location_name: str | None = Field(default=None, max_length=180)
    generated_at: datetime


DriverWorkspaceRead.model_rebuild()
ManagementWorkspaceRead.model_rebuild()
