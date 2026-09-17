export type AppMode = "find" | "manage";

export type MemberRole = "owner" | "manager" | "viewer";

export type NetworkStatus = "setup" | "active" | "suspended";

export type LocationStatus = "draft" | "active" | "offline";

export type ChargerProtocol =
  | "unconnected"
  | "ocpp_1_6j"
  | "ocpp_2_0_1";

export type ConnectionStatus =
  | "pending"
  | "online"
  | "offline"
  | "maintenance";

export type ConnectorType =
  | "CCS2"
  | "TYPE_2"
  | "CHADEMO"
  | "GB_T"
  | "NACS"
  | "OTHER";

export type ConnectorStatus =
  | "available"
  | "reserved"
  | "charging"
  | "offline";

export type ManagerConnectorStatus = "available" | "offline";

export type BatterySource = "manual" | "vehicle_api";

export type SessionStatus =
  | "payment_pending"
  | "ready"
  | "charging"
  | "completed"
  | "cancelled"
  | "failed";

export type PaymentMethod = "qrph" | "card";

export type PaymentProvider = "sandbox";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded";

export type DataMode =
  | "live"
  | "replayed"
  | "simulated"
  | "synthetic";

export type AiAnswerStatus =
  | "answered"
  | "insufficient_data"
  | "unavailable";

export type DecimalValue = number | string;

export interface NetworkAccess {
  network_id: string;
  network_name: string;
  role: MemberRole;
}

export interface AccountAccess {
  can_find: boolean;
  can_manage: boolean;
  default_mode: AppMode | null;
  networks: NetworkAccess[];
}

export interface SourceState {
  charging: DataMode;
  routing: "google_maps" | "unavailable";
  payments: "sandbox" | "live";
  assistant: "together" | "unavailable";
}

export interface Network {
  id: string;
  name: string;
  slug: string;
  status: NetworkStatus;
  currency_code: string;
  country_code: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreateInput {
  nickname?: string | null;
  make: string;
  model: string;
  model_year?: number | null;
  battery_capacity_kwh: number;
  connector_type: ConnectorType;
  max_dc_power_kw: number;
  battery_percent?: number | null;
  is_default?: boolean;
}

export interface VehicleUpdateInput {
  nickname?: string | null;
  make?: string;
  model?: string;
  model_year?: number | null;
  battery_capacity_kwh?: number;
  connector_type?: ConnectorType;
  max_dc_power_kw?: number;
  is_default?: boolean;
}

export interface VehicleBatteryInput {
  battery_percent: number;
}

export interface Vehicle {
  id: string;
  nickname: string | null;
  make: string;
  model: string;
  model_year: number | null;
  battery_capacity_kwh: DecimalValue;
  connector_type: ConnectorType;
  max_dc_power_kw: DecimalValue;
  battery_percent: DecimalValue | null;
  battery_source: BatterySource;
  is_default: boolean;
  battery_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteSummary {
  distance_km: DecimalValue | null;
  duration_minutes: number | null;
  maps_url: string | null;
  source: "google_maps" | "unavailable";
  updated_at: string | null;
}

export interface PublicConnector {
  id: string;
  charger_id: string;
  charger_name: string;
  connector_number: number;
  connector_type: ConnectorType;
  max_power_kw: DecimalValue;
  price_per_kwh: DecimalValue;
  currency_code: string;
  status: ConnectorStatus;
  compatible: boolean;
  version: number;
  updated_at: string;
}

export interface Station {
  id: string;
  network_name: string;
  name: string;
  address: string;
  city: string;
  latitude: DecimalValue;
  longitude: DecimalValue;
  google_maps_url: string | null;
  available_connector_count: number;
  connectors: PublicConnector[];
  route: RouteSummary | null;
}

export interface DriverWorkspace {
  access: AccountAccess;
  sources: SourceState;
  vehicles: Vehicle[];
  stations: Station[];
  active_session: ChargingSession | null;
}

export interface LocationCreateInput {
  name: string;
  address: string;
  city: string;
  country_code?: string;
  timezone?: string;
  latitude: number;
  longitude: number;
  google_place_id?: string | null;
  google_maps_url?: string | null;
  is_public?: boolean;
}

export interface LocationUpdateInput {
  name?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string | null;
  google_maps_url?: string | null;
  is_public?: boolean;
}

export interface ConnectorCreateInput {
  connector_number: number;
  connector_type: ConnectorType;
  max_power_kw: number;
  price_per_kwh: number;
}

export interface ChargerCreateInput {
  external_id: string;
  display_name: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  protocol?: ChargerProtocol;
  connectors: ConnectorCreateInput[];
}

export interface ConnectorPriceInput {
  price_per_kwh: number;
  expected_version: number;
}

export interface ConnectorStatusInput {
  status: ManagerConnectorStatus;
  expected_version: number;
}

export interface ManagedConnector {
  id: string;
  charger_id: string;
  connector_number: number;
  connector_type: ConnectorType;
  max_power_kw: DecimalValue;
  price_per_kwh: DecimalValue;
  status: ConnectorStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ManagedCharger {
  id: string;
  location_id: string;
  external_id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  protocol: ChargerProtocol;
  connection_status: ConnectionStatus;
  last_seen_at: string | null;
  connectors: ManagedConnector[];
  created_at: string;
  updated_at: string;
}

export interface ManagedLocation {
  id: string;
  network_id: string;
  name: string;
  address: string;
  city: string;
  country_code: string;
  timezone: string;
  latitude: DecimalValue;
  longitude: DecimalValue;
  google_place_id: string | null;
  google_maps_url: string | null;
  status: LocationStatus;
  is_public: boolean;
  chargers: ManagedCharger[];
  created_at: string;
  updated_at: string;
}

export interface ManagementMetrics {
  active_sessions: number;
  available_connectors: number;
  offline_connectors: number;
  energy_today_kwh: DecimalValue;
  revenue_today: DecimalValue;
  currency_code: string;
}

export interface ManagementWorkspace {
  access: AccountAccess;
  sources: SourceState;
  network: Network;
  metrics: ManagementMetrics;
  locations: ManagedLocation[];
  recent_sessions: ChargingSession[];
}

export interface NetworkQuestionInput {
  message: string;
}

export interface NetworkAnswer {
  status: AiAnswerStatus;
  headline: string;
  reason: string;
  action: string | null;
  evidence: string[];
  location_id: string | null;
  location_name: string | null;
  generated_at: string;
}

export interface ChargeEstimateInput {
  connector_id: string;
  vehicle_profile_id: string;
  target_battery_percent: number;
}

export interface ChargeEstimate {
  connector_id: string;
  vehicle_profile_id: string;
  station_name: string;
  connector_type: ConnectorType;
  start_battery_percent: DecimalValue;
  target_battery_percent: DecimalValue;
  estimated_energy_kwh: DecimalValue;
  effective_power_kw: DecimalValue;
  estimated_minutes: number;
  price_per_kwh: DecimalValue;
  estimated_total: DecimalValue;
  currency_code: string;
  calculated_at: string;
}

export interface SessionStartInput {
  connector_id: string;
  vehicle_profile_id: string;
  target_battery_percent: number;
  payment_method: PaymentMethod;
  connector_version: number;
  idempotency_key: string;
}

export interface SessionCommandInput {
  expected_version: number;
  idempotency_key: string;
}

export interface Payment {
  id: string;
  session_id: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  currency_code: string;
  amount: DecimalValue;
  provider_reference: string | null;
  failure_code: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  version: number;
  actor_user_id: number | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ChargingSession {
  id: string;
  vehicle_profile_id: string | null;
  connector_id: string;
  status: SessionStatus;
  station_name: string;
  connector_type: ConnectorType;
  currency_code: string;
  unit_price_per_kwh: DecimalValue;
  start_battery_percent: DecimalValue | null;
  target_battery_percent: DecimalValue | null;
  energy_kwh: DecimalValue;
  total_amount: DecimalValue;
  version: number;
  authorized_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  payment: Payment | null;
  history: SessionEvent[];
}

export interface Receipt {
  session_id: string;
  station_name: string;
  connector_type: ConnectorType;
  started_at: string;
  completed_at: string;
  energy_kwh: DecimalValue;
  unit_price_per_kwh: DecimalValue;
  total_amount: DecimalValue;
  currency_code: string;
  payment_method: PaymentMethod;
  payment_reference: string | null;
}

export type ChargePlanPriority =
  | "balanced"
  | "fastest"
  | "cheapest"
  | "nearest"
  | "farthest";

export interface ChargePlanIntentInput {
  message: string;
}

export interface ChargePlanIntent {
  status: AiAnswerStatus;
  target_battery_percent: number | null;
  area: string | null;
  origin: string | null;
  destination: string | null;
  departure_time: string | null;
  arrival_battery_percent: number | null;
  max_total_php: DecimalValue | null;
  priority: ChargePlanPriority;
  generated_at: string;
}
