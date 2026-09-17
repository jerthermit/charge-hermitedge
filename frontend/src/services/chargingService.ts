import axios from "axios";
import type {
  AccountAccess,
  ChargeEstimate,
  ChargeEstimateInput,
  ChargePlanIntent,
  ChargePlanIntentInput,
  ChargerCreateInput,
  ChargingSession,
  ConnectorPriceInput,
  ConnectorStatusInput,
  DriverWorkspace,
  LocationCreateInput,
  LocationUpdateInput,
  ManagedCharger,
  ManagedConnector,
  ManagedLocation,
  ManagementWorkspace,
  NetworkAnswer,
  NetworkQuestionInput,
  Receipt,
  SessionCommandInput,
  SessionStartInput,
  Vehicle,
  VehicleBatteryInput,
  VehicleCreateInput,
  VehicleUpdateInput,
} from "../types/charging";
import api from "./api";

interface ApiErrorBody {
  detail?:
    | string
    | {
        code?: string;
        message?: string;
      }
    | Array<{
        msg?: string;
      }>;
}

export class ChargingApiError extends Error {
  status?: number;
  code?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
    } = {}
  ) {
    super(message);
    this.name = "ChargingApiError";
    this.status = options.status;
    this.code = options.code;
  }
}

const toChargingError = (
  error: unknown
): ChargingApiError => {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return new ChargingApiError(
      error instanceof Error
        ? error.message
        : "The request failed."
    );
  }

  const detail =
    error.response?.data?.detail;

  if (typeof detail === "string") {
    return new ChargingApiError(detail, {
      status: error.response?.status,
    });
  }

  if (Array.isArray(detail)) {
    return new ChargingApiError(
      detail[0]?.msg ||
        "Check the information and try again.",
      {
        status: error.response?.status,
        code: "validation_error",
      }
    );
  }

  return new ChargingApiError(
    detail?.message ||
      (error.response
        ? "The request could not be completed."
        : "Charge could not reach the server."),
    {
      status: error.response?.status,
      code: detail?.code,
    }
  );
};

const request = async <T>(
  operation: () => Promise<{ data: T }>
): Promise<T> => {
  try {
    const response = await operation();
    return response.data;
  } catch (error) {
    throw toChargingError(error);
  }
};

const pathId = (value: string): string =>
  encodeURIComponent(value);

export const createIdempotencyKey = (
  scope: string
): string => {
  const safeScope =
    scope
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 32) || "request";

  const uniqueValue =
    typeof globalThis.crypto
      ?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(
          36
        )}-${Math.random()
          .toString(36)
          .slice(2)}`;

  return `${safeScope}:${uniqueValue}`;
};

export const chargingService = {
  getAccess(): Promise<AccountAccess> {
    return request(() =>
      api.get<AccountAccess>(
        "/charging/access"
      )
    );
  },

  getDriverWorkspace(): Promise<DriverWorkspace> {
    return request(() =>
      api.get<DriverWorkspace>(
        "/charging/driver"
      )
    );
  },

  listVehicles(): Promise<Vehicle[]> {
    return request(() =>
      api.get<Vehicle[]>(
        "/charging/vehicles"
      )
    );
  },

  createVehicle(
    input: VehicleCreateInput
  ): Promise<Vehicle> {
    return request(() =>
      api.post<Vehicle>(
        "/charging/vehicles",
        input
      )
    );
  },

  updateVehicle(
    vehicleId: string,
    input: VehicleUpdateInput
  ): Promise<Vehicle> {
    return request(() =>
      api.patch<Vehicle>(
        `/charging/vehicles/${pathId(
          vehicleId
        )}`,
        input
      )
    );
  },

  updateVehicleBattery(
    vehicleId: string,
    input: VehicleBatteryInput
  ): Promise<Vehicle> {
    return request(() =>
      api.put<Vehicle>(
        `/charging/vehicles/${pathId(
          vehicleId
        )}/battery`,
        input
      )
    );
  },

  estimateCharge(
    input: ChargeEstimateInput
  ): Promise<ChargeEstimate> {
    return request(() =>
      api.post<ChargeEstimate>(
        "/charging/estimate",
        input
      )
    );
  },

  createChargePlan(
    input: ChargePlanIntentInput
  ): Promise<ChargePlanIntent> {
    return request(() =>
      api.post<ChargePlanIntent>(
        "/charging/plan",
        input
      )
    );
  },

  listSessions(
    limit = 50
  ): Promise<ChargingSession[]> {
    const safeLimit = Math.min(
      100,
      Math.max(1, Math.trunc(limit))
    );

    return request(() =>
      api.get<ChargingSession[]>(
        "/charging/sessions",
        {
          params: {
            limit: safeLimit,
          },
        }
      )
    );
  },

  createSession(
    input: SessionStartInput
  ): Promise<ChargingSession> {
    return request(() =>
      api.post<ChargingSession>(
        "/charging/sessions",
        input
      )
    );
  },

  getSession(
    sessionId: string
  ): Promise<ChargingSession> {
    return request(() =>
      api.get<ChargingSession>(
        `/charging/sessions/${pathId(
          sessionId
        )}`
      )
    );
  },

  startSession(
    sessionId: string,
    input: SessionCommandInput
  ): Promise<ChargingSession> {
    return request(() =>
      api.post<ChargingSession>(
        `/charging/sessions/${pathId(
          sessionId
        )}/start`,
        input
      )
    );
  },

  completeSyntheticSession(
    sessionId: string,
    input: SessionCommandInput
  ): Promise<ChargingSession> {
    return request(() =>
      api.post<ChargingSession>(
        `/charging/sessions/${pathId(
          sessionId
        )}/complete-synthetic`,
        input
      )
    );
  },

  cancelSession(
    sessionId: string,
    input: SessionCommandInput
  ): Promise<ChargingSession> {
    return request(() =>
      api.post<ChargingSession>(
        `/charging/sessions/${pathId(
          sessionId
        )}/cancel`,
        input
      )
    );
  },

  getReceipt(
    sessionId: string
  ): Promise<Receipt> {
    return request(() =>
      api.get<Receipt>(
        `/charging/sessions/${pathId(
          sessionId
        )}/receipt`
      )
    );
  },

  getManagementWorkspace(
    networkId: string
  ): Promise<ManagementWorkspace> {
    return request(() =>
      api.get<ManagementWorkspace>(
        `/charging/networks/${pathId(
          networkId
        )}/workspace`
      )
    );
  },

  askNetwork(
    networkId: string,
    input: NetworkQuestionInput
  ): Promise<NetworkAnswer> {
    return request(() =>
      api.post<NetworkAnswer>(
        `/charging/networks/${pathId(
          networkId
        )}/ask`,
        input
      )
    );
  },

  createLocation(
    networkId: string,
    input: LocationCreateInput
  ): Promise<ManagedLocation> {
    return request(() =>
      api.post<ManagedLocation>(
        `/charging/networks/${pathId(
          networkId
        )}/locations`,
        input
      )
    );
  },

  updateLocation(
    locationId: string,
    input: LocationUpdateInput
  ): Promise<ManagedLocation> {
    return request(() =>
      api.patch<ManagedLocation>(
        `/charging/locations/${pathId(
          locationId
        )}`,
        input
      )
    );
  },

  publishLocation(
    locationId: string
  ): Promise<ManagedLocation> {
    return request(() =>
      api.post<ManagedLocation>(
        `/charging/locations/${pathId(
          locationId
        )}/publish`
      )
    );
  },

  takeLocationOffline(
    locationId: string
  ): Promise<ManagedLocation> {
    return request(() =>
      api.post<ManagedLocation>(
        `/charging/locations/${pathId(
          locationId
        )}/offline`
      )
    );
  },

  createCharger(
    locationId: string,
    input: ChargerCreateInput
  ): Promise<ManagedCharger> {
    return request(() =>
      api.post<ManagedCharger>(
        `/charging/locations/${pathId(
          locationId
        )}/chargers`,
        input
      )
    );
  },

  updateConnectorPrice(
    connectorId: string,
    input: ConnectorPriceInput
  ): Promise<ManagedConnector> {
    return request(() =>
      api.patch<ManagedConnector>(
        `/charging/connectors/${pathId(
          connectorId
        )}/price`,
        input
      )
    );
  },

  updateConnectorStatus(
    connectorId: string,
    input: ConnectorStatusInput
  ): Promise<ManagedConnector> {
    return request(() =>
      api.patch<ManagedConnector>(
        `/charging/connectors/${pathId(
          connectorId
        )}/status`,
        input
      )
    );
  },
};

export default chargingService;
