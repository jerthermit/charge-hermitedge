import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { chargingService } from "../../services/chargingService";
import type {
  ConnectorType,
  DecimalValue,
  DriverWorkspace,
  Vehicle,
} from "../../types/charging";

interface VehicleGarageProps {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onSelect: (vehicleId: string) => void;
}

interface VehicleDraft {
  nickname: string;
  make: string;
  model: string;
  year: string;
  batteryCapacityKwh: string;
  connectorType: ConnectorType;
  maxDcPowerKw: string;
  batteryPercent: string;
}

const DRIVER_QUERY_KEY = ["charging", "driver"] as const;

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const connectorLabels: Record<ConnectorType, string> = {
  CCS2: "CCS2 · DC fast",
  TYPE_2: "Type 2 · AC",
  CHADEMO: "CHAdeMO · DC fast",
  GB_T: "GB/T · DC fast",
  NACS: "NACS · DC fast",
  OTHER: "Other plug",
};

const connectorShortLabels: Record<ConnectorType, string> = {
  CCS2: "CCS2",
  TYPE_2: "Type 2",
  CHADEMO: "CHAdeMO",
  GB_T: "GB/T",
  NACS: "NACS",
  OTHER: "Other plug",
};

const connectorOptions = Object.entries(
  connectorLabels
) as Array<[ConnectorType, string]>;

const currentYear = new Date().getFullYear();

const createDraft = (): VehicleDraft => ({
  nickname: "",
  make: "",
  model: "",
  year: String(currentYear),
  batteryCapacityKwh: "60",
  connectorType: "CCS2",
  maxDcPowerKw: "80",
  batteryPercent: "50",
});

const numberValue = (
  value: DecimalValue | null | undefined
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const batteryValue = (vehicle?: Vehicle): number | null =>
  vehicle?.battery_percent == null
    ? null
    : Math.round(numberValue(vehicle.battery_percent));

const vehicleIdentity = (vehicle: Vehicle): string =>
  `${vehicle.make} ${vehicle.model}`;

const vehicleName = (vehicle: Vehicle): string =>
  vehicle.nickname?.trim() || vehicleIdentity(vehicle);

const vehicleSecondaryLine = (vehicle: Vehicle): string => {
  if (vehicle.nickname?.trim()) {
    return vehicleIdentity(vehicle);
  }

  return [
    vehicle.model_year,
    connectorShortLabels[vehicle.connector_type],
  ]
    .filter(Boolean)
    .join(" · ");
};

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

const VehicleGarage = ({
  vehicles,
  selectedVehicleId,
  onSelect,
}: VehicleGarageProps) => {
  const queryClient = useQueryClient();
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);

  const selectedVehicle =
    vehicles.find(
      (vehicle) => vehicle.id === selectedVehicleId
    ) ?? vehicles[0];

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [batteryDraft, setBatteryDraft] = useState(50);
  const [draft, setDraft] = useState<VehicleDraft>(
    createDraft
  );

  const commitVehicle = (
    vehicle: Vehicle,
    append = false
  ) => {
    queryClient.setQueryData<DriverWorkspace>(
      DRIVER_QUERY_KEY,
      (current) => {
        if (!current) return current;

        const exists = current.vehicles.some(
          (item) => item.id === vehicle.id
        );
        const nextVehicles =
          append && !exists
            ? [...current.vehicles, vehicle]
            : current.vehicles.map((item) =>
                item.id === vehicle.id
                  ? vehicle
                  : vehicle.is_default
                    ? {
                        ...item,
                        is_default: false,
                      }
                    : item
              );

        return {
          ...current,
          vehicles: [...nextVehicles].sort(
            (left, right) =>
              Number(right.is_default) -
              Number(left.is_default)
          ),
        };
      }
    );

    void queryClient.invalidateQueries({
      queryKey: DRIVER_QUERY_KEY,
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const make = draft.make.trim();
      const model = draft.model.trim();
      const year = Number(draft.year);
      const batteryCapacity = Number(
        draft.batteryCapacityKwh
      );
      const maxPower = Number(draft.maxDcPowerKw);
      const battery = Number(draft.batteryPercent);

      if (!make || !model) {
        throw new Error("Enter the car make and model.");
      }

      if (
        !Number.isInteger(year) ||
        year < 2008 ||
        year > currentYear + 1
      ) {
        throw new Error("Enter a valid model year.");
      }

      if (
        !Number.isFinite(batteryCapacity) ||
        batteryCapacity <= 0
      ) {
        throw new Error("Enter a valid battery size.");
      }

      if (!Number.isFinite(maxPower) || maxPower <= 0) {
        throw new Error("Enter a valid charging speed.");
      }

      if (
        !Number.isFinite(battery) ||
        battery < 0 ||
        battery > 100
      ) {
        throw new Error("Battery must be from 0 to 100%.");
      }

      return chargingService.createVehicle({
        nickname: draft.nickname.trim() || null,
        make,
        model,
        model_year: year,
        battery_capacity_kwh: batteryCapacity,
        connector_type: draft.connectorType,
        max_dc_power_kw: maxPower,
        battery_percent: battery,
        is_default: vehicles.length === 0,
      });
    },
    onSuccess: (vehicle) => {
      commitVehicle(vehicle, true);
      onSelect(vehicle.id);
      setDraft(createDraft());
      setAdding(false);
    },
  });

  const batteryMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVehicle) {
        throw new Error("Choose a car first.");
      }

      return chargingService.updateVehicleBattery(
        selectedVehicle.id,
        {
          battery_percent: batteryDraft,
        }
      );
    },
    onSuccess: (vehicle) => {
      commitVehicle(vehicle);
    },
  });

  const defaultMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVehicle) {
        throw new Error("Choose a car first.");
      }

      return chargingService.updateVehicle(
        selectedVehicle.id,
        { is_default: true }
      );
    },
    onSuccess: (vehicle) => {
      commitVehicle(vehicle);
      onSelect(vehicle.id);
    },
  });

  const busy =
    createMutation.isPending ||
    batteryMutation.isPending ||
    defaultMutation.isPending;

  busyRef.current = busy;

  const mutationError =
    createMutation.error ||
    batteryMutation.error ||
    defaultMutation.error;

  const resetErrors = () => {
    createMutation.reset();
    batteryMutation.reset();
    defaultMutation.reset();
  };

  const closeGarage = () => {
    if (busy) return;

    setOpen(false);
    setAdding(false);
    resetErrors();
  };

  useEffect(() => {
    const savedBattery = batteryValue(selectedVehicle);
    setBatteryDraft(savedBattery ?? 50);
  }, [selectedVehicle]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const triggerButton = triggerButtonRef.current;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        setOpen(false);
        setAdding(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          element.offsetParent !== null
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerButton?.focus();
    };
  }, [open]);

  const savedBattery = batteryValue(selectedVehicle);
  const batteryChanged =
    Boolean(selectedVehicle) &&
    savedBattery !== batteryDraft;

  return (
    <>
      <motion.button
        ref={triggerButtonRef}
        type="button"
        whileTap={{ scale: 0.98 }}
        transition={spring}
        onClick={() => {
          resetErrors();
          setAdding(vehicles.length === 0);
          setOpen(true);
        }}
        className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-left shadow-[0_12px_40px_rgba(22,28,20,0.08)] outline-none transition-colors hover:border-black/20 focus-visible:ring-2 focus-visible:ring-black sm:w-auto sm:min-w-[12rem]"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          selectedVehicle
            ? `Open cars. ${vehicleName(selectedVehicle)}, ${savedBattery ?? "unknown"} percent battery.`
            : "Add a car"
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block max-w-40 truncate text-sm font-semibold">
            {selectedVehicle
              ? vehicleName(selectedVehicle)
              : "Add a car"}
          </span>
          {selectedVehicle && (
            <span className="mt-0.5 block max-w-40 truncate text-xs text-[#697068]">
              {vehicleSecondaryLine(selectedVehicle)}
            </span>
          )}
        </span>

        <span className="grid min-w-[3.45rem] place-items-center rounded-xl bg-[#111510] px-2 py-1.5 text-center text-white">
          <span className="text-base font-semibold leading-none tracking-[-0.04em]">
            {savedBattery == null ? "—" : `${savedBattery}%`}
          </span>
          <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Battery
          </span>
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[110] flex items-end justify-end sm:p-4">
            <motion.button
              type="button"
              tabIndex={-1}
              aria-label="Close cars"
              onClick={closeGarage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            />

            <motion.section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="vehicle-garage-title"
              initial={{ opacity: 0, x: 70, y: 28 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 70, y: 28 }}
              transition={spring}
              className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-[#f1f2ed] text-[#111510] shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:max-w-xl sm:rounded-[2rem]"
            >
              <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  {adding && vehicles.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAdding(false);
                        resetErrors();
                      }}
                      className="grid h-10 w-10 place-items-center rounded-full bg-white outline-none transition-colors hover:bg-black/5 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-black"
                      aria-label="Back to cars"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  )}

                  <h2
                    id="vehicle-garage-title"
                    className="text-2xl font-semibold tracking-[-0.045em]"
                  >
                    {adding ? "Add car" : "Cars"}
                  </h2>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  disabled={busy}
                  onClick={closeGarage}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white outline-none transition-colors hover:bg-black/5 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-black"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-y-auto p-5 sm:p-6">
                {adding ? (
                  <form
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      createMutation.mutate();
                    }}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2 sm:col-span-2">
                        <span className="text-xs font-semibold">
                          Nickname <span className="font-normal text-black/40">optional</span>
                        </span>
                        <input
                          maxLength={100}
                          value={draft.nickname}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              nickname: event.target.value,
                            }))
                          }
                          placeholder="Daily car"
                          className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-colors focus:border-black"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Make
                        </span>
                        <input
                          required
                          maxLength={100}
                          value={draft.make}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              make: event.target.value,
                            }))
                          }
                          placeholder="BYD"
                          className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-colors focus:border-black"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Model
                        </span>
                        <input
                          required
                          maxLength={120}
                          value={draft.model}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              model: event.target.value,
                            }))
                          }
                          placeholder="Atto 3"
                          className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-colors focus:border-black"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Year
                        </span>
                        <input
                          required
                          type="number"
                          inputMode="numeric"
                          min={2008}
                          max={currentYear + 1}
                          value={draft.year}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              year: event.target.value,
                            }))
                          }
                          className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-colors focus:border-black"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Plug type
                        </span>
                        <select
                          value={draft.connectorType}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              connectorType: event.target
                                .value as ConnectorType,
                            }))
                          }
                          className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-colors focus:border-black"
                        >
                          {connectorOptions.map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Battery size
                        </span>
                        <span className="flex h-12 items-center rounded-2xl border border-black/10 bg-white pr-4 transition-colors focus-within:border-black">
                          <input
                            required
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.01"
                            value={draft.batteryCapacityKwh}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                batteryCapacityKwh:
                                  event.target.value,
                              }))
                            }
                            className="min-w-0 flex-1 bg-transparent px-4 outline-none"
                          />
                          <span className="text-xs font-semibold text-black/35">
                            kWh
                          </span>
                        </span>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">
                          Fast-charge limit
                        </span>
                        <span className="flex h-12 items-center rounded-2xl border border-black/10 bg-white pr-4 transition-colors focus-within:border-black">
                          <input
                            required
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.01"
                            value={draft.maxDcPowerKw}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                maxDcPowerKw: event.target.value,
                              }))
                            }
                            className="min-w-0 flex-1 bg-transparent px-4 outline-none"
                          />
                          <span className="text-xs font-semibold text-black/35">
                            kW
                          </span>
                        </span>
                      </label>

                      <label className="grid gap-3 sm:col-span-2">
                        <span className="flex items-end justify-between text-xs font-semibold">
                          Battery now
                          <span className="text-2xl tracking-[-0.05em]">
                            {draft.batteryPercent}%
                          </span>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={draft.batteryPercent}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              batteryPercent: event.target.value,
                            }))
                          }
                          aria-label="Current battery percentage"
                          className="h-2 w-full cursor-pointer accent-[#111510]"
                        />
                      </label>
                    </div>

                    {createMutation.error && (
                      <div
                        role="alert"
                        className="mt-5 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]"
                      >
                        {errorMessage(createMutation.error)}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#111510] text-sm font-semibold text-white outline-none transition-[transform,opacity] active:translate-y-px disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                      {createMutation.isPending
                        ? "Adding…"
                        : "Add car"}
                    </button>
                  </form>
                ) : (
                  <>
                    <div
                      className="flex gap-2 overflow-x-auto pb-2"
                      aria-label="Saved cars"
                    >
                      {vehicles.map((vehicle) => {
                        const selected =
                          vehicle.id === selectedVehicle?.id;
                        const battery = batteryValue(vehicle);

                        return (
                          <motion.button
                            key={vehicle.id}
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            transition={spring}
                            onClick={() => {
                              onSelect(vehicle.id);
                              resetErrors();
                            }}
                            aria-pressed={selected}
                            className={`flex min-w-[13rem] items-center gap-3 rounded-2xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black ${
                              selected
                                ? "border-[#111510] bg-[#111510] text-white"
                                : "border-black/10 bg-white hover:border-black/20"
                            }`}
                          >
                            <span
                              className={`grid h-11 min-w-14 shrink-0 place-items-center rounded-xl px-2 text-center ${
                                selected
                                  ? "bg-[#dfff69] text-[#111510]"
                                  : "bg-[#f1f2ed]"
                              }`}
                            >
                              <span className="text-base font-semibold tracking-[-0.04em]">
                                {battery == null ? "—" : `${battery}%`}
                              </span>
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {vehicleName(vehicle)}
                              </span>
                              <span
                                className={`mt-1 block truncate text-xs ${
                                  selected
                                    ? "text-white/50"
                                    : "text-black/45"
                                }`}
                              >
                                {vehicleSecondaryLine(vehicle)}
                              </span>
                            </span>

                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                selected
                                  ? "bg-[#dfff69]"
                                  : "bg-transparent"
                              }`}
                            />
                          </motion.button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setAdding(true);
                          resetErrors();
                        }}
                        className="min-w-[6.5rem] rounded-2xl border border-dashed border-black/20 bg-white/55 px-4 text-sm font-semibold text-black/55 outline-none transition-colors hover:border-black/40 hover:text-black focus-visible:ring-2 focus-visible:ring-black"
                      >
                        + Add car
                      </button>
                    </div>

                    {selectedVehicle && (
                      <motion.div
                        key={selectedVehicle.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={spring}
                        className="mt-5 overflow-hidden rounded-[2rem] border border-black/10 bg-white"
                      >
                        <div className="bg-[#111510] p-5 text-white sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="text-xs font-medium text-white/50">
                                {[
                                  selectedVehicle.model_year,
                                  connectorLabels[
                                    selectedVehicle.connector_type
                                  ],
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">
                                {vehicleIdentity(selectedVehicle)}
                              </h3>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-white/60">
                                {selectedVehicle.battery_source ===
                                "vehicle_api"
                                  ? "From car"
                                  : "Manual"}
                              </span>
                              {selectedVehicle.is_default && (
                                <span className="rounded-full bg-[#dfff69] px-3 py-1.5 text-[10px] font-semibold text-[#111510]">
                                  Default
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-6 grid grid-cols-2 divide-x divide-white/10 rounded-2xl border border-white/10 py-4">
                            <div className="px-4">
                              <div className="text-xl font-semibold tracking-[-0.04em]">
                                {numberValue(
                                  selectedVehicle.battery_capacity_kwh
                                ).toFixed(1)}
                                <span className="ml-1 text-xs text-white/40">
                                  kWh
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-white/40">
                                Battery size
                              </div>
                            </div>

                            <div className="px-4">
                              <div className="text-xl font-semibold tracking-[-0.04em]">
                                {numberValue(
                                  selectedVehicle.max_dc_power_kw
                                ).toFixed(0)}
                                <span className="ml-1 text-xs text-white/40">
                                  kW
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-white/40">
                                Fast-charge limit
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-5 sm:p-6">
                          <div className="flex items-end justify-between gap-4">
                            <div>
                              <div className="text-xs font-semibold text-black/45">
                                Battery now
                              </div>
                              <div className="mt-1 inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
                                <span className="text-5xl font-semibold tracking-[-0.045em]">
                                  {batteryDraft}
                                </span>
                                <span className="text-xl leading-none tracking-normal text-black/30">
                                  %
                                </span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-black/40">
                              {selectedVehicle.battery_source ===
                              "vehicle_api"
                                ? "Connected reading"
                                : "Manual update"}
                            </div>
                          </div>

                          <div
                            className="mt-5 h-3 overflow-hidden rounded-full bg-[#e3e5de]"
                            aria-hidden="true"
                          >
                            <motion.div
                              className="h-full rounded-full bg-[#111510]"
                              animate={{ width: `${batteryDraft}%` }}
                              transition={spring}
                            />
                          </div>

                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={batteryDraft}
                            onChange={(event) =>
                              setBatteryDraft(
                                Number(event.target.value)
                              )
                            }
                            aria-label="Battery percentage"
                            className="mt-5 h-2 w-full cursor-pointer accent-[#111510]"
                          />

                          <div className="mt-3 grid grid-cols-5 gap-1.5">
                            {[20, 40, 60, 80, 100].map(
                              (value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() =>
                                    setBatteryDraft(value)
                                  }
                                  className={`h-9 rounded-xl text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black ${
                                    batteryDraft === value
                                      ? "bg-[#dfff69]"
                                      : "bg-[#f1f2ed] text-black/45 hover:text-black"
                                  }`}
                                >
                                  {value}%
                                </button>
                              )
                            )}
                          </div>

                          {mutationError && !createMutation.error && (
                            <div
                              role="alert"
                              className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]"
                            >
                              {errorMessage(mutationError)}
                            </div>
                          )}

                          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={
                                !batteryChanged ||
                                batteryMutation.isPending
                              }
                              onClick={() =>
                                batteryMutation.mutate()
                              }
                              className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-[#111510] px-4 text-sm font-semibold text-white outline-none transition-[transform,opacity] active:translate-y-px disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                            >
                              {batteryMutation.isPending
                                ? "Saving…"
                                : "Save battery"}
                            </button>

                            {!selectedVehicle.is_default && (
                              <button
                                type="button"
                                disabled={defaultMutation.isPending}
                                onClick={() =>
                                  defaultMutation.mutate()
                                }
                                className="h-11 rounded-2xl border border-black/10 px-4 text-sm font-semibold outline-none transition-colors hover:border-black/25 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-black"
                              >
                                {defaultMutation.isPending
                                  ? "Saving…"
                                  : "Use by default"}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VehicleGarage;
