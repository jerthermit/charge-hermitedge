import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { chargingService } from "../../services/chargingService";
import type {
  ChargePlanIntent,
  ChargePlanPriority,
  DecimalValue,
} from "../../types/charging";
import type { LocationState } from "./ChargingMap";

interface ChargePlannerProps {
  assistantAvailable: boolean;
  plan: ChargePlanIntent | null;
  issue?: string | null;
  needsLocation?: boolean;
  locationState?: LocationState;
  onUseLocation?: () => void;
  onPlan: (plan: ChargePlanIntent) => void;
  onClear: () => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const priorityLabels: Record<ChargePlanPriority, string> = {
  balanced: "Best fit",
  fastest: "Fastest",
  cheapest: "Lowest cost",
  nearest: "Nearest",
  farthest: "Farthest",
};

const formatBudget = (value: DecimalValue): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value));

const ChargePlanner = ({
  assistantAvailable,
  plan,
  issue,
  needsLocation = false,
  locationState = "idle",
  onUseLocation,
  onPlan,
  onClear,
}: ChargePlannerProps) => {
  const [message, setMessage] = useState("");

  const planMutation = useMutation({
    mutationFn: (request: string) =>
      chargingService.createChargePlan({
        message: request,
      }),
    onSuccess: (nextPlan) => {
      if (nextPlan.status === "answered") {
        setMessage("");
        onPlan(nextPlan);
      }
    },
  });

  if (!assistantAvailable) {
    return null;
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = message.trim();

    if (request.length < 3 || planMutation.isPending) {
      return;
    }

    planMutation.mutate(request);
  };

  const responseUnavailable =
    planMutation.isError || planMutation.data?.status === "unavailable";
  const needsMore = planMutation.data?.status === "insufficient_data";

  const clear = () => {
    setMessage("");
    planMutation.reset();
    onClear();
  };

  return (
    <section className="relative mb-4 overflow-hidden rounded-[1.75rem] bg-[#111510] text-white shadow-[0_18px_48px_rgba(30,40,28,0.14)]">
      <form
        data-charge-planner
        onSubmit={submit}
        className="flex min-w-0 flex-col gap-2 p-2 sm:flex-row"
      >
        <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[1.25rem] bg-white/[0.07] px-3.5 focus-within:bg-white/[0.1]">
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#dfff69] px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-[#111510]">
            <motion.span
              aria-hidden="true"
              animate={
                planMutation.isPending
                  ? { opacity: [0.35, 1, 0.35] }
                  : { opacity: 1 }
              }
              transition={
                planMutation.isPending
                  ? {
                      duration: 0.8,
                      repeat: Infinity,
                    }
                  : undefined
              }
              className="h-1.5 w-1.5 rounded-full bg-[#111510]"
            />
            AI
          </span>

          <span className="sr-only">Plan a charge</span>
          <input
            autoComplete="off"
            spellCheck={false}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (planMutation.data || planMutation.error) {
                planMutation.reset();
              }
            }}
            disabled={planMutation.isPending}
            maxLength={300}
            placeholder={
              plan
                ? "Try another request"
                : "BGC to Alabang · arrive with 50% · under ₱700"
            }
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
          />
        </label>

        <motion.button
          type="submit"
          disabled={message.trim().length < 3 || planMutation.isPending}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={spring}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-[1.25rem] bg-[#dfff69] px-5 text-sm font-semibold text-[#111510] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {planMutation.isPending ? "Reading…" : "Plan"}
          {!planMutation.isPending && <ArrowRight className="h-4 w-4" />}
        </motion.button>
      </form>

      {planMutation.isPending && (
        <motion.div
          aria-hidden="true"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-[#dfff69]"
        />
      )}

      <AnimatePresence initial={false} mode="wait">
        {plan && (
          <motion.div
            key={plan.generated_at}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={spring}
            className="flex min-w-0 flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2.5"
          >
            {plan.target_battery_percent !== null && (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                {plan.target_battery_percent}%
              </span>
            )}
            {plan.area && (
              <span className="max-w-40 truncate rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium sm:max-w-64">
                {plan.area}
              </span>
            )}
            {plan.destination && (
              <span className="max-w-64 truncate rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                {plan.origin ? `${plan.origin} → ` : "To "}
                {plan.destination}
              </span>
            )}
            {plan.origin && !plan.destination && (
              <span className="max-w-40 truncate rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium sm:max-w-64">
                From {plan.origin}
              </span>
            )}
            {plan.departure_time && (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                Leave {plan.departure_time}
              </span>
            )}
            {plan.arrival_battery_percent !== null && (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                Arrive {plan.arrival_battery_percent}%+
              </span>
            )}
            {plan.max_total_php !== null && (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
                {formatBudget(plan.max_total_php)} max
              </span>
            )}
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
              {priorityLabels[plan.priority]}
            </span>

            {needsLocation && onUseLocation ? (
              <span className="flex min-w-full flex-wrap items-center gap-2 px-1 sm:min-w-0 sm:flex-1">
                <button
                  type="button"
                  onClick={onUseLocation}
                  disabled={locationState === "locating"}
                  className="rounded-full bg-[#dfff69] px-3 py-1.5 text-xs font-semibold text-[#111510] disabled:cursor-wait disabled:opacity-60"
                >
                  {locationState === "locating"
                    ? "Finding location…"
                    : locationState === "error"
                      ? "Try location again"
                      : "Use my location"}
                </button>
                <span className="text-xs text-white/45">
                  or type “from BGC”
                </span>
              </span>
            ) : issue ? (
              <span className="min-w-full px-1 text-xs text-[#ffb4a8] sm:min-w-0 sm:flex-1">
                {issue}
              </span>
            ) : null}

            <button
              type="button"
              onClick={clear}
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"
              aria-label="Clear AI plan"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {!plan && (responseUnavailable || needsMore) && (
          <motion.p
            key="plan-message"
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="border-t border-white/10 px-4 py-3 text-xs text-white/60"
          >
            {needsMore
              ? "Add a destination, charge target, budget, or preference."
              : "Couldn’t read that request. Try again."}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ChargePlanner;
