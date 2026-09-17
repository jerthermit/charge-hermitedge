import { motion } from "framer-motion";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ChargingSession,
  DecimalValue,
  PublicConnector,
  Vehicle,
} from "../../types/charging";

interface ActiveChargePanelProps {
  session: ChargingSession;
  vehicle?: Vehicle;
  connector?: PublicConnector;
  onOpen: () => void;
}

const connectorLabels: Record<
  PublicConnector["connector_type"],
  string
> = {
  CCS2: "CCS2 · DC fast",
  TYPE_2: "Type 2 · AC",
  CHADEMO: "CHAdeMO · DC fast",
  GB_T: "GB/T · DC fast",
  NACS: "NACS · DC fast",
  OTHER: "Other connector",
};

const numberValue = (
  value: DecimalValue | null | undefined
): number => {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (
  value: number,
  minimum: number,
  maximum: number
): number =>
  Math.min(maximum, Math.max(minimum, value));

const parseApiTimestamp = (
  value: string | null | undefined
): number => {
  if (!value) return Number.NaN;

  const hasTimeZone =
    /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return Date.parse(hasTimeZone ? value : `${value}Z`);
};

const formatMoney = (
  value: number,
  currency: string
): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatTimeLeft = (
  seconds: number | null
): string => {
  if (seconds === null) {
    return "—";
  }

  if (seconds <= 30) {
    return "Target reached";
  }

  const minutes = Math.max(
    1,
    Math.ceil(seconds / 60)
  );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
};

const ActiveChargePanel = ({
  session,
  vehicle,
  connector,
  onOpen,
}: ActiveChargePanelProps) => {
  const [currentTime, setCurrentTime] =
    useState(() => Date.now());

  useEffect(() => {
    setCurrentTime(Date.now());

    if (session.status !== "charging") {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [session.id, session.status]);

  const progress = useMemo(() => {
    const storedEnergy = numberValue(
      session.energy_kwh
    );

    const storedTotal = numberValue(
      session.total_amount
    );

    const startBattery = numberValue(
      session.start_battery_percent
    );

    const targetBattery = numberValue(
      session.target_battery_percent
    );

    const capacity = numberValue(
      vehicle?.battery_capacity_kwh
    );

    const vehicleLimit = numberValue(
      vehicle?.max_dc_power_kw
    );

    const chargerLimit = numberValue(
      connector?.max_power_kw
    );

    const recordedPower = numberValue(
      session.history.find(
        (event) =>
          event.event_type === "session_ready"
      )?.detail.effective_power_kw as
        | DecimalValue
        | undefined
    );

    const effectivePower =
      recordedPower > 0
        ? recordedPower
        : vehicleLimit > 0 && chargerLimit > 0
          ? Math.min(
              vehicleLimit,
              chargerLimit
            )
          : Math.max(
              vehicleLimit,
              chargerLimit
            );

    const requiredEnergy =
      capacity > 0 &&
      targetBattery > startBattery
        ? capacity *
          ((targetBattery - startBattery) /
            100)
        : 0;

    const progressStartedAt = parseApiTimestamp(
      storedEnergy > 0
        ? session.updated_at
        : session.started_at ?? session.updated_at
    );

    const secondsSinceUpdate =
      session.status === "charging" &&
      Number.isFinite(progressStartedAt)
        ? Math.max(
            0,
            (currentTime - progressStartedAt) / 1000
          )
        : 0;

    const addedSinceUpdate =
      effectivePower > 0
        ? effectivePower *
          (secondsSinceUpdate / 3600)
        : 0;

    const estimatedEnergy =
      requiredEnergy > 0
        ? clamp(
            storedEnergy + addedSinceUpdate,
            0,
            requiredEnergy
          )
        : storedEnergy;

    const progressRatio =
      requiredEnergy > 0
        ? clamp(
            estimatedEnergy / requiredEnergy,
            0,
            1
          )
        : 0;

    const battery =
      targetBattery > startBattery
        ? startBattery +
          (targetBattery - startBattery) *
            progressRatio
        : targetBattery || startBattery;

    const pricePerKwh = numberValue(
      session.unit_price_per_kwh
    );

    const estimatedTotal = Math.max(
      storedTotal,
      estimatedEnergy * pricePerKwh
    );

    const remainingEnergy = Math.max(
      0,
      requiredEnergy - estimatedEnergy
    );

    const remainingSeconds =
      effectivePower > 0 &&
      requiredEnergy > 0
        ? (remainingEnergy /
            effectivePower) *
          3600
        : null;

    return {
      battery,
      effectivePower,
      estimatedEnergy,
      estimatedTotal,
      progressPercent: progressRatio * 100,
      remainingSeconds,
      targetBattery,
    };
  }, [
    connector?.max_power_kw,
    currentTime,
    session,
    vehicle?.battery_capacity_kwh,
    vehicle?.max_dc_power_kw,
  ]);

  const vehicleName = vehicle
    ? `${vehicle.make} ${vehicle.model}`
    : null;

  const connectorName = connector
    ? connectorLabels[
        connector.connector_type
      ]
    : connectorLabels[
        session.connector_type
      ];

  if (session.status === "ready") {
    return (
      <motion.button
        id="active-charge"
        type="button"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.995 }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 34,
        }}
        onClick={onOpen}
        className="mb-5 w-full scroll-mt-24 overflow-hidden rounded-[2rem] bg-[#111510] p-5 text-left text-white shadow-[0_18px_45px_rgba(17,21,16,0.18)] outline-none focus-visible:ring-2 focus-visible:ring-[#111510] focus-visible:ring-offset-2 sm:p-6"
        aria-label={`Open held connector at ${session.station_name}`}
      >
        <div className="flex min-w-0 items-center justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#dfff69]">
              <span className="h-2 w-2 rounded-full bg-[#dfff69]" />
              Start interrupted
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.04em]">
              {session.station_name}
            </h2>
            <p className="mt-1 truncate text-xs text-white/45">
              {[vehicleName, connectorName].filter(Boolean).join(" · ")}
            </p>
          </div>

          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg text-[#dfff69]"
          >
            →
          </span>
        </div>
      </motion.button>
    );
  }

  const isCharging = session.status === "charging";
  const isActivelyCharging =
    isCharging &&
    (progress.remainingSeconds === null ||
      progress.remainingSeconds > 30);
  const connectionLabel = isActivelyCharging
    ? "Connected"
    : isCharging
      ? "Target reached"
      : "Connecting";

  return (
    <motion.button
      id="active-charge"
      type="button"
      initial={{
        opacity: 0,
        y: -8,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      whileTap={{ scale: 0.995 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 34,
      }}
      onClick={onOpen}
      className="mb-5 w-full scroll-mt-24 overflow-hidden rounded-[2rem] bg-[#111510] text-left text-white shadow-[0_18px_45px_rgba(17,21,16,0.18)] outline-none focus-visible:ring-2 focus-visible:ring-[#111510] focus-visible:ring-offset-2"
      aria-label={`Open live session at ${session.station_name}`}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#dfff69]" />

              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">
                {session.status === "charging" ? "Live estimate" : "Session"}
              </span>
            </div>

            <h2 className="mt-2 truncate text-lg font-semibold tracking-[-0.035em] sm:text-xl">
              {session.station_name}
            </h2>

            <p className="mt-1 truncate text-xs text-white/45">
              {[
                vehicleName,
                connectorName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
              <span className="text-3xl font-semibold tracking-[-0.045em]">
                {progress.battery.toFixed(1)}
              </span>
              <span className="text-base leading-none tracking-normal text-white/35">
                %
              </span>
            </div>

            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Target{" "}
              {Math.round(
                progress.targetBattery
              )}
              %
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(4rem,1fr)_minmax(3.5rem,0.55fr)_minmax(4rem,1fr)] items-center gap-2 rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-3 sm:gap-4 sm:p-4">
          <div className="min-w-0">
            <svg
              viewBox="0 0 92 42"
              aria-hidden="true"
              className="h-9 w-full max-w-[5.25rem] text-white sm:h-10"
            >
              <path
                d="M12 28h4l7-12c1.4-2.4 3.7-4 6.6-4h27.8c3.2 0 5.6 1.4 7.3 4l7.5 12H80c3.3 0 6 2.7 6 6v1H6v-1c0-3.3 2.7-6 6-6Z"
                fill="currentColor"
              />
              <circle cx="24" cy="35" r="5" fill="#111510" stroke="currentColor" strokeWidth="3" />
              <circle cx="68" cy="35" r="5" fill="#111510" stroke="currentColor" strokeWidth="3" />
              <path d="M31 16h24l7 12H24l7-12Z" fill="#111510" opacity=".72" />
            </svg>
            <div className="mt-2 truncate text-xs font-semibold">
              {vehicleName ?? "Your EV"}
            </div>
          </div>

          <div className="relative flex min-w-0 flex-col items-center">
            <div className="relative h-px w-full overflow-visible bg-white/15">
              {isActivelyCharging &&
                [0, 0.34, 0.68].map((delay) => (
                  <motion.span
                    key={delay}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#dfff69] shadow-[0_0_14px_rgba(223,255,105,0.8)]"
                    initial={{ left: "100%", opacity: 0 }}
                    animate={{ left: "0%", opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.55, delay, repeat: Infinity, ease: "linear" }}
                  />
                ))}
            </div>
            <span className="mt-3 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.1em] text-[#dfff69]">
              {connectionLabel}
            </span>
          </div>

          <div className="min-w-0 text-right">
            <svg
              viewBox="0 0 44 52"
              aria-hidden="true"
              className="ml-auto h-10 w-9 text-[#dfff69]"
            >
              <rect x="7" y="3" width="27" height="43" rx="6" fill="currentColor" />
              <rect x="12" y="9" width="17" height="12" rx="2" fill="#111510" />
              <path d="M34 14c6 0 7 5 7 10v10c0 4-2 6-5 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="m18 25-4 7h6l-2 8 9-11h-6l3-4h-6Z" fill="#111510" />
              <path d="M3 48h36" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div className="mt-1 truncate text-xs font-semibold">
              {connector?.charger_name ?? session.station_name}
            </div>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Estimated session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            progress.progressPercent
          )}
          className="h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <motion.span
            className="block h-full rounded-full bg-[#dfff69]"
            animate={{
              width: `${progress.progressPercent}%`,
            }}
            transition={{
              duration: 0.8,
              ease: "linear",
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/35">
              Time left
            </div>

            <div className="mt-1 text-sm font-semibold">
              {formatTimeLeft(
                progress.remainingSeconds
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/35">
              Power
            </div>

            <div className="mt-1 text-sm font-semibold">
              {progress.effectivePower > 0
                ? `${Math.round(
                    progress.effectivePower
                  )} kW`
                : "—"}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/35">
              Energy
            </div>

            <div className="mt-1 text-sm font-semibold">
              {progress.estimatedEnergy.toFixed(
                2
              )}{" "}
              kWh
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/35">
              Cost
            </div>

            <div className="mt-1 text-sm font-semibold">
              {formatMoney(
                progress.estimatedTotal,
                session.currency_code
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
};

export default ActiveChargePanel;
