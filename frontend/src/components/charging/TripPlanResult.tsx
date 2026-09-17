import { motion } from "framer-motion";
import type {
  TripPlanningResult,
  TripStopOption,
} from "../../lib/tripPlanning";
import { stationPosition } from "../../lib/tripPlanning";

interface TripPlanResultProps {
  result: TripPlanningResult;
  selectedOption: TripStopOption | null;
  onSelect: (option: TripStopOption) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const formatMoney = (value: number): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

const formatDistance = (value: number): string =>
  value < 10 ? `${value.toFixed(1)} km` : `${Math.round(value)} km`;

const routeUrl = (
  result: TripPlanningResult,
  option?: TripStopOption,
): string => {
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
  });

  if (result.origin) {
    parameters.set(
      "origin",
      `${result.origin.position.lat},${result.origin.position.lng}`,
    );
  }

  if (result.destination) {
    parameters.set(
      "destination",
      `${result.destination.position.lat},${result.destination.position.lng}`,
    );
  }

  const stop = option ? stationPosition(option.station) : null;
  if (stop) parameters.set("waypoints", `${stop.lat},${stop.lng}`);

  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
};

const TripPlanResult = ({
  result,
  selectedOption,
  onSelect,
}: TripPlanResultProps) => {
  const { origin, destination, direct, primary, fallback, issue } = result;

  if (!origin || !destination) {
    return issue ? (
      <p className="mb-5 rounded-3xl bg-[#fff0ed] px-4 py-3 text-sm font-medium text-[#9b2f21]">
        {issue}
      </p>
    ) : null;
  }

  const activeOption = selectedOption ?? primary;
  const alternateOption =
    activeOption?.station.id === primary?.station.id ? fallback : primary;
  return (
    <motion.section
      key={`${origin.label}:${destination.label}:${activeOption?.station.id ?? "direct"}`}
      initial={{ opacity: 0, y: -12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      aria-live="polite"
      className="mb-5 overflow-hidden rounded-[2rem] bg-[#dfff69] shadow-[0_20px_55px_rgba(73,91,22,0.2)]"
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <span className="rounded-full bg-[#111510] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#dfff69]">
          AI plan
        </span>
        <span className="text-[11px] font-medium text-[#111510]/55">
          Trip estimate
        </span>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <h2 className="truncate text-[clamp(1.35rem,5vw,2rem)] font-semibold tracking-[-0.05em]">
          {origin.label} → {destination.label}
        </h2>

        {issue && !primary && !direct && (
          <p className="mt-3 text-sm font-medium text-[#6f251b]">{issue}</p>
        )}

        {direct && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#111510]/10">
              <div className="bg-white/55 p-3">
                <span className="block text-lg font-semibold">
                  {direct.driveMinutes} min
                </span>
                <span className="text-[11px] text-[#111510]/55">Drive</span>
              </div>
              <div className="bg-white/55 p-3">
                <span className="block text-lg font-semibold">
                  {direct.arrivalBatteryPercent}%
                </span>
                <span className="text-[11px] text-[#111510]/55">
                  On arrival
                </span>
              </div>
              <div className="bg-white/55 p-3">
                <span className="block text-lg font-semibold">
                  {formatDistance(direct.distanceKm)}
                </span>
                <span className="text-[11px] text-[#111510]/55">Distance</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                No charging stop needed
              </span>
              <a
                href={routeUrl(result)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full bg-[#111510] px-4 py-2 text-xs font-semibold text-white transition-transform active:scale-95"
              >
                Open in Maps ↗
              </a>
            </div>
          </>
        )}

        {activeOption && (
          <>
            <motion.button
              type="button"
              onClick={() => onSelect(activeOption)}
              whileTap={{ scale: 0.99 }}
              transition={spring}
              className="mt-4 w-full rounded-[1.5rem] bg-[#111510] p-4 text-left text-white"
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#dfff69]">
                Charge here
              </span>
              <span className="mt-1 block truncate text-xl font-semibold tracking-[-0.035em]">
                {activeOption.station.name}
              </span>
              <span className="mt-1 block truncate text-xs text-white/50">
                {activeOption.connector.charger_name} ·{" "}
                {activeOption.availableCount} open
              </span>

              <span className="mt-4 grid grid-cols-4 gap-2">
                <span>
                  <strong className="block text-sm">
                    {activeOption.totalMinutes} min
                  </strong>
                  <small className="text-[10px] text-white/45">Total</small>
                </span>
                <span>
                  <strong className="block text-sm">
                    {activeOption.chargeMinutes} min
                  </strong>
                  <small className="text-[10px] text-white/45">Charging</small>
                </span>
                <span>
                  <strong className="block text-sm">
                    {formatMoney(activeOption.estimatedTotal)}
                  </strong>
                  <small className="text-[10px] text-white/45">Energy</small>
                </span>
                <span>
                  <strong className="block text-sm">
                    {activeOption.arrivalBatteryPercent}%
                  </strong>
                  <small className="text-[10px] text-white/45">Arrival</small>
                </span>
              </span>
            </motion.button>

            <div className="mt-3 flex items-center justify-between gap-3">
              {alternateOption ? (
                <button
                  type="button"
                  onClick={() => onSelect(alternateOption)}
                  className="min-w-0 text-left text-xs text-[#111510]/60 hover:text-[#111510]"
                >
                  <span className="font-semibold text-[#111510]">
                    {activeOption.station.id === primary?.station.id
                      ? "Backup"
                      : "Recommended"}
                  </span>
                  {" · "}
                  <span className="truncate">
                    {alternateOption.station.name}
                  </span>
                  {" · "}
                  {alternateOption.totalMinutes} min
                </button>
              ) : (
                <span />
              )}

              <a
                href={routeUrl(result, activeOption)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold transition-transform active:scale-95"
              >
                Open in Maps ↗
              </a>
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
};

export default TripPlanResult;
