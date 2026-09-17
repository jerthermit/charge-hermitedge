import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActiveChargePanel from "../charging/ActiveChargePanel";
import ChargePlanner from "../charging/ChargePlanner";
import TripPlanResult from "../charging/TripPlanResult";
import ChargingMap, {
  distanceInKilometers,
  formatMapDistance,
} from "../charging/ChargingMap";
import type {
  DriverLocation,
  GeoPoint,
  LocationState,
} from "../charging/ChargingMap";
import VehicleGarage from "../charging/VehicleGarage";
import {
  buildTripPlan,
  resolveTripPlace,
  stationMatchesPlace,
} from "../../lib/tripPlanning";
import type { TripPlace, TripStopOption } from "../../lib/tripPlanning";
import {
  ChargingApiError,
  chargingService,
  createIdempotencyKey,
} from "../../services/chargingService";
import type {
  ChargePlanIntent,
  ChargingSession,
  DecimalValue,
  DriverWorkspace,
  PaymentMethod,
  PublicConnector,
  Receipt,
  Station,
  Vehicle,
} from "../../types/charging";

const DRIVER_QUERY_KEY = ["charging", "driver"] as const;
const LOW_BATTERY_THRESHOLD = 25;
const AVAILABILITY_CONFLICTS = new Set([
  "charger_offline",
  "connector_unavailable",
  "station_unavailable",
]);
const EMPTY_VEHICLES: Vehicle[] = [];
const EMPTY_STATIONS: Station[] = [];

interface BestChargeOption {
  station: Station;
  connector: PublicConnector;
  chargeMinutes: number;
  estimatedTotal: number;
  effectivePowerKw: number;
  availableCount: number;
  distanceKm: number | null;
}

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const connectorLabels: Record<PublicConnector["connector_type"], string> = {
  CCS2: "CCS2 · DC fast",
  TYPE_2: "Type 2 · AC",
  CHADEMO: "CHAdeMO · DC fast",
  GB_T: "GB/T · DC fast",
  NACS: "NACS · DC fast",
  OTHER: "Other connector",
};

const paymentLabels: Record<PaymentMethod, string> = {
  qrph: "QR Ph",
  card: "Card",
};

const receiptReference = (
  reference: string | null,
  sessionId: string,
): string => {
  const value = (reference || sessionId)
    .replace(/^sbx_/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-10)
    .toUpperCase();

  return `CHG-${value}`;
};

const numberValue = (value: DecimalValue | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const coordinateValue = (
  value: DecimalValue | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stationCoordinates = (station: Station): GeoPoint | null => {
  const lat = coordinateValue(station.latitude);
  const lng = coordinateValue(station.longitude);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
};

const formatMoney = (
  value: DecimalValue | null | undefined,
  currency = "PHP",
): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue(value));

const formatReceiptTime = (value: string): string =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

const connectorMatches = (
  connector: PublicConnector,
  vehicle?: Vehicle,
): boolean => !vehicle || connector.connector_type === vehicle.connector_type;

const stationHasAvailableConnector = (
  station: Station,
  vehicle?: Vehicle,
): boolean =>
  station.connectors.some(
    (connector) =>
      connector.status === "available" && connectorMatches(connector, vehicle),
  );

const distanceToStation = (location: GeoPoint, station: Station): number => {
  const destination = stationCoordinates(station);

  return destination
    ? distanceInKilometers(location, destination)
    : Number.POSITIVE_INFINITY;
};

const closestAvailableStation = (
  stations: Station[],
  vehicle: Vehicle | undefined,
  location: GeoPoint,
): Station | undefined =>
  stations
    .filter(
      (station) =>
        stationHasAvailableConnector(station, vehicle) &&
        stationCoordinates(station),
    )
    .sort(
      (left, right) =>
        distanceToStation(location, left) - distanceToStation(location, right),
    )[0];

const stationUrl = (station: Station, origin?: GeoPoint | null): string => {
  if (!origin && station.route?.maps_url) {
    return station.route.maps_url;
  }

  const coordinates = stationCoordinates(station);

  if (!coordinates && station.google_maps_url) {
    return station.google_maps_url;
  }

  const destination = coordinates
    ? `${coordinates.lat},${coordinates.lng}`
    : [station.name, station.address, station.city, "Philippines"].join(", ");

  const parameters = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
    dir_action: "navigate",
  });

  if (origin) {
    parameters.set("origin", `${origin.lat},${origin.lng}`);
  }

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
};

const OperationsWorkspace = () => {
  const queryClient = useQueryClient();
  const checkoutKey = useRef<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [stationId, setStationId] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const [targetBattery, setTargetBattery] = useState(80);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("qrph");
  const [startStage, setStartStage] = useState<
    "idle" | "verifying" | "starting"
  >("idle");
  const [finishStage, setFinishStage] = useState<
    "idle" | "stopping" | "settling"
  >("idle");
  const [showCheckout, setShowCheckout] = useState(false);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(
    null,
  );
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [locationRequestId, setLocationRequestId] = useState(0);
  const [chargePlan, setChargePlan] = useState<ChargePlanIntent | null>(null);

  const workspaceQuery = useQuery({
    queryKey: DRIVER_QUERY_KEY,
    queryFn: () => chargingService.getDriverWorkspace(),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const workspace = workspaceQuery.data;
  const vehicles = workspace?.vehicles ?? EMPTY_VEHICLES;
  const stations = workspace?.stations ?? EMPTY_STATIONS;

  const vehicle = vehicles.find((item) => item.id === vehicleId);

  const activeSession = workspace?.active_session ?? null;

  const activeStation = activeSession
    ? stations.find((item) =>
        item.connectors.some(
          (connector) => connector.id === activeSession.connector_id,
        ),
      )
    : undefined;

  const activeConnector = activeSession
    ? activeStation?.connectors.find(
        (connector) => connector.id === activeSession.connector_id,
      )
    : undefined;

  const activeVehicle = activeSession
    ? vehicles.find((item) => item.id === activeSession.vehicle_profile_id)
    : undefined;

  const batteryPercent = numberValue(vehicle?.battery_percent);

  const namedComparisonOrigin = useMemo(() => {
    if (!chargePlan?.origin || chargePlan.destination) {
      return null;
    }

    return resolveTripPlace(chargePlan.origin, stations);
  }, [chargePlan, stations]);

  const comparisonOrigin = namedComparisonOrigin?.position ?? driverLocation;

  const tripOrigin = useMemo<TripPlace | null>(() => {
    if (!chargePlan?.destination) return null;

    const namedOrigin = resolveTripPlace(chargePlan.origin, stations);

    if (namedOrigin) return namedOrigin;

    return chargePlan.origin === null && driverLocation
      ? {
          label: "Current location",
          position: driverLocation,
        }
      : null;
  }, [chargePlan, driverLocation, stations]);

  const tripDestination = useMemo(
    () =>
      chargePlan?.destination
        ? resolveTripPlace(chargePlan.destination, stations)
        : null,
    [chargePlan, stations],
  );

  const tripPlan = useMemo(
    () =>
      chargePlan?.destination
        ? buildTripPlan({
            intent: chargePlan,
            vehicle,
            stations,
            origin: tripOrigin,
            destination: tripDestination,
          })
        : null,
    [
      chargePlan,
      stations,
      tripDestination,
      tripOrigin,
      vehicle,
    ],
  );

  const selectedTripStop = useMemo(
    () =>
      tripPlan?.fallback?.station.id === stationId
        ? tripPlan.fallback
        : (tripPlan?.primary ?? null),
    [stationId, tripPlan],
  );

  const filteredStations = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = stations.filter((item) => {
      const searchable = [item.name, item.network_name, item.address, item.city]
        .join(" ")
        .toLowerCase();

      const matchingConnectors = item.connectors.filter((connector) =>
        connectorMatches(connector, vehicle),
      );

      const hasAvailable = matchingConnectors.some(
        (connector) => connector.status === "available",
      );

      const hasFast = matchingConnectors.some(
        (connector) =>
          connector.status === "available" &&
          numberValue(connector.max_power_kw) >= 50,
      );

      return (
        (!term || searchable.includes(term)) &&
        (!availableOnly || hasAvailable) &&
        (!fastOnly || hasFast)
      );
    });

    if (!comparisonOrigin) {
      return filtered;
    }

    return [...filtered].sort(
      (left, right) =>
        distanceToStation(comparisonOrigin, left) -
        distanceToStation(comparisonOrigin, right),
    );
  }, [
    availableOnly,
    comparisonOrigin,
    fastOnly,
    search,
    stations,
    vehicle,
  ]);

  const mapStations = useMemo(() => {
    if (
      !activeStation ||
      filteredStations.some((item) => item.id === activeStation.id)
    ) {
      return filteredStations;
    }

    return [activeStation, ...filteredStations];
  }, [activeStation, filteredStations]);

  const station =
    activeStation ??
    filteredStations.find((item) => item.id === stationId) ??
    filteredStations[0];

  const usableConnectors = useMemo(() => {
    if (!station) {
      return [];
    }

    return station.connectors
      .filter(
        (connector) =>
          connector.status === "available" &&
          connectorMatches(connector, vehicle),
      )
      .sort(
        (left, right) =>
          numberValue(right.max_power_kw) - numberValue(left.max_power_kw),
      );
  }, [station, vehicle]);

  const selectedConnector =
    usableConnectors.find((connector) => connector.id === connectorId) ??
    usableConnectors[0];

  const selectedDistance =
    comparisonOrigin && station
      ? distanceToStation(comparisonOrigin, station)
      : null;

  const lowBattery =
    vehicle?.battery_percent != null &&
    batteryPercent <= LOW_BATTERY_THRESHOLD &&
    !activeSession;

  const plannedTarget = chargePlan?.target_battery_percent ?? targetBattery;

  const bestCharge = useMemo<BestChargeOption | null>(() => {
    if (
      chargePlan?.destination ||
      ((chargePlan?.priority === "nearest" ||
        chargePlan?.priority === "farthest") &&
        !comparisonOrigin) ||
      !vehicle ||
      vehicle.battery_percent == null ||
      plannedTarget <= batteryPercent
    ) {
      return null;
    }

    const energyNeeded =
      (numberValue(vehicle.battery_capacity_kwh) *
        (plannedTarget - batteryPercent)) /
      100;
    const maxBudget =
      chargePlan?.max_total_php == null
        ? null
        : numberValue(chargePlan.max_total_php);

    const options = stations
      .filter(
        (item) =>
          !chargePlan?.area || stationMatchesPlace(item, chargePlan.area),
      )
      .flatMap((item) => {
        const available = item.connectors.filter(
          (connector) =>
            connector.status === "available" &&
            connectorMatches(connector, vehicle),
        );

        const destination = stationCoordinates(item);
        const directDistance =
          comparisonOrigin && destination
            ? distanceInKilometers(comparisonOrigin, destination)
            : null;

        return available.flatMap((connector) => {
          const effectivePowerKw = Math.min(
            numberValue(vehicle.max_dc_power_kw),
            numberValue(connector.max_power_kw),
          );

          const chargeMinutes = Math.ceil(
            (energyNeeded / effectivePowerKw) * 60,
          );

          const estimatedTotal =
            energyNeeded * numberValue(connector.price_per_kwh);

          if (maxBudget !== null && estimatedTotal > maxBudget) {
            return [];
          }

          return [
            {
              station: item,
              connector,
              chargeMinutes,
              estimatedTotal,
              effectivePowerKw,
              availableCount: available.length,
              distanceKm: directDistance,
            },
          ];
        });
      });

    options.sort((left, right) => {
      const distanceDifference =
        (left.distanceKm ?? Number.POSITIVE_INFINITY) -
        (right.distanceKm ?? Number.POSITIVE_INFINITY);
      const chargingTimeDifference = left.chargeMinutes - right.chargeMinutes;
      const costDifference = left.estimatedTotal - right.estimatedTotal;

      if (chargePlan?.priority === "cheapest") {
        return (
          costDifference ||
          chargingTimeDifference ||
          distanceDifference ||
          right.availableCount - left.availableCount
        );
      }

      if (chargePlan?.priority === "nearest") {
        return (
          distanceDifference ||
          chargingTimeDifference ||
          costDifference ||
          right.availableCount - left.availableCount
        );
      }

      if (chargePlan?.priority === "farthest") {
        return (
          -distanceDifference ||
          chargingTimeDifference ||
          costDifference ||
          right.availableCount - left.availableCount
        );
      }

      if (chargePlan?.priority === "fastest") {
        return (
          chargingTimeDifference ||
          distanceDifference ||
          costDifference ||
          right.availableCount - left.availableCount
        );
      }

      if (comparisonOrigin) {
        if (distanceDifference !== 0) {
          return distanceDifference;
        }
      }

      if (chargingTimeDifference !== 0) {
        return chargingTimeDifference;
      }

      if (costDifference !== 0) {
        return costDifference;
      }

      return (
        right.availableCount - left.availableCount ||
        left.station.name.localeCompare(right.station.name)
      );
    });

    return options[0] ?? null;
  }, [
    batteryPercent,
    chargePlan,
    comparisonOrigin,
    plannedTarget,
    stations,
    vehicle,
  ]);

  const chargePlanNeedsLocation = Boolean(
    chargePlan &&
      !chargePlan.destination &&
      (chargePlan.priority === "nearest" ||
        chargePlan.priority === "farthest") &&
      !comparisonOrigin,
  );

  const chargePlanIssue = !chargePlan
    ? null
    : chargePlan.destination
      ? (tripPlan?.issue ?? null)
      : chargePlanNeedsLocation
        ? null
        : plannedTarget <= batteryPercent
          ? `Battery is already ${Math.round(batteryPercent)}%.`
          : !bestCharge
            ? "No available charger fits all of that."
            : null;

  const estimateQuery = useQuery({
    queryKey: [
      "charging",
      "estimate",
      selectedConnector?.id,
      vehicle?.id,
      targetBattery,
    ],
    queryFn: () => {
      if (!selectedConnector || !vehicle) {
        throw new Error("Choose a vehicle and connector first.");
      }

      return chargingService.estimateCharge({
        connector_id: selectedConnector.id,
        vehicle_profile_id: vehicle.id,
        target_battery_percent: targetBattery,
      });
    },
    enabled:
      Boolean(selectedConnector && vehicle?.battery_percent != null) &&
      targetBattery > batteryPercent,
    staleTime: 10_000,
    retry: false,
  });

  const setCachedSession = (session: ChargingSession | null) => {
    queryClient.setQueryData<DriverWorkspace>(DRIVER_QUERY_KEY, (current) =>
      current
        ? {
            ...current,
            active_session: session,
          }
        : current,
    );
  };

  const startChargeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConnector || !vehicle) {
        throw new Error("Choose a vehicle and connector first.");
      }

      const idempotencyKey =
        checkoutKey.current ?? createIdempotencyKey("session");

      checkoutKey.current = idempotencyKey;
      setStartStage("verifying");

      const readySession = await chargingService.createSession({
        connector_id: selectedConnector.id,
        vehicle_profile_id: vehicle.id,
        target_battery_percent: targetBattery,
        payment_method: paymentMethod,
        connector_version: selectedConnector.version,
        idempotency_key: idempotencyKey,
      });

      setStartStage("starting");

      return chargingService.startSession(readySession.id, {
        expected_version: readySession.version,
        idempotency_key: `start:${readySession.id}`,
      });
    },
    onSuccess: (session) => {
      checkoutKey.current = null;
      setCachedSession(session);
      setShowCheckout(false);

      void queryClient.invalidateQueries({
        queryKey: DRIVER_QUERY_KEY,
      });

      window.requestAnimationFrame(() => {
        document.getElementById("active-charge")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    onError: (error) => {
      if (
        error instanceof ChargingApiError &&
        AVAILABILITY_CONFLICTS.has(error.code ?? "")
      ) {
        checkoutKey.current = null;
        setAvailabilityNotice(error.message);
        setShowCheckout(false);
      }

      void queryClient.invalidateQueries({
        queryKey: DRIVER_QUERY_KEY,
      });
    },
    onSettled: () => {
      setStartStage("idle");
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) {
        throw new Error("No charge is ready.");
      }

      return chargingService.startSession(activeSession.id, {
        expected_version: activeSession.version,
        idempotency_key: `start:${activeSession.id}`,
      });
    },
    onSuccess: (session) => {
      setCachedSession(session);

      void queryClient.invalidateQueries({
        queryKey: DRIVER_QUERY_KEY,
      });

      window.requestAnimationFrame(() => {
        document.getElementById("active-charge")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) {
        throw new Error("No charge is active.");
      }

      setFinishStage("stopping");

      const completed = await chargingService.completeSyntheticSession(
        activeSession.id,
        {
          expected_version: activeSession.version,
          idempotency_key: `complete:${activeSession.id}`,
        },
      );

      setFinishStage("settling");
      const completedReceipt = await chargingService.getReceipt(completed.id);

      return { completedReceipt };
    },
    onSuccess: ({ completedReceipt }) => {
      setCachedSession(null);
      setReceipt(completedReceipt);

      void queryClient.invalidateQueries({
        queryKey: DRIVER_QUERY_KEY,
      });
    },
    onSettled: () => {
      setFinishStage("idle");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) {
        throw new Error("No charge can be cancelled.");
      }

      return chargingService.cancelSession(activeSession.id, {
        expected_version: activeSession.version,
        idempotency_key: `cancel:${activeSession.id}`,
      });
    },
    onSuccess: () => {
      setCachedSession(null);

      void queryClient.invalidateQueries({
        queryKey: DRIVER_QUERY_KEY,
      });
    },
  });

  useEffect(() => {
    if (!vehicles.length) {
      setVehicleId("");
      return;
    }

    const stillExists = vehicles.some((item) => item.id === vehicleId);

    if (!stillExists) {
      setVehicleId(
        vehicles.find((item) => item.is_default)?.id ?? vehicles[0].id,
      );
    }
  }, [vehicleId, vehicles]);

  useEffect(() => {
    if (activeStation) {
      if (stationId !== activeStation.id) {
        setStationId(activeStation.id);
      }
      return;
    }

    if (!filteredStations.length) {
      setStationId("");
      return;
    }

    const stillVisible = filteredStations.some((item) => item.id === stationId);

    if (!stillVisible) {
      setStationId(filteredStations[0].id);
    }
  }, [activeStation, filteredStations, stationId]);

  useEffect(() => {
    if (!usableConnectors.length) {
      setConnectorId("");
      return;
    }

    const stillUsable = usableConnectors.some(
      (item) => item.id === connectorId,
    );

    if (!stillUsable) {
      setConnectorId(usableConnectors[0].id);
    }
  }, [connectorId, usableConnectors]);

  useEffect(() => {
    const nextTarget =
      [80, 90, 100].find((value) => value > batteryPercent) ?? 100;

    if (targetBattery <= batteryPercent) {
      setTargetBattery(nextTarget);
    }
  }, [batteryPercent, targetBattery]);

  useEffect(() => {
    checkoutKey.current = null;
  }, [connectorId, paymentMethod, targetBattery, vehicleId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!startChargeMutation.isPending) {
        setShowCheckout(false);
      }

      setReceipt(null);
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [startChargeMutation.isPending]);

  const selectStation = (nextStationId: string, nextConnectorId?: string) => {
    setSearch("");
    setAvailableOnly(true);
    setFastOnly(false);
    setStationId(nextStationId);

    if (nextConnectorId) {
      setConnectorId(nextConnectorId);
    }
  };

  const applyChargePlan = (nextPlan: ChargePlanIntent) => {
    setChargePlan(nextPlan);
    setAvailableOnly(true);
    setFastOnly(false);
    setSearch(nextPlan.destination ? "" : (nextPlan.area ?? ""));

    if (
      nextPlan.target_battery_percent !== null &&
      nextPlan.target_battery_percent > batteryPercent
    ) {
      setTargetBattery(nextPlan.target_battery_percent);
    }
  };

  const clearChargePlan = () => {
    setChargePlan(null);
    setSearch("");
    setAvailableOnly(false);
  };

  const selectTripStop = (option: TripStopOption) => {
    selectStation(option.station.id, option.connector.id);
    setTargetBattery(option.targetBatteryPercent);
  };

  useEffect(() => {
    if (!chargePlan || chargePlan.destination || !bestCharge || activeSession) {
      return;
    }

    setStationId(bestCharge.station.id);
    setConnectorId(bestCharge.connector.id);
  }, [activeSession, bestCharge, chargePlan]);

  useEffect(() => {
    if (!tripPlan?.primary || activeSession) return;

    setStationId(tripPlan.primary.station.id);
    setConnectorId(tripPlan.primary.connector.id);
    setTargetBattery(tripPlan.primary.targetBatteryPercent);
    setAvailableOnly(true);
    setFastOnly(false);
  }, [activeSession, tripPlan]);

  const handleLocationChange = (location: DriverLocation) => {
    setDriverLocation(location);

    if (activeSession || chargePlan?.destination) {
      return;
    }

    const closest = closestAvailableStation(
      stations,
      vehicle,
      location,
    );

    if (closest) {
      selectStation(closest.id);
    }
  };

  const requestLocationFromPlanner = useCallback(() => {
    setLocationState("locating");
    setLocationRequestId((current) => current + 1);
  }, []);

  if (workspaceQuery.isLoading) {
    return (
      <main className="bg-[#f1f2ed] px-4 py-5 sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-[1680px]"
          role="status"
          aria-label="Loading chargers"
        >
          <span className="sr-only">Loading chargers…</span>
          <div className="mb-5 h-14 w-56 rounded-2xl bg-black/10" />

          <div className="grid items-start gap-5 xl:h-[max(19rem,calc(100svh-15rem))] xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.55fr)]">
            <div className="h-[28rem] rounded-[2rem] bg-[#dce5dc] sm:h-[30rem] xl:h-full" />
            <div className="min-h-[20rem] rounded-[2rem] bg-white xl:h-full" />
          </div>
        </div>
      </main>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <main className="grid min-h-[calc(100dvh-7.5rem)] place-items-center bg-[#f1f2ed] p-6 text-[#111510]">
        <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-[0_24px_70px_rgba(30,40,28,0.1)]">
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">
            Chargers didn’t load.
          </h1>

          <button
            type="button"
            onClick={() => void workspaceQuery.refetch()}
            className="mt-5 inline-flex h-11 items-center rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!workspace.access.can_find) {
    return (
      <main className="grid min-h-[calc(100dvh-7.5rem)] place-items-center bg-[#f1f2ed] p-6">
        <div className="rounded-[2rem] bg-white px-8 py-10 text-center">
          <h1 className="text-2xl font-semibold">
            Finding chargers isn’t available for this account.
          </h1>
        </div>
      </main>
    );
  }

  const availableCount =
    station?.connectors.filter(
      (connector) =>
        connector.status === "available" &&
        connectorMatches(connector, vehicle),
    ).length ?? 0;

  const sessionBusy =
    resumeMutation.isPending ||
    finishMutation.isPending ||
    cancelMutation.isPending;

  const sessionError =
    resumeMutation.error || finishMutation.error || cancelMutation.error;

  const chargeTargets = Array.from(new Set([targetBattery, 80, 90, 100])).sort(
    (left, right) => left - right,
  );

  return (
    <main className="bg-[#f1f2ed] text-[#111510]">
      <div className="mx-auto flex min-h-[calc(100svh-7.5rem)] max-w-[1680px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-4 flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h1 className="min-w-0 text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[0.92] tracking-[-0.05em]">
            Nearby chargers
          </h1>

          <VehicleGarage
            vehicles={vehicles}
            selectedVehicleId={vehicleId}
            onSelect={setVehicleId}
          />
        </header>

        {!activeSession && (
          <ChargePlanner
            assistantAvailable={workspace.sources.assistant === "together"}
            plan={chargePlan}
            issue={chargePlan?.destination ? null : chargePlanIssue}
            needsLocation={chargePlanNeedsLocation}
            locationState={locationState}
            onUseLocation={requestLocationFromPlanner}
            onPlan={applyChargePlan}
            onClear={clearChargePlan}
          />
        )}

        {!activeSession && tripPlan && (
          <TripPlanResult
            result={tripPlan}
            selectedOption={selectedTripStop}
            onSelect={selectTripStop}
          />
        )}

        <AnimatePresence>
          {bestCharge &&
            !activeSession &&
            !chargePlan?.destination &&
            (chargePlan || lowBattery) && (
              <motion.button
                type="button"
                key={`${vehicle?.id}:${bestCharge.connector.id}`}
                initial={{
                  opacity: 0,
                  y: -14,
                  scale: 0.985,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.985,
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={spring}
                onClick={() =>
                  selectStation(bestCharge.station.id, bestCharge.connector.id)
                }
                className={`mb-5 flex w-full items-center gap-3 rounded-3xl p-3 text-left shadow-[0_16px_40px_rgba(70,83,28,0.16)] sm:gap-4 sm:px-4 ${
                  lowBattery ? "bg-[#dfff69]" : "bg-[#111510] text-white"
                }`}
              >
                <span
                  className={`grid h-12 min-w-14 shrink-0 place-items-center rounded-2xl px-2 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] ${
                    lowBattery
                      ? "bg-[#111510] text-[#dfff69]"
                      : "bg-[#dfff69] text-[#111510]"
                  }`}
                >
                  {chargePlan
                    ? "AI plan"
                    : lowBattery
                      ? `${Math.round(batteryPercent)}%`
                      : comparisonOrigin
                        ? "Closest"
                        : "Fastest"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {bestCharge.station.name}
                  </span>

                  <span
                    className={`block truncate text-xs ${
                      lowBattery ? "text-[#111510]/60" : "text-white/55"
                    }`}
                  >
                    {bestCharge.distanceKm !== null
                      ? `${formatMapDistance(bestCharge.distanceKm)} away · `
                      : ""}
                    {bestCharge.availableCount} open
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">
                    {bestCharge.chargeMinutes} min
                  </span>

                  <span
                    className={`block text-[10px] ${
                      lowBattery ? "text-[#111510]/55" : "text-white/50"
                    }`}
                  >
                    to {plannedTarget}% ·{" "}
                    {formatMoney(
                      bestCharge.estimatedTotal,
                      bestCharge.connector.currency_code,
                    )}
                  </span>
                </span>
              </motion.button>
            )}
        </AnimatePresence>

        {activeSession && (
          <ActiveChargePanel
            session={activeSession}
            vehicle={activeVehicle}
            connector={activeConnector}
            onOpen={() => {
              if (!activeStation) {
                return;
              }

              setSearch("");
              setAvailableOnly(false);
              setFastOnly(false);
              setStationId(activeStation.id);
            }}
          />
        )}

        <AnimatePresence initial={false}>
          {availabilityNotice && !activeSession && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring}
              className="flex items-center justify-between gap-4 rounded-2xl bg-[#fff0ec] px-4 py-3 text-sm font-medium text-[#8b2e20]"
            >
              <span>{availabilityNotice}</span>
              <button
                type="button"
                onClick={() => setAvailabilityNotice("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/70"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid items-start gap-5 xl:min-h-[19rem] xl:flex-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.55fr)]">
          <section className="relative h-[28rem] overflow-hidden rounded-[2rem] border border-black/10 bg-[#dce5dc] shadow-[0_24px_70px_rgba(30,40,28,0.1)] sm:h-[30rem] xl:h-full">
            <ChargingMap
              stations={mapStations}
              selectedStationId={station?.id}
              vehicle={vehicle}
              distanceOrigin={comparisonOrigin}
              locationRequestId={locationRequestId}
              onSelect={(nextStationId) => {
                if (!activeSession) {
                  setStationId(nextStationId);
                }
              }}
              onLocationChange={handleLocationChange}
              onLocationStateChange={setLocationState}
            />

            <div className="absolute left-4 right-4 top-4 z-20 flex flex-col gap-2 sm:left-5 sm:right-auto sm:w-[25rem]">
              <label className="flex h-12 items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-4 shadow-[0_12px_35px_rgba(22,30,20,0.1)] backdrop-blur-xl">
                <Search className="h-4 w-4 shrink-0 text-[#697068]" />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chargers"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#858c84]"
                  aria-label="Search charging stations"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setAvailableOnly((current) => !current)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold shadow-sm ${
                    availableOnly ? "bg-[#111510] text-white" : "bg-white/90"
                  }`}
                >
                  Open now
                </button>

                <button
                  type="button"
                  onClick={() => setFastOnly((current) => !current)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold shadow-sm ${
                    fastOnly ? "bg-[#111510] text-white" : "bg-white/90"
                  }`}
                >
                  Fast · 50 kW+
                </button>
              </div>
            </div>

            {!mapStations.length && (
              <div className="absolute inset-0 z-30 grid place-items-center">
                <div className="rounded-3xl bg-white/95 px-6 py-5 text-center shadow-xl">
                  <div className="text-sm font-semibold">No chargers found</div>

                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setAvailableOnly(false);
                      setFastOnly(false);
                    }}
                    className="mt-3 text-xs font-semibold underline underline-offset-4"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </section>

          <AnimatePresence mode="wait">
            <motion.aside
              key={
                activeSession && activeStation?.id === station?.id
                  ? "session"
                  : (station?.id ?? "empty")
              }
              initial={{
                opacity: 0,
                x: 14,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
                x: -14,
              }}
              transition={spring}
              className={`self-start overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-[0_24px_70px_rgba(30,40,28,0.1)] ${
                activeSession && activeStation?.id === station?.id
                  ? ""
                  : "xl:h-full xl:overflow-y-auto"
              }`}
            >
              {activeSession && activeStation?.id === station?.id ? (
                <div className="flex flex-col bg-[#111510] p-5 text-white sm:p-6">
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-3xl font-semibold tracking-[-0.055em]">
                        {activeSession.station_name}
                      </h2>

                      <p className="mt-2 truncate text-sm text-white/50">
                        {activeConnector?.charger_name ||
                          connectorLabels[activeSession.connector_type]}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/70">
                      {activeSession.status === "charging"
                        ? "In use"
                        : activeSession.status === "ready"
                          ? "Ready"
                          : "Pending"}
                    </span>
                  </div>

                  {sessionError && (
                    <div className="mt-4 rounded-2xl bg-[#552c26] px-4 py-3 text-sm text-[#ffd5ce]">
                      {errorMessage(sessionError)}
                    </div>
                  )}

                  {activeSession.status === "ready" ? (
                    <div className="mt-5">
                      <p className="mb-4 text-sm text-white/55">
                        Start was interrupted
                      </p>

                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          disabled={sessionBusy}
                          onClick={() => resumeMutation.mutate()}
                          className="h-12 rounded-2xl bg-[#dfff69] px-4 text-sm font-semibold text-[#111510] disabled:opacity-50"
                        >
                          Retry start
                        </button>

                        <button
                          type="button"
                          disabled={sessionBusy}
                          onClick={() => cancelMutation.mutate()}
                          className="h-12 rounded-2xl border border-white/15 px-4 text-sm font-semibold disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : activeSession.status === "charging" ? (
                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={() => finishMutation.mutate()}
                      className="mt-6 h-12 rounded-2xl bg-white px-4 text-sm font-semibold text-[#111510] disabled:opacity-50"
                    >
                      {finishMutation.isPending
                        ? finishStage === "settling"
                          ? "Settling payment…"
                          : "Stopping…"
                        : "Stop"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={() => cancelMutation.mutate()}
                      className="mt-6 h-12 rounded-2xl border border-white/15 px-4 text-sm font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ) : station ? (
                <div className="flex flex-col p-6">
                  <div className="min-w-0">
                    <h2 className="text-3xl font-semibold tracking-[-0.055em]">
                      {station.name}
                    </h2>

                    <div className="mt-1 text-sm text-[#697068]">
                      {station.address}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#697068]">
                      <span>{availableCount} available now</span>
                      {selectedDistance !== null &&
                        Number.isFinite(selectedDistance) && (
                        <span>
                          {formatMapDistance(selectedDistance)} away
                        </span>
                      )}
                      <span className="font-medium text-[#8a9089]">
                        Checked again at start
                      </span>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-3 text-sm font-semibold">Chargers</div>

                    <div className="space-y-2">
                      {station.connectors.map((connector) => {
                        const compatible = connectorMatches(connector, vehicle);

                        const selectable =
                          compatible && connector.status === "available";

                        const selected = connector.id === selectedConnector?.id;

                        const statusLabel = !compatible
                          ? "Not compatible"
                          : connector.status === "available"
                            ? "Available"
                            : connector.status === "charging" ||
                                connector.status === "reserved"
                              ? "In use"
                              : "Offline";

                        return (
                          <motion.button
                            key={connector.id}
                            type="button"
                            disabled={!selectable}
                            whileHover={selectable ? { x: 2 } : undefined}
                            whileTap={
                              selectable
                                ? {
                                    scale: 0.99,
                                  }
                                : undefined
                            }
                            transition={spring}
                            onClick={() => setConnectorId(connector.id)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${
                              selected
                                ? "border-[#111510] bg-[#f5f6f1] shadow-sm"
                                : selectable
                                  ? "border-black/10"
                                  : "border-black/10 bg-black/[0.025] text-black/65"
                            } disabled:cursor-not-allowed`}
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-semibold shadow-sm">
                              {connector.connector_number}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {connector.charger_name}
                              </span>

                              <span className="text-xs text-[#777e76]">
                                {connectorLabels[connector.connector_type]}
                                {" · "}
                                {numberValue(connector.max_power_kw)} kW
                                {" · "}
                                {formatMoney(
                                  connector.price_per_kwh,
                                  connector.currency_code,
                                )}
                                /kWh
                              </span>
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                selectable
                                  ? "bg-[#dfff69]"
                                  : "bg-[#ececea] text-[#777e76]"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`mt-6 grid gap-2 ${
                      tripPlan ? "grid-cols-1" : "grid-cols-[auto_1fr]"
                    }`}
                  >
                    {!tripPlan && (
                      <motion.a
                        href={stationUrl(station, driverLocation)}
                        target="_blank"
                        rel="noreferrer"
                        whileHover={{ y: -2 }}
                        whileTap={{
                          scale: 0.95,
                        }}
                        transition={spring}
                        className="flex h-12 items-center justify-center rounded-2xl border border-black/10 px-4 text-sm font-semibold hover:bg-[#f1f2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                        aria-label={`Open ${station.name} in Google Maps`}
                      >
                        Open in Maps
                      </motion.a>
                    )}

                    <motion.button
                      type="button"
                      disabled={
                        Boolean(activeSession) ||
                        !vehicle ||
                        !selectedConnector ||
                        vehicle.battery_percent == null
                      }
                      whileHover={{ y: -2 }}
                      whileTap={{
                        scale: 0.985,
                      }}
                      transition={spring}
                      onClick={() => {
                        startChargeMutation.reset();
                        setStartStage("idle");
                        setAvailabilityNotice("");
                        setShowCheckout(true);
                      }}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {activeSession
                        ? "Charge in progress"
                        : !vehicle
                          ? "Choose a vehicle"
                          : "Select charger"}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[18rem] place-items-center p-6 text-center">
                  <div className="text-sm font-semibold">No chargers found</div>
                </div>
              )}
            </motion.aside>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showCheckout && station && selectedConnector && vehicle && (
          <div className="fixed inset-0 z-[90] grid place-items-end sm:place-items-center">
            <motion.button
              type="button"
              aria-label="Close checkout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!startChargeMutation.isPending) {
                  setShowCheckout(false);
                }
              }}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            />

            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkout-title"
              initial={{
                y: 80,
                opacity: 0,
                scale: 0.98,
              }}
              animate={{
                y: 0,
                opacity: 1,
                scale: 1,
              }}
              exit={{
                y: 80,
                opacity: 0,
                scale: 0.98,
              }}
              transition={spring}
              className="relative z-10 max-h-[100dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-[#f7f7f3] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem] sm:p-6"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[#747b73]">
                    {station.name}
                  </div>

                  <h2
                    id="checkout-title"
                    className="mt-1 text-2xl font-semibold tracking-[-0.045em]"
                  >
                    Plug in to start
                  </h2>
                </div>

                <button
                  type="button"
                  disabled={startChargeMutation.isPending}
                  onClick={() => setShowCheckout(false)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 rounded-3xl bg-[#111510] p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {selectedConnector.charger_name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-white/45">
                      {connectorLabels[selectedConnector.connector_type]}
                      {" · "}
                      {numberValue(selectedConnector.max_power_kw)} kW
                    </span>
                    <span className="mt-3 block text-xs font-medium text-[#dfff69]">
                      Connector {selectedConnector.connector_number}
                    </span>
                  </span>
                </div>

                <div className="mt-6 flex items-center gap-2">
                  {chargeTargets.map((target) => (
                    <button
                      key={target}
                      type="button"
                      disabled={target <= batteryPercent}
                      onClick={() => setTargetBattery(target)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        targetBattery === target
                          ? "bg-white text-[#111510]"
                          : "bg-white/10 text-white/65"
                      } disabled:hidden`}
                    >
                      {target}%
                    </button>
                  ))}
                </div>

                <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-white/45">Estimated total</div>

                    <div className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
                      {estimateQuery.data
                        ? formatMoney(
                            estimateQuery.data.estimated_total,
                            estimateQuery.data.currency_code,
                          )
                        : "—"}
                    </div>
                  </div>

                  <div className="min-w-0 text-right">
                    <div className="text-lg font-semibold">
                      {estimateQuery.data
                        ? `~${estimateQuery.data.estimated_minutes} min`
                        : "—"}
                    </div>

                    <div className="text-xs text-white/45">
                      {estimateQuery.data
                        ? `${numberValue(
                            estimateQuery.data.estimated_energy_kwh,
                          ).toFixed(1)} kWh`
                        : "Calculating"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 text-sm font-semibold">Payment details</div>

                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label="Payment method"
                >
                  <button
                    type="button"
                    aria-pressed={paymentMethod === "qrph"}
                    aria-label="QR Ph — scan with GCash, Maya, or a participating bank app"
                    onClick={() => setPaymentMethod("qrph")}
                    className={`relative flex min-h-24 min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,background-color,transform] active:scale-[0.98] sm:p-4 ${
                      paymentMethod === "qrph"
                        ? "border-[#111510] bg-white text-[#111510]"
                        : "border-black/10 text-[#697068]"
                    }`}
                  >
                    <img
                      src="/payments/qr-ph.svg"
                      alt=""
                      className="h-5 w-auto max-w-20 object-contain"
                    />
                    <span className="mt-3 flex min-w-0 items-center gap-2 opacity-60">
                      <img
                        src="/payments/gcash.svg"
                        alt=""
                        className="h-3.5 w-auto max-w-[2.5rem] object-contain"
                      />
                      <img
                        src="/payments/maya.svg"
                        alt=""
                        className="h-3.5 w-auto max-w-[2.5rem] object-contain"
                      />
                      <span className="hidden truncate text-[10px] font-semibold sm:inline">
                        + bank apps
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`absolute right-3 top-3 h-2 w-2 rounded-full ${
                        paymentMethod === "qrph"
                          ? "bg-[#111510]"
                          : "bg-transparent"
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    aria-pressed={paymentMethod === "card"}
                    aria-label="Credit or debit card"
                    onClick={() => setPaymentMethod("card")}
                    className={`relative flex min-h-24 min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,background-color,transform] active:scale-[0.98] sm:p-4 ${
                      paymentMethod === "card"
                        ? "border-[#111510] bg-white text-[#111510]"
                        : "border-black/10 text-[#697068]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <img
                        src="/payments/visa.svg"
                        alt=""
                        className="h-3.5 w-auto max-w-[2.8rem] object-contain"
                      />
                      <img
                        src="/payments/mastercard.svg"
                        alt=""
                        className="h-5 w-auto max-w-8 object-contain"
                      />
                    </span>
                    <span className="mt-3 text-[11px] font-medium leading-tight opacity-60">
                      Credit or debit card
                    </span>
                    <span
                      aria-hidden="true"
                      className={`absolute right-3 top-3 h-2 w-2 rounded-full ${
                        paymentMethod === "card"
                          ? "bg-[#111510]"
                          : "bg-transparent"
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-3 flex min-w-0 items-center gap-3 rounded-2xl bg-black/[0.045] px-4 py-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#111510] text-[11px] font-semibold text-[#dfff69]">
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">
                      {paymentMethod === "qrph"
                        ? "QR Ph selected"
                        : "Visa / Mastercard selected"}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#747b73]">
                      {formatMoney(
                        selectedConnector.price_per_kwh,
                        selectedConnector.currency_code,
                      )}{" "}
                      / kWh · based on energy delivered
                    </span>
                  </span>
                </div>
              </div>

              {(startChargeMutation.error || estimateQuery.error) && (
                <div className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]">
                  {errorMessage(
                    startChargeMutation.error || estimateQuery.error,
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={
                  startChargeMutation.isPending ||
                  estimateQuery.isFetching ||
                  !estimateQuery.data
                }
                onClick={() => startChargeMutation.mutate()}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {startChargeMutation.isPending
                  ? startStage === "starting"
                    ? "Starting charger…"
                    : "Verifying payment…"
                  : "Start charging"}
              </button>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receipt && (
          <div className="fixed inset-0 z-[95] grid place-items-center p-4">
            <motion.button
              type="button"
              aria-label="Close receipt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReceipt(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.section
              data-print-receipt
              role="dialog"
              aria-modal="true"
              aria-labelledby="receipt-title"
              initial={{
                opacity: 0,
                y: 30,
                scale: 0.96,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 30,
                scale: 0.96,
              }}
              transition={spring}
              className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-[2rem] bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div
                id="receipt-title"
                className="inline-flex items-center gap-2 rounded-full bg-[#dfff69] px-3 py-2 text-xs font-semibold text-[#111510]"
              >
                <span
                  aria-hidden="true"
                  className="grid h-5 w-5 place-items-center rounded-full bg-[#111510] text-[11px] text-[#dfff69]"
                >
                  ✓
                </span>
                Payment complete
              </div>

              <div className="mt-5 text-4xl font-semibold tracking-[-0.06em]">
                {formatMoney(receipt.total_amount, receipt.currency_code)}
              </div>

              <p className="mt-1 text-sm text-[#747b73]">
                Paid with {paymentLabels[receipt.payment_method]}
              </p>

              <div className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 px-4">
                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="text-[#747b73]">Station</span>

                  <span className="truncate font-semibold">
                    {receipt.station_name}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 text-sm">
                  <span className="text-[#747b73]">Energy</span>

                  <span className="font-semibold">
                    {numberValue(receipt.energy_kwh).toFixed(2)} kWh
                  </span>
                </div>

                <div className="flex items-center justify-between py-3 text-sm">
                  <span className="text-[#747b73]">Rate</span>

                  <span className="font-semibold">
                    {formatMoney(
                      receipt.unit_price_per_kwh,
                      receipt.currency_code,
                    )}{" "}
                    / kWh
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="text-[#747b73]">Completed</span>

                  <span className="text-right font-semibold">
                    {formatReceiptTime(receipt.completed_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="text-[#747b73]">Reference</span>

                  <span className="truncate font-mono text-xs">
                    {receiptReference(
                      receipt.payment_reference,
                      receipt.session_id,
                    )}
                  </span>
                </div>
              </div>

              <div data-no-print className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex h-12 items-center justify-center rounded-2xl border border-black/10 px-3 text-sm font-semibold"
                >
                  Print / save
                </button>

                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="flex h-12 items-center justify-center rounded-2xl bg-[#111510] px-3 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
};

export default OperationsWorkspace;
