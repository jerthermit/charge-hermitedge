import type { GeoPoint } from "../components/charging/ChargingMap";
import type {
  ChargePlanIntent,
  PublicConnector,
  Station,
  Vehicle,
} from "../types/charging";

const ENERGY_KWH_PER_100_KM = 18;
const ESTIMATED_ROAD_FACTOR = 1.24;
const ESTIMATED_CITY_SPEED_KPH = 25;
const MINIMUM_STATION_ARRIVAL_PERCENT = 5;
const DEFAULT_DESTINATION_RESERVE_PERCENT = 20;
const CURRENT_LOCATION_PATTERN =
  /^(?:from\s+)?(?:me|my location|current location|here|near me)$/i;

export interface TripPlace {
  label: string;
  position: GeoPoint;
}

export interface TripStopOption {
  station: Station;
  connector: PublicConnector;
  targetBatteryPercent: number;
  arrivalBatteryPercent: number;
  driveMinutes: number;
  chargeMinutes: number;
  totalMinutes: number;
  distanceKm: number;
  estimatedTotal: number;
  availableCount: number;
}

export interface DirectTripOption {
  arrivalBatteryPercent: number;
  driveMinutes: number;
  distanceKm: number;
}

export interface TripPlanningResult {
  origin: TripPlace | null;
  destination: TripPlace | null;
  direct: DirectTripOption | null;
  primary: TripStopOption | null;
  fallback: TripStopOption | null;
  issue: string | null;
}

interface PlaceCatalogEntry extends TripPlace {
  matches: RegExp;
}

interface BuildTripPlanInput {
  intent: ChargePlanIntent;
  vehicle: Vehicle | undefined;
  stations: Station[];
  origin: TripPlace | null;
  destination: TripPlace | null;
}

interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
}

const PLACE_CATALOG: PlaceCatalogEntry[] = [
  {
    label: "BGC",
    position: { lat: 14.5507, lng: 121.0513 },
    matches: /\b(bgc|bonifacio|high street|taguig)\b/i,
  },
  {
    label: "Makati",
    position: { lat: 14.556, lng: 121.0236 },
    matches: /\b(makati|ayala triangle|ayala avenue)\b/i,
  },
  {
    label: "Ortigas",
    position: { lat: 14.5873, lng: 121.0613 },
    matches: /\b(ortigas|pasig)\b/i,
  },
  {
    label: "MOA",
    position: { lat: 14.5352, lng: 120.9822 },
    matches: /\b(moa|mall of asia|seaside)\b/i,
  },
  {
    label: "Alabang",
    position: { lat: 14.423, lng: 121.0309 },
    matches: /\b(alabang|muntinlupa)\b/i,
  },
  {
    label: "North Avenue",
    position: { lat: 14.651777, lng: 121.035869 },
    matches: /\b(north avenue|vertis north|quezon city|qc)\b/i,
  },
  {
    label: "Manila",
    position: { lat: 14.5898, lng: 120.9816 },
    matches: /\b(manila|ermita|city hall)\b/i,
  },
  {
    label: "Monumento",
    position: { lat: 14.6571, lng: 120.984 },
    matches: /\b(monumento|caloocan)\b/i,
  },
  {
    label: "Fairview",
    position: { lat: 14.6996, lng: 121.0641 },
    matches: /\b(fairview|commonwealth)\b/i,
  },
  {
    label: "Libis",
    position: { lat: 14.6097, lng: 121.0801 },
    matches: /\b(libis|bagumbayan)\b/i,
  },
  {
    label: "Marikina",
    position: { lat: 14.637, lng: 121.1023 },
    matches: /\b(marikina|shoe avenue|sumulong)\b/i,
  },
  {
    label: "Newport",
    position: { lat: 14.5223, lng: 121.0161 },
    matches: /\b(newport|resorts world|naia|airport)\b/i,
  },
];

const numberValue = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const coordinateValue = (
  value: number | string | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const stationPosition = (station: Station): GeoPoint | null => {
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

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const straightLineDistance = (
  origin: GeoPoint,
  destination: GeoPoint,
): number => {
  const earthRadiusKm = 6_371;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);
  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
};

const estimatedRoute = (
  origin: GeoPoint,
  destination: GeoPoint,
): RouteEstimate => {
  const distanceKm =
    straightLineDistance(origin, destination) * ESTIMATED_ROAD_FACTOR;
  return {
    distanceKm,
    durationMinutes: Math.max(
      1,
      Math.round((distanceKm / ESTIMATED_CITY_SPEED_KPH) * 60),
    ),
  };
};

const searchableStation = (station: Station): string =>
  `${station.name} ${station.address} ${station.city}`.toLowerCase();

export const stationMatchesPlace = (
  station: Station,
  value: string,
): boolean => {
  const requested = value.trim();
  if (!requested) return true;

  const catalogMatch = PLACE_CATALOG.find((place) =>
    place.matches.test(requested),
  );
  const searchable = searchableStation(station);

  if (catalogMatch) {
    return catalogMatch.matches.test(searchable);
  }

  const terms = requested
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (term) =>
        term.length > 2 &&
        !["near", "around", "city", "metro", "manila", "philippines"].includes(
          term,
        ),
    );

  return terms.length > 0 && terms.some((term) => searchable.includes(term));
};

export const resolveTripPlace = (
  value: string | null | undefined,
  stations: Station[],
): TripPlace | null => {
  const requested = value?.trim();
  if (!requested) return null;
  if (CURRENT_LOCATION_PATTERN.test(requested)) return null;

  const matchingStation = stations.find((station) =>
    stationMatchesPlace(station, requested),
  );
  const catalogMatch = PLACE_CATALOG.find((place) =>
    place.matches.test(requested),
  );
  const position = matchingStation ? stationPosition(matchingStation) : null;

  if (position) {
    return {
      label: catalogMatch?.label ?? matchingStation?.city ?? requested,
      position,
    };
  }

  return catalogMatch
    ? { label: catalogMatch.label, position: catalogMatch.position }
    : null;
};

const batteryUsedPercent = (distanceKm: number, capacityKwh: number): number =>
  ((distanceKm * ENERGY_KWH_PER_100_KM) / 100 / capacityKwh) * 100;

const compatibleAvailableConnectors = (
  station: Station,
  vehicle: Vehicle,
): PublicConnector[] =>
  station.connectors.filter(
    (connector) =>
      connector.status === "available" &&
      connector.connector_type === vehicle.connector_type,
  );

const rankOptions = (
  left: TripStopOption,
  right: TripStopOption,
  priority: ChargePlanIntent["priority"],
): number => {
  if (priority === "cheapest") {
    return (
      left.estimatedTotal - right.estimatedTotal ||
      left.totalMinutes - right.totalMinutes ||
      right.availableCount - left.availableCount
    );
  }

  if (priority === "nearest") {
    return (
      left.distanceKm - right.distanceKm ||
      left.totalMinutes - right.totalMinutes ||
      left.estimatedTotal - right.estimatedTotal
    );
  }

  if (priority === "farthest") {
    return (
      right.distanceKm - left.distanceKm ||
      left.totalMinutes - right.totalMinutes ||
      left.estimatedTotal - right.estimatedTotal
    );
  }

  if (priority === "fastest") {
    return (
      left.totalMinutes - right.totalMinutes ||
      left.estimatedTotal - right.estimatedTotal ||
      right.availableCount - left.availableCount
    );
  }

  return (
    left.totalMinutes - right.totalMinutes ||
    left.estimatedTotal - right.estimatedTotal ||
    right.availableCount - left.availableCount
  );
};

export const buildTripPlan = ({
  intent,
  vehicle,
  stations,
  origin,
  destination,
}: BuildTripPlanInput): TripPlanningResult => {
  const base = {
    origin,
    destination,
    direct: null,
    primary: null,
    fallback: null,
  };

  if (!vehicle || vehicle.battery_percent === null) {
    return { ...base, issue: "Add your car and battery level first." };
  }

  if (!origin) {
    return {
      ...base,
      issue: "Use your location or add a supported starting point.",
    };
  }

  if (!destination) {
    return {
      ...base,
      issue: "Try BGC, Makati, Ortigas, MOA, Alabang, or Quezon City.",
    };
  }

  const capacityKwh = numberValue(vehicle.battery_capacity_kwh);
  const startingBatteryPercent = numberValue(vehicle.battery_percent);
  if (capacityKwh <= 0 || startingBatteryPercent <= 0) {
    return { ...base, issue: "Update your car’s battery details first." };
  }

  const requiredArrival =
    intent.arrival_battery_percent ?? DEFAULT_DESTINATION_RESERVE_PERCENT;
  const directRoute = estimatedRoute(origin.position, destination.position);
  const directArrival =
    startingBatteryPercent -
    batteryUsedPercent(directRoute.distanceKm, capacityKwh);
  const explicitChargeTarget = intent.target_battery_percent;

  if (directArrival >= requiredArrival && explicitChargeTarget === null) {
    return {
      ...base,
      direct: {
        arrivalBatteryPercent: Math.max(0, Math.round(directArrival)),
        driveMinutes: directRoute.durationMinutes,
        distanceKm: directRoute.distanceKm,
      },
      issue: null,
    };
  }

  const maxBudget =
    intent.max_total_php === null ? null : numberValue(intent.max_total_php);
  const options = stations.flatMap<TripStopOption>((station) => {
    const position = stationPosition(station);
    if (
      !position ||
      (intent.area && !stationMatchesPlace(station, intent.area))
    ) {
      return [];
    }

    const available = compatibleAvailableConnectors(station, vehicle);
    if (!available.length) return [];

    const firstLeg = estimatedRoute(origin.position, position);
    const secondLeg = estimatedRoute(position, destination.position);
    const stationArrival =
      startingBatteryPercent -
      batteryUsedPercent(firstLeg.distanceKm, capacityKwh);

    if (stationArrival < MINIMUM_STATION_ARRIVAL_PERCENT) return [];

    const destinationEnergyPercent = batteryUsedPercent(
      secondLeg.distanceKm,
      capacityKwh,
    );
    const requiredTarget = Math.ceil(
      Math.max(
        explicitChargeTarget ?? 0,
        requiredArrival + destinationEnergyPercent,
      ),
    );

    if (requiredTarget > 100) return [];

    return available.flatMap((connector) => {
      const effectivePowerKw = Math.min(
        numberValue(vehicle.max_dc_power_kw),
        numberValue(connector.max_power_kw),
      );
      if (effectivePowerKw <= 0) return [];

      const energyNeededKwh =
        (capacityKwh * Math.max(0, requiredTarget - stationArrival)) / 100;
      const chargeMinutes = Math.max(
        1,
        Math.ceil((energyNeededKwh / effectivePowerKw) * 60),
      );
      const estimatedTotal =
        energyNeededKwh * numberValue(connector.price_per_kwh);

      if (maxBudget !== null && estimatedTotal > maxBudget) return [];

      return [
        {
          station,
          connector,
          targetBatteryPercent: requiredTarget,
          arrivalBatteryPercent: Math.max(
            0,
            Math.round(requiredTarget - destinationEnergyPercent),
          ),
          driveMinutes:
            firstLeg.durationMinutes + secondLeg.durationMinutes,
          chargeMinutes,
          totalMinutes:
            firstLeg.durationMinutes +
            chargeMinutes +
            secondLeg.durationMinutes,
          distanceKm: firstLeg.distanceKm + secondLeg.distanceKm,
          estimatedTotal,
          availableCount: available.length,
        },
      ];
    });
  });

  options.sort((left, right) => rankOptions(left, right, intent.priority));
  const primary = options[0] ?? null;
  const fallback =
    options.find((option) => option.station.id !== primary?.station.id) ?? null;

  return {
    ...base,
    primary,
    fallback,
    issue: primary ? null : "No available charger fits this trip right now.",
  };
};
