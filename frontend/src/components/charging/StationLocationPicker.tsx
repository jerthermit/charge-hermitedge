import { motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadGoogleMaps } from "./ChargingMap";

interface StationLocationValue {
  latitude: string;
  longitude: string;
}

interface StationLocationPickerProps
  extends StationLocationValue {
  onChange: (value: StationLocationValue) => void;
  disabled?: boolean;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

interface MapMouseEvent {
  latLng: GoogleLatLng | null;
}

interface MapEventListener {
  remove(): void;
}

interface MapView {
  addListener(
    eventName: "click",
    handler: (event: MapMouseEvent) => void
  ): MapEventListener;
  panTo(position: LatLng): void;
  setCenter(position: LatLng): void;
  setZoom(zoom: number): void;
}

interface StationMarker {
  gmpDraggable: boolean;
  map: MapView | null;
  position: LatLng | GoogleLatLng | null;
  append(...nodes: Node[]): void;
  addListener(
    eventName: "dragend",
    handler: () => void
  ): MapEventListener;
}

interface MapsLibrary {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>
  ) => MapView;
}

interface MarkerLibrary {
  AdvancedMarkerElement: new (options: {
    map: MapView;
    position: LatLng;
    title: string;
    gmpDraggable: boolean;
  }) => StationMarker;
}

type MapState = "fallback" | "loading" | "ready";

const MANILA_CENTER: LatLng = {
  lat: 14.5995,
  lng: 120.9842,
};

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const isValidPosition = (
  position: LatLng
): boolean =>
  Number.isFinite(position.lat) &&
  Number.isFinite(position.lng) &&
  position.lat >= -90 &&
  position.lat <= 90 &&
  position.lng >= -180 &&
  position.lng <= 180;

const parseCoordinate = (
  latitude: string,
  longitude: string
): LatLng | null => {
  if (!latitude.trim() || !longitude.trim()) {
    return null;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!isValidPosition({ lat, lng })) {
    return null;
  }

  return { lat, lng };
};

const markerPosition = (
  value: StationMarker["position"]
): LatLng | null => {
  if (!value) return null;

  const lat =
    typeof value.lat === "function"
      ? value.lat()
      : value.lat;
  const lng =
    typeof value.lng === "function"
      ? value.lng()
      : value.lng;

  const position = { lat, lng };

  return isValidPosition(position)
    ? position
    : null;
};

const createStationPin = (): HTMLDivElement => {
  const pin = document.createElement("div");
  pin.setAttribute("aria-hidden", "true");
  pin.style.alignItems = "center";
  pin.style.background = "#111510";
  pin.style.border = "4px solid #ffffff";
  pin.style.borderRadius = "999px 999px 999px 3px";
  pin.style.boxShadow =
    "0 14px 34px rgba(17, 21, 16, 0.28)";
  pin.style.display = "flex";
  pin.style.height = "42px";
  pin.style.justifyContent = "center";
  pin.style.transform = "rotate(-45deg)";
  pin.style.width = "42px";

  const center = document.createElement("span");
  center.style.background = "#dfff69";
  center.style.borderRadius = "999px";
  center.style.height = "11px";
  center.style.transform = "rotate(45deg)";
  center.style.width = "11px";
  pin.append(center);

  return pin;
};

const StationLocationPicker = ({
  latitude,
  longitude,
  onChange,
  disabled = false,
}: StationLocationPickerProps) => {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const mapId =
    import.meta.env.VITE_GOOGLE_MAP_ID?.trim() ||
    "DEMO_MAP_ID";

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<StationMarker | null>(null);
  const mapListenerRef = useRef<MapEventListener | null>(null);
  const markerListenerRef = useRef<MapEventListener | null>(null);
  const markerConstructorRef = useRef<
    MarkerLibrary["AdvancedMarkerElement"] | null
  >(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const coordinateRef = useRef<LatLng | null>(null);
  const lastCenteredRef = useRef<string>("");

  const [mapState, setMapState] =
    useState<MapState>(apiKey ? "loading" : "fallback");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);

  const coordinate = useMemo(
    () => parseCoordinate(latitude, longitude),
    [latitude, longitude]
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;

    if (markerRef.current) {
      markerRef.current.gmpDraggable = !disabled;
    }
  }, [disabled]);

  useEffect(() => {
    coordinateRef.current = coordinate;
  }, [coordinate]);

  const commitCoordinate = useCallback(
    (position: LatLng) => {
      if (!isValidPosition(position)) {
        setLocationError(true);
        return;
      }

      onChangeRef.current({
        latitude: position.lat.toFixed(6),
        longitude: position.lng.toFixed(6),
      });
      setLocationError(false);
    },
    []
  );

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!apiKey || !container) {
      setMapState("fallback");
      return;
    }

    let cancelled = false;
    setMapState("loading");

    const initialize = async () => {
      try {
        const google = await loadGoogleMaps(apiKey);
        const [mapsResult, markerResult] = await Promise.all([
          google.maps.importLibrary("maps"),
          google.maps.importLibrary("marker"),
        ]);

        if (cancelled) return;

        const maps = mapsResult as MapsLibrary;
        const marker = markerResult as MarkerLibrary;
        const startingPoint =
          coordinateRef.current ?? MANILA_CENTER;

        const mapView = new maps.Map(container, {
          center: startingPoint,
          zoom: coordinateRef.current ? 16 : 11,
          mapId,
          backgroundColor: "#dce5dc",
          clickableIcons: false,
          disableDefaultUI: true,
          fullscreenControl: false,
          gestureHandling: "greedy",
          keyboardShortcuts: true,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
        });

        mapRef.current = mapView;
        markerConstructorRef.current =
          marker.AdvancedMarkerElement;
        mapListenerRef.current = mapView.addListener(
          "click",
          (event) => {
            if (disabledRef.current || !event.latLng) return;

            commitCoordinate({
              lat: event.latLng.lat(),
              lng: event.latLng.lng(),
            });
          }
        );
        setMapState("ready");
      } catch {
        if (!cancelled) setMapState("fallback");
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      mapListenerRef.current?.remove();
      markerListenerRef.current?.remove();

      if (markerRef.current) {
        markerRef.current.map = null;
      }

      mapListenerRef.current = null;
      markerListenerRef.current = null;
      markerRef.current = null;
      mapRef.current = null;
      markerConstructorRef.current = null;
    };
  }, [apiKey, commitCoordinate, mapId]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarker = markerConstructorRef.current;

    if (mapState !== "ready" || !map || !AdvancedMarker) {
      return;
    }

    if (!coordinate) {
      lastCenteredRef.current = "";
      markerListenerRef.current?.remove();
      markerListenerRef.current = null;

      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }

      return;
    }

    if (!markerRef.current) {
      const marker = new AdvancedMarker({
        map,
        position: coordinate,
        title: "Station location. Drag to move.",
        gmpDraggable: !disabled,
      });
      marker.append(createStationPin());
      markerListenerRef.current = marker.addListener(
        "dragend",
        () => {
          const position = markerPosition(marker.position);
          if (position) commitCoordinate(position);
        }
      );
      markerRef.current = marker;
    } else {
      markerRef.current.map = map;
      markerRef.current.position = coordinate;
    }

    const coordinateKey = `${coordinate.lat}:${coordinate.lng}`;

    if (lastCenteredRef.current !== coordinateKey) {
      map.panTo(coordinate);
      map.setZoom(16);
      lastCenteredRef.current = coordinateKey;
    }
  }, [commitCoordinate, coordinate, disabled, mapState]);

  const changeCoordinate = (
    field: keyof StationLocationValue,
    value: string
  ) => {
    onChangeRef.current({
      latitude:
        field === "latitude"
          ? value
          : latitude,
      longitude:
        field === "longitude"
          ? value
          : longitude,
    });
    setLocationError(false);
  };

  const useCurrentLocation = () => {
    if (disabled || locating) return;

    if (!("geolocation" in navigator)) {
      setLocationError(true);
      return;
    }

    setLocating(true);
    setLocationError(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        commitCoordinate(next);
        mapRef.current?.setCenter(next);
        mapRef.current?.setZoom(16);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      }
    );
  };

  return (
    <div
      className="relative h-72 overflow-hidden rounded-[1.6rem] border border-black/10 bg-[#dce5dc]"
      aria-busy={mapState === "loading"}
    >
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          mapState === "ready"
            ? "pointer-events-none opacity-0"
            : "opacity-100"
        }`}
      >
        <div className="flex h-full flex-col justify-center bg-[#f1f2ed] p-5 text-[#111510]">
          <div className="text-sm font-semibold">
            Station coordinates
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#747b73]">
                Latitude
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="-90"
                max="90"
                step="0.000001"
                value={latitude}
                disabled={disabled}
                onChange={(event) =>
                  changeCoordinate(
                    "latitude",
                    event.target.value
                  )
                }
                placeholder="14.599500"
                className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-black disabled:opacity-50"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#747b73]">
                Longitude
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="-180"
                max="180"
                step="0.000001"
                value={longitude}
                disabled={disabled}
                onChange={(event) =>
                  changeCoordinate(
                    "longitude",
                    event.target.value
                  )
                }
                placeholder="120.984200"
                className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-black disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mt-3 text-xs text-[#747b73]">
            {mapState === "loading"
              ? "Loading map…"
              : coordinate
                ? "Coordinates ready"
                : "Enter coordinates"}
          </div>

          {locationError && (
            <div
              role="status"
              className="mt-2 text-xs font-semibold text-[#8b2e20]"
            >
              Location unavailable
            </div>
          )}
        </div>
      </div>

      <div
        ref={mapContainerRef}
        aria-label="Station location map"
        className={`absolute inset-0 transition-opacity duration-500 ${
          mapState === "ready"
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {mapState === "ready" && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-white/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#596159] shadow-sm backdrop-blur">
          {coordinate ? "Pinned" : "Tap map"}
        </div>
      )}

      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        transition={spring}
        disabled={disabled || locating}
        onClick={useCurrentLocation}
        aria-label="Use current location"
        className="absolute right-3 top-3 z-20 flex h-11 items-center rounded-full border border-black/10 bg-white px-3 text-xs font-semibold text-[#111510] shadow-[0_10px_26px_rgba(17,21,16,0.15)] disabled:opacity-50"
      >
        {locating
          ? "Locating…"
          : "My location"}
      </motion.button>

      {locationError &&
        mapState === "ready" && (
          <div
            role="status"
            className="absolute right-3 top-16 z-20 rounded-full bg-[#fff0ec] px-3 py-2 text-[10px] font-semibold text-[#8b2e20] shadow-sm"
          >
            Location unavailable
          </div>
        )}
    </div>
  );
};

export default StationLocationPicker;
