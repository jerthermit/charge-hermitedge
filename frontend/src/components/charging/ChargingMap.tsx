/* eslint-disable react-refresh/only-export-components */
import { AnimatePresence, motion } from "framer-motion";
import { LocateFixed, LocateOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DecimalValue,
  PublicConnector,
  Station,
  Vehicle,
} from "../../types/charging";

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type DriverLocation = GeoPoint & {
  accuracyMeters: number;
};

interface ChargingMapProps {
  stations: Station[];
  selectedStationId?: string;
  vehicle?: Vehicle;
  distanceOrigin?: GeoPoint | null;
  onSelect: (stationId: string) => void;
  onLocationChange?: (location: DriverLocation) => void;
  onLocationStateChange?: (state: LocationState) => void;
  locationRequestId?: number;
}

interface MapBounds {
  extend(position: GeoPoint): void;
}

interface MapView {
  fitBounds(
    bounds: MapBounds,
    padding?:
      | number
      | {
          top: number;
          right: number;
          bottom: number;
          left: number;
        },
  ): void;
  getZoom(): number | undefined;
  panTo(position: GeoPoint): void;
  setCenter(position: GeoPoint): void;
  setZoom(zoom: number): void;
}

interface MapEventListener {
  remove(): void;
}

interface MapMarker {
  map: MapView | null;
  addEventListener(eventName: "gmp-click", handler: () => void): void;
  removeEventListener(eventName: "gmp-click", handler: () => void): void;
}

interface MapsLibrary {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapView;
}

interface CoreLibrary {
  LatLngBounds: new () => MapBounds;
}

interface MarkerLibrary {
  AdvancedMarkerElement: new (options: {
    map: MapView;
    position: GeoPoint;
    title: string;
    content: HTMLElement;
    gmpClickable?: boolean;
  }) => MapMarker;
}

interface GoogleMapsRuntime {
  maps: {
    importLibrary(
      library: "core" | "maps" | "marker",
    ): Promise<unknown>;
  };
}

type ChargeWindow = Window & {
  google?: GoogleMapsRuntime;
  __chargeGoogleMapsReady?: () => void;
};

interface MarkerRecord {
  marker: MapMarker;
  listener: MapEventListener;
  root: HTMLDivElement;
  pointer: HTMLSpanElement;
  copy: HTMLSpanElement;
  compact: boolean;
  hideCopy: boolean;
}

interface StationPoint {
  station: Station;
  position: GeoPoint;
}

interface FallbackStation {
  station: Station;
  available: number;
  distanceKm?: number;
  x: number;
  y: number;
}

interface FallbackLayout {
  stations: FallbackStation[];
  driver?: {
    x: number;
    y: number;
  };
}

type MapState = "fallback" | "loading" | "ready";
export type LocationState = "idle" | "locating" | "ready" | "error";

const MANILA_CENTER: GeoPoint = {
  lat: 14.5995,
  lng: 120.9842,
};

const EARTH_RADIUS_KM = 6_371;

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

let googleMapsPromise: Promise<GoogleMapsRuntime> | null = null;

const coordinateValue = (
  value: DecimalValue | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidPosition = (position: GeoPoint): boolean =>
  position.lat >= -90 &&
  position.lat <= 90 &&
  position.lng >= -180 &&
  position.lng <= 180;

const stationPosition = (station: Station): GeoPoint | null => {
  const lat = coordinateValue(station.latitude);
  const lng = coordinateValue(station.longitude);

  if (lat === null || lng === null) {
    return null;
  }

  const position = { lat, lng };

  return isValidPosition(position) ? position : null;
};

const connectorMatches = (
  connector: PublicConnector,
  vehicle?: Vehicle,
): boolean => !vehicle || connector.connector_type === vehicle.connector_type;

const availableAtStation = (station: Station, vehicle?: Vehicle): number =>
  station.connectors.filter(
    (connector) =>
      connector.status === "available" && connectorMatches(connector, vehicle),
  ).length;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const distanceInKilometers = (
  origin: GeoPoint,
  destination: GeoPoint,
): number => {
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);

  const originLatitude = toRadians(origin.lat);
  const destinationLatitude = toRadians(destination.lat);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
};

export const formatMapDistance = (distanceKm: number): string => {
  if (distanceKm < 0.1) {
    return "<100 m";
  }

  if (distanceKm < 10) {
    return `≈${distanceKm.toFixed(1)} km`;
  }

  return `≈${Math.round(distanceKm)} km`;
};

export const loadGoogleMaps = (apiKey: string): Promise<GoogleMapsRuntime> => {
  const chargeWindow = window as ChargeWindow;

  if (chargeWindow.google?.maps.importLibrary) {
    return Promise.resolve(chargeWindow.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const finish = () => {
      const runtime = chargeWindow.google;

      if (!runtime?.maps.importLibrary) {
        googleMapsPromise = null;
        reject(new Error("Google Maps did not initialize."));
        return;
      }

      resolve(runtime);
    };

    const fail = () => {
      googleMapsPromise = null;
      reject(new Error("Google Maps could not be loaded."));
    };

    chargeWindow.__chargeGoogleMapsReady = finish;

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-charge-google-maps]",
    );

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const parameters = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      language: "en",
      region: "PH",
      callback: "__chargeGoogleMapsReady",
    });

    const script = document.createElement("script");

    script.src = `https://maps.googleapis.com/maps/api/js?${parameters.toString()}`;
    script.async = true;
    script.dataset.chargeGoogleMaps = "true";
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = fail;

    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

const styleMarker = (
  record: Pick<
    MarkerRecord,
    "root" | "pointer" | "copy" | "compact" | "hideCopy"
  >,
  selected: boolean,
) => {
  record.root.dataset.selected = String(selected);
  record.root.style.background = selected
    ? "#111510"
    : "rgba(255, 255, 255, 0.97)";
  record.root.style.borderColor = selected
    ? "#111510"
    : "rgba(17, 21, 16, 0.12)";
  record.root.style.color = selected ? "#ffffff" : "#111510";
  record.root.style.transform = selected
    ? "translateY(-5px) scale(1.035)"
    : "translateY(0) scale(1)";
  record.root.style.boxShadow = selected
    ? "0 18px 42px rgba(17, 21, 16, 0.28)"
    : "0 10px 28px rgba(17, 21, 16, 0.17)";
  record.root.style.zIndex = selected ? "10" : "1";
  record.root.style.padding =
    record.hideCopy || (record.compact && !selected)
      ? "6px"
      : "8px 11px 8px 8px";
  record.copy.style.display =
    record.hideCopy || (record.compact && !selected) ? "none" : "grid";

  record.pointer.style.background = selected
    ? "#111510"
    : "rgba(255, 255, 255, 0.97)";
  record.pointer.style.borderColor = selected
    ? "#111510"
    : "rgba(17, 21, 16, 0.12)";
};

const createMarkerContent = (
  station: Station,
  available: number,
  selected: boolean,
  distanceKm?: number,
  compact = false,
  hideCopy = false,
): Pick<MarkerRecord, "root" | "pointer" | "copy" | "compact" | "hideCopy"> => {
  const root = document.createElement("div");

  root.style.alignItems = "center";
  root.style.border = "1px solid";
  root.style.borderRadius = "16px";
  root.style.cursor = "pointer";
  root.style.display = "flex";
  root.style.gap = "9px";
  root.style.padding = "8px 11px 8px 8px";
  root.style.position = "relative";
  root.style.transition =
    "transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, background 180ms ease, color 180ms ease";
  root.style.userSelect = "none";
  root.style.whiteSpace = "nowrap";

  const count = document.createElement("span");

  count.textContent = String(available);
  count.style.alignItems = "center";
  count.style.background = available > 0 ? "#dfff69" : "#e8eae5";
  count.style.borderRadius = "11px";
  count.style.color = "#111510";
  count.style.display = "flex";
  count.style.fontSize = "12px";
  count.style.fontWeight = "750";
  count.style.height = "28px";
  count.style.justifyContent = "center";
  count.style.letterSpacing = "-0.02em";
  count.style.minWidth = "28px";

  const copy = document.createElement("span");

  copy.style.display = "grid";
  copy.style.lineHeight = "1.05";

  const name = document.createElement("span");

  name.textContent = station.name;
  name.style.fontSize = "12px";
  name.style.fontWeight = "700";
  name.style.letterSpacing = "-0.015em";
  name.style.maxWidth = "150px";
  name.style.overflow = "hidden";
  name.style.textOverflow = "ellipsis";

  const status = document.createElement("span");

  const statusParts = [
    available > 0 ? `${available} open` : "Full",
    distanceKm === undefined ? null : formatMapDistance(distanceKm),
  ].filter(Boolean);

  status.textContent = statusParts.join(" · ");
  status.style.fontSize = "9px";
  status.style.fontWeight = "650";
  status.style.marginTop = "4px";
  status.style.opacity = "0.58";
  status.style.textTransform = "uppercase";
  status.style.letterSpacing = "0.09em";

  const pointer = document.createElement("span");

  pointer.style.borderBottom = "1px solid";
  pointer.style.borderRight = "1px solid";
  pointer.style.bottom = "-5px";
  pointer.style.height = "10px";
  pointer.style.left = "50%";
  pointer.style.position = "absolute";
  pointer.style.transform = "translateX(-50%) rotate(45deg)";
  pointer.style.width = "10px";

  copy.append(name, status);
  root.append(count, copy, pointer);

  root.addEventListener("pointerenter", () => {
    if (root.dataset.selected !== "true") {
      root.style.transform = "translateY(-3px) scale(1.02)";
    }
  });

  root.addEventListener("pointerleave", () => {
    if (root.dataset.selected !== "true") {
      root.style.transform = "translateY(0) scale(1)";
    }
  });

  const record = {
    root,
    pointer,
    copy,
    compact,
    hideCopy,
  };
  styleMarker(record, selected);

  return record;
};

const createDriverMarkerContent = (): HTMLDivElement => {
  const root = document.createElement("div");

  root.setAttribute("aria-label", "Your location");
  root.style.alignItems = "center";
  root.style.display = "flex";
  root.style.height = "28px";
  root.style.justifyContent = "center";
  root.style.pointerEvents = "none";
  root.style.position = "relative";
  root.style.width = "28px";

  const halo = document.createElement("span");

  halo.style.background = "rgba(52, 119, 246, 0.14)";
  halo.style.border = "1px solid rgba(52, 119, 246, 0.34)";
  halo.style.borderRadius = "999px";
  halo.style.inset = "0";
  halo.style.position = "absolute";

  const dot = document.createElement("span");

  dot.style.background = "#3477f6";
  dot.style.border = "3px solid #ffffff";
  dot.style.borderRadius = "999px";
  dot.style.boxShadow = "0 6px 18px rgba(24, 66, 145, 0.34)";
  dot.style.height = "15px";
  dot.style.position = "relative";
  dot.style.width = "15px";

  root.append(halo, dot);

  return root;
};

const ChargingMap = ({
  stations,
  selectedStationId,
  vehicle,
  distanceOrigin,
  onSelect,
  onLocationChange,
  onLocationStateChange,
  locationRequestId = 0,
}: ChargingMapProps) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const boundsConstructorRef = useRef<CoreLibrary["LatLngBounds"] | null>(null);
  const markerConstructorRef = useRef<
    MarkerLibrary["AdvancedMarkerElement"] | null
  >(null);
  const markerRecordsRef = useRef(new Map<string, MarkerRecord>());
  const driverMarkerRef = useRef<MapMarker | null>(null);
  const handledLocationRequestRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  const selectedStationIdRef = useRef(selectedStationId);
  const previousSelectionRef = useRef<string | undefined>(undefined);

  const [mapState, setMapState] = useState<MapState>(
    apiKey ? "loading" : "fallback",
  );
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(
    null,
  );

  const routeOrigin = distanceOrigin ?? driverLocation;

  const stationPoints = useMemo<StationPoint[]>(
    () =>
      stations.flatMap((station) => {
        const position = stationPosition(station);

        return position ? [{ station, position }] : [];
      }),
    [stations],
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedStationIdRef.current = selectedStationId;
  }, [selectedStationId]);

  useEffect(() => {
    onLocationStateChange?.(locationState);
  }, [locationState, onLocationStateChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!apiKey || !container) {
      setMapState("fallback");
      return;
    }

    let cancelled = false;
    setMapState("loading");

    const initialize = async () => {
      try {
        const google = await loadGoogleMaps(apiKey);

        const [mapsResult, markerResult, coreResult] = await Promise.all([
          google.maps.importLibrary("maps"),
          google.maps.importLibrary("marker"),
          google.maps.importLibrary("core"),
        ]);

        if (cancelled) {
          return;
        }

        const maps = mapsResult as MapsLibrary;
        const marker = markerResult as MarkerLibrary;
        const core = coreResult as CoreLibrary;

        mapRef.current = new maps.Map(container, {
          center: MANILA_CENTER,
          zoom: 11,
          minZoom: 8,
          maxZoom: 19,
          mapId,
          backgroundColor: "#dce5dc",
          clickableIcons: false,
          controlSize: 32,
          disableDefaultUI: true,
          fullscreenControl: false,
          gestureHandling: "greedy",
          keyboardShortcuts: true,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
        });

        boundsConstructorRef.current = core.LatLngBounds;
        markerConstructorRef.current = marker.AdvancedMarkerElement;

        setMapState("ready");
      } catch {
        if (!cancelled) {
          setMapState("fallback");
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      mapRef.current = null;
      boundsConstructorRef.current = null;
      markerConstructorRef.current = null;
    };
  }, [apiKey, mapId]);

  useEffect(() => {
    const clearMarkers = () => {
      markerRecordsRef.current.forEach((record) => {
        record.listener.remove();
        record.marker.map = null;
        record.root.remove();
      });

      markerRecordsRef.current.clear();
    };

    clearMarkers();

    const map = mapRef.current;
    const Bounds = boundsConstructorRef.current;
    const AdvancedMarker = markerConstructorRef.current;

    if (mapState !== "ready" || !map || !Bounds || !AdvancedMarker) {
      return;
    }

    if (!stationPoints.length) {
      map.setCenter(MANILA_CENTER);
      map.setZoom(11);
      return;
    }

    const bounds = new Bounds();
    const containerWidth = containerRef.current?.clientWidth ?? 1024;
    const compactMarkers = stationPoints.length > 6 || containerWidth < 720;
    const hideMarkerCopy = containerWidth < 480;

    stationPoints.forEach(({ station, position }) => {
      const available = availableAtStation(station, vehicle);
      const distanceKm = routeOrigin
        ? distanceInKilometers(routeOrigin, position)
        : undefined;

      const content = createMarkerContent(
        station,
        available,
        station.id === selectedStationIdRef.current,
        distanceKm,
        compactMarkers,
        hideMarkerCopy,
      );

      const marker = new AdvancedMarker({
        map,
        position,
        title: `${station.name}, ${available} ${
          available === 1 ? "charger" : "chargers"
        } available`,
        content: content.root,
        gmpClickable: true,
      });

      const handleClick = () => {
        onSelectRef.current(station.id);
      };

      marker.addEventListener("gmp-click", handleClick);

      const listener: MapEventListener = {
        remove: () => {
          marker.removeEventListener("gmp-click", handleClick);
        },
      };

      markerRecordsRef.current.set(station.id, {
        marker,
        listener,
        ...content,
      });

      bounds.extend(position);
    });

    if (stationPoints.length === 1) {
      map.setCenter(stationPoints[0].position);
      map.setZoom(14);
    } else {
      map.fitBounds(
        bounds,
        compactMarkers
          ? {
              top: 96,
              right: 24,
              bottom: 68,
              left: 24,
            }
          : {
              top: 118,
              right: 64,
              bottom: 74,
              left: 64,
            },
      );
    }

    return clearMarkers;
  }, [mapState, routeOrigin, stationPoints, vehicle]);

  useEffect(() => {
    markerRecordsRef.current.forEach((record, stationId) => {
      styleMarker(record, stationId === selectedStationId);
    });

    const selectionChanged =
      previousSelectionRef.current !== undefined &&
      previousSelectionRef.current !== selectedStationId;

    if (selectionChanged && selectedStationId && mapRef.current) {
      const selected = stationPoints.find(
        ({ station }) => station.id === selectedStationId,
      );

      if (selected) {
        mapRef.current.panTo(selected.position);

        if ((mapRef.current.getZoom() ?? 0) < 12) {
          mapRef.current.setZoom(12);
        }
      }
    }

    previousSelectionRef.current = selectedStationId;
  }, [selectedStationId, stationPoints]);

  useEffect(() => {
    if (driverMarkerRef.current) {
      driverMarkerRef.current.map = null;
      driverMarkerRef.current = null;
    }

    const map = mapRef.current;
    const AdvancedMarker = markerConstructorRef.current;

    if (mapState !== "ready" || !map || !AdvancedMarker || !driverLocation) {
      return;
    }

    const marker = new AdvancedMarker({
      map,
      position: driverLocation,
      title: "Your location",
      content: createDriverMarkerContent(),
    });

    driverMarkerRef.current = marker;

    map.panTo(driverLocation);

    if ((map.getZoom() ?? 0) < 13) {
      map.setZoom(13);
    }

    return () => {
      marker.map = null;

      if (driverMarkerRef.current === marker) {
        driverMarkerRef.current = null;
      }
    };
  }, [driverLocation, mapState]);

  const requestLocation = useCallback(() => {
    if (driverLocation) {
      mapRef.current?.panTo(driverLocation);

      if ((mapRef.current?.getZoom() ?? 0) < 13) {
        mapRef.current?.setZoom(13);
      }

      return;
    }

    if (!navigator.geolocation) {
      setLocationState("error");
      return;
    }

    setLocationState("locating");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location: DriverLocation = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracyMeters: Number.isFinite(coords.accuracy)
            ? Math.max(0, coords.accuracy)
            : 0,
        };

        if (!isValidPosition(location)) {
          setLocationState("error");
          return;
        }

        setDriverLocation(location);
        setLocationState("ready");
        onLocationChange?.(location);
      },
      () => {
        setLocationState("error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 8_000,
      },
    );
  }, [driverLocation, onLocationChange]);

  useEffect(() => {
    if (
      locationRequestId <= 0 ||
      locationRequestId === handledLocationRequestRef.current
    ) {
      return;
    }

    handledLocationRequestRef.current = locationRequestId;
    requestLocation();
  }, [locationRequestId, requestLocation]);

  const fallbackLayout = useMemo<FallbackLayout>(() => {
    const points = [
      ...stationPoints.map(({ position }) => position),
      ...(routeOrigin ? [routeOrigin] : []),
    ];

    if (!points.length) {
      return { stations: [] };
    }

    const latitudes = points.map(({ lat }) => lat);
    const longitudes = points.map(({ lng }) => lng);

    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);

    const latitudeSpan = maxLatitude - minLatitude;
    const longitudeSpan = maxLongitude - minLongitude;

    const project = (position: GeoPoint) => ({
      x:
        longitudeSpan === 0
          ? 50
          : 16 + ((position.lng - minLongitude) / longitudeSpan) * 68,
      y:
        latitudeSpan === 0
          ? 50
          : 18 + ((maxLatitude - position.lat) / latitudeSpan) * 64,
    });

    return {
      stations: stationPoints.map(({ station, position }) => {
        const projected = project(position);

        return {
          station,
          available: availableAtStation(station, vehicle),
          distanceKm: routeOrigin
            ? distanceInKilometers(routeOrigin, position)
            : undefined,
          ...projected,
        };
      }),
      driver: driverLocation ? project(driverLocation) : undefined,
    };
  }, [driverLocation, routeOrigin, stationPoints, vehicle]);

  const locationLabel =
    locationState === "locating"
      ? "Finding your location"
      : driverLocation
        ? "Center on your location"
        : locationState === "error"
          ? "Try location again"
          : "Use my location";

  return (
    <div
      className="absolute inset-0 isolate overflow-hidden bg-[#dce5dc]"
      aria-busy={mapState === "loading"}
    >
      <div
        aria-hidden={mapState === "ready"}
        className={`absolute inset-0 transition-opacity duration-500 ${
          mapState === "ready" ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(49,77,55,0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(49,77,55,0.075) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d="M -5 61 C 18 52, 26 74, 46 60 S 72 35, 105 43"
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="3.2"
          />
          <path
            d="M 19 -5 C 32 18, 27 43, 42 57 S 65 78, 76 105"
            fill="none"
            stroke="rgba(255,255,255,0.74)"
            strokeWidth="2.4"
          />
          <path
            d="M 76 -5 C 67 20, 75 40, 60 54 S 41 79, 47 105"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1.8"
          />
          <path
            d="M -5 22 C 24 28, 42 15, 63 23 S 84 36, 105 28"
            fill="none"
            stroke="rgba(255,255,255,0.48)"
            strokeWidth="1.4"
          />
        </svg>

        <AnimatePresence initial={false}>
          {fallbackLayout.stations.map(
            ({ station, available, distanceKm, x, y }) => {
              const selected = station.id === selectedStationId;

              return (
                <motion.div
                  key={station.id}
                  layout="position"
                  initial={{
                    opacity: 0,
                    scale: 0.82,
                    y: 10,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.82,
                    y: 8,
                  }}
                  transition={spring}
                  className="absolute z-10"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                >
                  <motion.button
                    type="button"
                    tabIndex={mapState === "ready" ? -1 : 0}
                    whileHover={{ y: -4 }}
                    whileTap={{
                      scale: 0.95,
                    }}
                    transition={spring}
                    onClick={() => onSelect(station.id)}
                    aria-label={`${station.name}, ${available} available`}
                    className={`relative flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl border px-2 py-2 pr-3 shadow-[0_12px_30px_rgba(17,21,16,0.18)] transition-colors ${
                      selected
                        ? "border-[#111510] bg-[#111510] text-white"
                        : "border-black/10 bg-white/95 text-[#111510]"
                    }`}
                  >
                    <span className="grid h-7 min-w-7 place-items-center rounded-xl bg-[#dfff69] px-1.5 text-xs font-bold text-[#111510]">
                      {available}
                    </span>

                    <span className="grid max-w-[9rem] text-left leading-none">
                      <span className="truncate text-xs font-semibold">
                        {station.name}
                      </span>

                      {distanceKm !== undefined && (
                        <span
                          className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                            selected ? "text-white/55" : "text-[#111510]/50"
                          }`}
                        >
                          {formatMapDistance(distanceKm)}
                        </span>
                      )}
                    </span>

                    {selected && (
                      <motion.span
                        layoutId="charging-map-pointer"
                        className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#111510]"
                      />
                    )}
                  </motion.button>
                </motion.div>
              );
            },
          )}
        </AnimatePresence>

        {fallbackLayout.driver && (
          <motion.div
            aria-label="Your location"
            initial={{
              opacity: 0,
              scale: 0.4,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            transition={spring}
            className="pointer-events-none absolute z-20 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{
              left: `${fallbackLayout.driver.x}%`,
              top: `${fallbackLayout.driver.y}%`,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-[#3477f6]/30 bg-[#3477f6]/15"
            />
            <span className="relative h-4 w-4 rounded-full border-[3px] border-white bg-[#3477f6] shadow-[0_6px_18px_rgba(24,66,145,0.34)]" />
          </motion.div>
        )}
      </div>

      <div
        ref={containerRef}
        aria-label="Charging stations map"
        className={`absolute inset-0 transition-opacity duration-500 ${
          mapState === "ready" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <motion.button
        type="button"
        onClick={requestLocation}
        disabled={locationState === "locating"}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        transition={spring}
        aria-label={locationLabel}
        title={locationLabel}
        aria-pressed={driverLocation ? true : undefined}
        className={`absolute bottom-20 right-3 z-30 grid h-11 w-11 place-items-center rounded-full border shadow-[0_12px_30px_rgba(17,21,16,0.2)] backdrop-blur-xl transition-colors disabled:cursor-wait ${
          driverLocation
            ? "border-[#111510] bg-[#111510] text-[#dfff69]"
            : locationState === "error"
              ? "border-[#c84d3d]/30 bg-white/95 text-[#c84d3d]"
              : "border-black/10 bg-white/95 text-[#111510]"
        }`}
      >
        {locationState === "error" ? (
          <LocateOff className="h-4 w-4" />
        ) : (
          <motion.span
            animate={
              locationState === "locating" ? { rotate: 360 } : { rotate: 0 }
            }
            transition={
              locationState === "locating"
                ? {
                    duration: 1,
                    ease: "linear",
                    repeat: Infinity,
                  }
                : spring
            }
          >
            <LocateFixed className="h-4 w-4" />
          </motion.span>
        )}
      </motion.button>
    </div>
  );
};

export default ChargingMap;
