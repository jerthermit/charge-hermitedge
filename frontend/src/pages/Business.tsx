import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import StationLocationPicker from "../components/charging/StationLocationPicker";
import { chargingService } from "../services/chargingService";
import type {
  ChargingSession,
  ChargerProtocol,
  ConnectorType,
  DecimalValue,
  ManagedCharger,
  ManagedConnector,
  ManagedLocation,
  ManagerConnectorStatus,
  PaymentMethod,
} from "../types/charging";

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const EMPTY_LOCATIONS: ManagedLocation[] = [];

const connectorLabels: Record<
  ConnectorType,
  string
> = {
  CCS2: "CCS2 · DC fast",
  TYPE_2: "Type 2 · AC",
  CHADEMO: "CHAdeMO · DC fast",
  GB_T: "GB/T · DC fast",
  NACS: "NACS · DC fast",
  OTHER: "Other plug",
};

const protocolLabels: Record<
  ChargerProtocol,
  string
> = {
  unconnected: "Not connected yet",
  ocpp_1_6j: "OCPP 1.6J",
  ocpp_2_0_1: "OCPP 2.0.1",
};

const connectionLabels: Record<
  ManagedCharger["connection_status"],
  string
> = {
  pending: "Awaiting charger",
  online: "Online",
  offline: "Offline",
  maintenance: "Maintenance",
};

const locationStatusLabels: Record<
  ManagedLocation["status"],
  string
> = {
  draft: "Draft",
  active: "Published",
  offline: "Paused",
};

const numberValue = (
  value: DecimalValue | null | undefined
): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (
  value: DecimalValue | null | undefined,
  currency = "PHP"
): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numberValue(value));

const formatTime = (
  value: string | null
): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

const mapsUrl = (
  location: ManagedLocation
): string => {
  if (location.google_maps_url) {
    return location.google_maps_url;
  }

  const parameters = new URLSearchParams({
    api: "1",
    query: `${location.latitude},${location.longitude}`,
  });

  return `https://www.google.com/maps/search/?${parameters.toString()}`;
};

const locationStats = (
  location: ManagedLocation
) => {
  const connectors = location.chargers.flatMap(
    (charger) =>
      charger.connectors.map((connector) => ({
        connector,
        charger,
      }))
  );

  return {
    total: connectors.length,
    available: connectors.filter(
      ({ connector, charger }) =>
        connector.status === "available" &&
        charger.connection_status === "online"
    ).length,
  };
};

const paymentLabel = (
  method: PaymentMethod
): string =>
  method === "qrph" ? "QR Ph" : "Card";

const sessionStatusLabel = (
  status: ChargingSession["status"]
): string => {
  const labels: Record<
    ChargingSession["status"],
    string
  > = {
    payment_pending: "Payment pending",
    ready: "Ready",
    charging: "Charging",
    completed: "Completed",
    cancelled: "Cancelled",
    failed: "Failed",
  };

  return labels[status];
};

const Network = () => {
  const queryClient = useQueryClient();

  const [networkId, setNetworkId] = useState("");
  const [
    selectedLocationId,
    setSelectedLocationId,
  ] = useState("");
  const [search, setSearch] = useState("");
  const [networkQuestion, setNetworkQuestion] =
    useState(
      "Which station needs attention first, and what revenue is at risk?"
    );
  const [
    showAddLocation,
    setShowAddLocation,
  ] = useState(false);
  const [
    showAddCharger,
    setShowAddCharger,
  ] = useState(false);
  const [
    pricingConnector,
    setPricingConnector,
  ] = useState<ManagedConnector | null>(null);
  const [priceDraft, setPriceDraft] =
    useState("");
  const [
    pendingLocationAction,
    setPendingLocationAction,
  ] = useState<
    "publish" | "offline" | null
  >(null);

  const [locationDraft, setLocationDraft] =
    useState({
      name: "",
      address: "",
      city: "",
      latitude: "",
      longitude: "",
    });

  const [chargerDraft, setChargerDraft] =
    useState({
      externalId: "",
      displayName: "",
      manufacturer: "",
      serialNumber: "",
      protocol:
        "unconnected" as ChargerProtocol,
      connectorType:
        "CCS2" as ConnectorType,
      connectorCount: 1,
      powerKw: 60,
      pricePerKwh: "30",
    });

  useEffect(() => {
    document.title = "Charge | Network";
  }, []);

  useEffect(() => {
    const modalOpen =
      showAddLocation ||
      showAddCharger ||
      Boolean(pricingConnector) ||
      Boolean(pendingLocationAction);

    if (!modalOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    pendingLocationAction,
    pricingConnector,
    showAddCharger,
    showAddLocation,
  ]);

  const accessQuery = useQuery({
    queryKey: ["charging", "access"],
    queryFn: () =>
      chargingService.getAccess(),
    staleTime: 30_000,
  });

  const availableNetworks =
    accessQuery.data?.networks ?? [];

  const activeNetworkId =
    networkId ||
    availableNetworks[0]?.network_id ||
    "";

  const workspaceQuery = useQuery({
    queryKey: [
      "charging",
      "management",
      activeNetworkId,
    ],
    queryFn: () =>
      chargingService.getManagementWorkspace(
        activeNetworkId
      ),
    enabled: Boolean(activeNetworkId),
    staleTime: 15_000,
  });

  const workspace = workspaceQuery.data;
  const locations = workspace?.locations ?? EMPTY_LOCATIONS;

  const networkAnswerMutation = useMutation({
    mutationFn: () => {
      if (!activeNetworkId) {
        throw new Error(
          "Choose a charging network first."
        );
      }

      return chargingService.askNetwork(
        activeNetworkId,
        {
          message: networkQuestion.trim(),
        }
      );
    },
  });

  const activeMembership =
    workspace?.access.networks.find(
      (network) =>
        network.network_id ===
        activeNetworkId
    );

  const canEdit =
    activeMembership?.role === "owner" ||
    activeMembership?.role === "manager";

  const filteredLocations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return locations.filter((location) => {
      const searchable = [
        location.name,
        location.address,
        location.city,
      ]
        .join(" ")
        .toLowerCase();

      return (
        !term ||
        searchable.includes(term)
      );
    });
  }, [locations, search]);

  const selectedLocation =
    filteredLocations.find(
      (location) =>
        location.id === selectedLocationId
    ) ?? filteredLocations[0];

  const selectedSessions =
    workspace?.recent_sessions.filter(
      (session) =>
        session.station_name ===
        selectedLocation?.name
    ) ?? [];

  const selectedLocationStats =
    selectedLocation
      ? locationStats(selectedLocation)
      : null;

  const managementQueryKey = [
    "charging",
    "management",
    activeNetworkId,
  ] as const;

  const refreshWorkspace = () => {
    networkAnswerMutation.reset();
    return queryClient.invalidateQueries({
      queryKey: managementQueryKey,
    });
  };

  const addLocationMutation = useMutation({
    mutationFn: async () => {
      if (!activeNetworkId) {
        throw new Error(
          "Choose a charging network first."
        );
      }

      const latitudeText =
        locationDraft.latitude.trim();
      const longitudeText =
        locationDraft.longitude.trim();
      const latitude = Number(latitudeText);
      const longitude = Number(
        longitudeText
      );

      if (
        !latitudeText ||
        !longitudeText ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new Error(
          "Pin the location on the map."
        );
      }

      return chargingService.createLocation(
        activeNetworkId,
        {
          name: locationDraft.name.trim(),
          address:
            locationDraft.address.trim(),
          city: locationDraft.city.trim(),
          country_code: "PH",
          timezone: "Asia/Manila",
          latitude,
          longitude,
          google_maps_url:
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${latitude},${longitude}`
            )}`,
          is_public: true,
        }
      );
    },
    onSuccess: (location) => {
      setSearch("");
      setSelectedLocationId(location.id);
      setShowAddLocation(false);
      setLocationDraft({
        name: "",
        address: "",
        city: "",
        latitude: "",
        longitude: "",
      });

      void refreshWorkspace();
    },
  });

  const addChargerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLocation) {
        throw new Error(
          "Choose a location first."
        );
      }

      const price = Number(
        chargerDraft.pricePerKwh
      );

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        throw new Error(
          "Enter a valid charging price."
        );
      }

      return chargingService.createCharger(
        selectedLocation.id,
        {
          external_id:
            chargerDraft.externalId.trim(),
          display_name:
            chargerDraft.displayName.trim(),
          manufacturer:
            chargerDraft.manufacturer.trim() ||
            null,
          model: null,
          serial_number:
            chargerDraft.serialNumber.trim(),
          protocol: chargerDraft.protocol,
          connectors: Array.from(
            {
              length:
                chargerDraft.connectorCount,
            },
            (_, index) => ({
              connector_number: index + 1,
              connector_type:
                chargerDraft.connectorType,
              max_power_kw:
                chargerDraft.powerKw,
              price_per_kwh: price,
            })
          ),
        }
      );
    },
    onSuccess: () => {
      setShowAddCharger(false);
      setChargerDraft({
        externalId: "",
        displayName: "",
        manufacturer: "",
        serialNumber: "",
        protocol: "unconnected",
        connectorType: "CCS2",
        connectorCount: 1,
        powerKw: 60,
        pricePerKwh: "30",
      });

      void refreshWorkspace();
    },
  });

  const connectorStatusMutation =
    useMutation({
      mutationFn: ({
        connector,
        status,
      }: {
        connector: ManagedConnector;
        status: ManagerConnectorStatus;
      }) =>
        chargingService.updateConnectorStatus(
          connector.id,
          {
            status,
            expected_version:
              connector.version,
          }
        ),
      onSuccess: () => {
        void refreshWorkspace();
      },
    });

  const connectorPriceMutation =
    useMutation({
      mutationFn: async () => {
        if (!pricingConnector) {
          throw new Error(
            "Choose a charging port first."
          );
        }

        const price = Number(priceDraft);

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          throw new Error(
            "Enter a valid charging price."
          );
        }

        return chargingService.updateConnectorPrice(
          pricingConnector.id,
          {
            price_per_kwh: price,
            expected_version:
              pricingConnector.version,
          }
        );
      },
      onSuccess: () => {
        setPricingConnector(null);
        setPriceDraft("");
        void refreshWorkspace();
      },
    });

  const locationActionMutation =
    useMutation({
      mutationFn: async () => {
        if (
          !selectedLocation ||
          !pendingLocationAction
        ) {
          throw new Error(
            "Choose a location action first."
          );
        }

        if (
          pendingLocationAction ===
          "publish"
        ) {
          return chargingService.publishLocation(
            selectedLocation.id
          );
        }

        return chargingService.takeLocationOffline(
          selectedLocation.id
        );
      },
      onSuccess: () => {
        setPendingLocationAction(null);
        void refreshWorkspace();
      },
    });

  useEffect(() => {
    if (!filteredLocations.length) {
      setSelectedLocationId("");
      return;
    }

    const stillVisible =
      filteredLocations.some(
        (location) =>
          location.id ===
          selectedLocationId
      );

    if (!stillVisible) {
      setSelectedLocationId(
        filteredLocations[0].id
      );
    }
  }, [
    filteredLocations,
    selectedLocationId,
  ]);

  useEffect(() => {
    const closeDialogs = (
      event: KeyboardEvent
    ) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!addLocationMutation.isPending) {
        setShowAddLocation(false);
      }

      if (!addChargerMutation.isPending) {
        setShowAddCharger(false);
      }

      if (
        !connectorPriceMutation.isPending
      ) {
        setPricingConnector(null);
      }

      if (
        !locationActionMutation.isPending
      ) {
        setPendingLocationAction(null);
      }
    };

    window.addEventListener(
      "keydown",
      closeDialogs
    );

    return () =>
      window.removeEventListener(
        "keydown",
        closeDialogs
      );
  }, [
    addChargerMutation.isPending,
    addLocationMutation.isPending,
    connectorPriceMutation.isPending,
    locationActionMutation.isPending,
  ]);

  const isLoading =
    accessQuery.isLoading ||
    (Boolean(activeNetworkId) &&
      workspaceQuery.isLoading);

  if (isLoading) {
    return (
      <main className="bg-[#111510] px-4 py-6 text-white sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-[1680px]"
          role="status"
          aria-label="Loading stations"
        >
          <div className="mb-6 h-14 w-52 rounded-2xl bg-white/10" />

          <div className="mb-5 h-28 rounded-[2rem] bg-white/[0.06]" />

          <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="h-[24rem] rounded-[2rem] bg-white/[0.06]" />
            <div className="h-[28rem] rounded-[2rem] bg-white/[0.06]" />
          </div>
        </div>
      </main>
    );
  }

  if (
    accessQuery.isError ||
    workspaceQuery.isError
  ) {
    return (
      <main className="grid min-h-[calc(100dvh-7.5rem)] place-items-center bg-[#111510] p-6 text-white">
        <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">
            Stations didn’t load.
          </h1>

          <button
            type="button"
            onClick={() => {
              void accessQuery.refetch();
              void workspaceQuery.refetch();
            }}
            className="mt-5 inline-flex h-11 items-center rounded-2xl bg-[#dfff69] px-5 text-sm font-semibold text-[#111510]"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!availableNetworks.length) {
    return (
      <main className="grid min-h-[calc(100dvh-7.5rem)] place-items-center bg-[#111510] p-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">
            No stations yet.
          </h1>
        </div>
      </main>
    );
  }

  if (!workspace) {
    return null;
  }

  const networkCurrency =
    workspace.network.currency_code;

  const visibleError =
    connectorStatusMutation.error;

  return (
    <main className="flex flex-1 flex-col bg-[#111510] text-white">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {availableNetworks.length > 1 && (
              <select
                value={activeNetworkId}
                onChange={(event) => {
                  setNetworkId(
                    event.target.value
                  );
                  setSelectedLocationId("");
                  networkAnswerMutation.reset();
                }}
                className="mb-3 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-white outline-none"
                aria-label="Charging network"
              >
                {availableNetworks.map(
                  (network) => (
                    <option
                      key={network.network_id}
                      value={network.network_id}
                      className="text-black"
                    >
                      {network.network_name}
                    </option>
                  )
                )}
              </select>
            )}

            <h1 className="text-[clamp(2.25rem,4.2vw,4rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
              Today
            </h1>
          </div>

          {canEdit && (
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => {
                addLocationMutation.reset();
                setShowAddLocation(true);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#dfff69] px-4 text-sm font-semibold text-[#111510] sm:justify-start"
            >
              Add site
            </motion.button>
          )}
        </header>

        <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-white/10">
          <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
            <div className="bg-[#1a1e19] p-5">
              <div>
                <div className="text-2xl font-semibold tracking-[-0.045em]">
                  {formatMoney(
                    workspace.metrics
                      .revenue_today,
                    networkCurrency
                  )}
                </div>

                <div className="text-xs text-white/40">
                  Revenue today
                </div>
              </div>
            </div>

            <div className="bg-[#1a1e19] p-5">
              <div>
                <div className="text-2xl font-semibold tracking-[-0.045em]">
                  {numberValue(
                    workspace.metrics
                      .energy_today_kwh
                  ).toFixed(1)}
                </div>

                <div className="text-xs text-white/40">
                  kWh today
                </div>
              </div>
            </div>

            <div className="bg-[#1a1e19] p-5">
              <div>
                <div className="text-2xl font-semibold tracking-[-0.045em]">
                  {
                    workspace.metrics
                      .active_sessions
                  }
                </div>

                <div className="text-xs text-white/40">
                  Charging now
                </div>
              </div>
            </div>

            <div
              className={`p-5 ${
                workspace.metrics
                  .offline_connectors > 0
                  ? "bg-[#ff8b78]/10"
                  : "bg-[#1a1e19]"
              }`}
            >
              <div>
                <div
                  className={`text-2xl font-semibold tracking-[-0.045em] ${
                    workspace.metrics
                      .offline_connectors > 0
                      ? "text-[#ffb4a8]"
                      : ""
                  }`}
                >
                  {
                    workspace.metrics
                      .offline_connectors
                  }
                </div>

                <div className="text-xs text-white/40">
                  {workspace.metrics
                    .offline_connectors > 0
                    ? "Needs attention"
                    : "All plugs online"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-[2rem] bg-[#dfff69] p-4 text-[#111510] sm:p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                networkQuestion.trim().length >= 3 &&
                !networkAnswerMutation.isPending
              ) {
                networkAnswerMutation.mutate();
              }
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                Ask network
              </h2>
              <span className="rounded-full bg-[#111510] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#dfff69]">
                AI
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={networkQuestion}
                onChange={(event) => {
                  setNetworkQuestion(
                    event.target.value
                  );
                }}
                maxLength={240}
                placeholder="Which station needs attention first?"
                aria-label="Ask about your charging network"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-sm text-[#111510] outline-none placeholder:text-black/35 focus:border-black"
              />

              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                transition={spring}
                disabled={
                  networkQuestion.trim().length < 3 ||
                  networkAnswerMutation.isPending
                }
                className="h-12 shrink-0 rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {networkAnswerMutation.isPending
                  ? "Checking…"
                  : "Ask"}
              </motion.button>
            </div>
          </form>

          <AnimatePresence mode="wait" initial={false}>
            {networkAnswerMutation.isPending ? (
              <motion.p
                key="network-answer-loading"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                className="mt-4 text-xs font-medium text-black/50"
              >
                Comparing current station data…
              </motion.p>
            ) : networkAnswerMutation.data ? (
              <motion.div
                key={
                  networkAnswerMutation.data
                    .generated_at
                }
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={spring}
                className="mt-4 rounded-3xl bg-[#111510] p-4 text-white sm:p-5"
              >
                <h3 className="text-lg font-semibold tracking-[-0.035em]">
                  {
                    networkAnswerMutation.data
                      .headline
                  }
                </h3>

                <p className="mt-1 text-sm text-white/65">
                  {
                    networkAnswerMutation.data
                      .reason
                  }
                </p>

                {networkAnswerMutation.data
                  .evidence.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {networkAnswerMutation.data.evidence.map(
                      (item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs text-white/70"
                        >
                          {item}
                        </span>
                      )
                    )}
                  </div>
                )}

                {(networkAnswerMutation.data
                  .action ||
                  networkAnswerMutation.data
                    .location_id) && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {networkAnswerMutation.data
                      .action && (
                      <p className="text-sm text-white/85">
                        {
                          networkAnswerMutation.data
                            .action
                        }
                      </p>
                    )}

                    {networkAnswerMutation.data
                      .location_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setSelectedLocationId(
                            networkAnswerMutation.data!
                              .location_id!
                          );
                          window.requestAnimationFrame(
                            () =>
                              document
                                .getElementById(
                                  "station-detail"
                                )
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                })
                          );
                        }}
                        className="h-10 shrink-0 rounded-2xl bg-white px-4 text-xs font-semibold text-[#111510]"
                      >
                        Open station
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            ) : networkAnswerMutation.isError ? (
              <motion.p
                key="network-answer-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                role="alert"
                className="mt-4 text-sm text-[#7d2417]"
              >
                {errorMessage(
                  networkAnswerMutation.error
                )}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </section>

        {visibleError && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-3 rounded-2xl border border-[#ff8b78]/20 bg-[#ff8b78]/10 px-4 py-3 text-sm text-[#ffb4a8]"
          >
            {errorMessage(visibleError)}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055]">
            <div className="border-b border-white/10 p-4">
              <label className="flex h-11 items-center gap-3 rounded-2xl bg-black/20 px-3">
                <Search className="h-4 w-4 shrink-0 text-white/35" />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search locations"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  aria-label="Search locations"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearch("")
                    }
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
            </div>

            <div className="flex gap-2 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:block xl:max-h-[42rem] xl:space-y-2 xl:overflow-y-auto">
              <AnimatePresence initial={false}>
                {filteredLocations.map(
                  (location) => {
                    const selected =
                      location.id ===
                      selectedLocation?.id;
                    const stats =
                      locationStats(location);

                    return (
                      <motion.button
                        layout
                        key={location.id}
                        type="button"
                        onClick={() =>
                          setSelectedLocationId(
                            location.id
                          )
                        }
                        whileHover={{
                          x: selected
                            ? 0
                            : 2,
                        }}
                        whileTap={{
                          scale: 0.985,
                        }}
                        transition={spring}
                        className="relative isolate flex min-w-[15rem] shrink-0 items-center gap-3 overflow-hidden rounded-3xl p-4 text-left xl:w-full xl:min-w-0"
                      >
                        {selected && (
                          <motion.span
                            layoutId="managed-station-selection"
                            className="absolute inset-0 -z-10 bg-[#dfff69]"
                            transition={spring}
                          />
                        )}

                        <span
                          className={`grid h-11 min-w-11 shrink-0 place-items-center rounded-2xl px-1 ${
                            selected
                              ? "bg-[#111510] text-white"
                              : "bg-white/10"
                          }`}
                        >
                          <span className="text-sm font-semibold leading-none">
                            {stats.available}
                          </span>
                          <span className="text-[9px] font-semibold opacity-55">
                            Open
                          </span>
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-semibold ${
                              selected
                                ? "text-[#111510]"
                                : "text-white"
                            }`}
                          >
                            {location.name}
                          </span>

                          <span
                            className={`mt-1 block truncate text-xs ${
                              selected
                                ? "text-black/55"
                                : "text-white/35"
                            }`}
                          >
                            {location.city}
                            {" · "}
                            {stats.total} plugs
                          </span>
                        </span>
                      </motion.button>
                    );
                  }
                )}
              </AnimatePresence>

              {!filteredLocations.length && (
                <div className="w-full px-4 py-10 text-center text-sm text-white/35">
                  No locations found
                </div>
              )}
            </div>
          </aside>

          <AnimatePresence mode="wait">
            {selectedLocation ? (
              <motion.section
                id="station-detail"
                key={selectedLocation.id}
                initial={{
                  opacity: 0,
                  y: 12,
                  scale: 0.995,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.995,
                }}
                transition={spring}
                className="overflow-hidden rounded-[2rem] bg-[#f1f2ed] text-[#111510]"
              >
                <div className="flex flex-col gap-5 border-b border-black/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#727970]">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          selectedLocation.status ===
                          "active"
                            ? "bg-[#45c77a]"
                            : selectedLocation.status ===
                                "draft"
                              ? "bg-[#e5b84c]"
                              : "bg-[#a3a7a1]"
                        }`}
                      />

                      {
                        locationStatusLabels[
                          selectedLocation.status
                        ]
                      }
                    </div>

                    <h2 className="mt-3 truncate text-3xl font-semibold tracking-[-0.055em]">
                      {selectedLocation.name}
                    </h2>

                    <div className="mt-1 text-sm text-[#6c736b]">
                      {selectedLocation.address}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <motion.a
                      href={mapsUrl(
                        selectedLocation
                      )}
                      target="_blank"
                      rel="noreferrer"
                      whileHover={{ y: -2 }}
                      whileTap={{
                        scale: 0.95,
                      }}
                      transition={spring}
                      className="flex h-11 items-center rounded-2xl border border-black/10 bg-white px-4 text-sm font-semibold"
                      aria-label="Open in Google Maps"
                    >
                      View map
                    </motion.a>

                    {canEdit && (
                      <>
                        <motion.button
                          type="button"
                          whileHover={{
                            y: -2,
                          }}
                          whileTap={{
                            scale: 0.97,
                          }}
                          transition={spring}
                          onClick={() => {
                            addChargerMutation.reset();
                            setShowAddCharger(
                              true
                            );
                          }}
                          className="flex h-11 items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 text-sm font-semibold"
                        >
                          Connect charger
                        </motion.button>

                        <motion.button
                          type="button"
                          whileHover={{
                            y: -2,
                          }}
                          whileTap={{
                            scale: 0.97,
                          }}
                          transition={spring}
                          onClick={() =>
                            setPendingLocationAction(
                              selectedLocation.status ===
                                "active"
                                ? "offline"
                                : "publish"
                            )
                          }
                          className={`h-11 rounded-2xl px-4 text-sm font-semibold ${
                            selectedLocation.status ===
                            "active"
                              ? "border border-black/10 bg-white"
                              : "bg-[#111510] text-white"
                          }`}
                        >
                          {selectedLocation.status ===
                          "active"
                            ? "Pause listing"
                            : selectedLocation.status ===
                                "draft"
                              ? "Publish listing"
                              : "Republish"}
                        </motion.button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Chargers
                      </h3>

                      <span className="text-xs text-[#747b73]">
                        {selectedLocationStats?.total ??
                          0}{" "}
                        plugs
                      </span>
                    </div>

                    <div className="space-y-4">
                      {selectedLocation.chargers.map(
                        (charger) => (
                          <motion.section
                            layout
                            key={charger.id}
                            transition={spring}
                            className="rounded-3xl border border-black/10 bg-white p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {
                                    charger.display_name
                                  }
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#747b73]">
                                  <span>
                                    {[
                                      charger.manufacturer,
                                      charger.model,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") ||
                                      "Charger"}
                                  </span>

                                  {charger.manufacturer && (
                                    <>
                                      <span aria-hidden="true">
                                        ·
                                      </span>

                                      <span>
                                        {charger.external_id}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                  charger.connection_status ===
                                  "online"
                                    ? "bg-[#dfff69]"
                                    : "bg-black/5 text-[#747b73]"
                                }`}
                              >
                                {
                                  connectionLabels[
                                    charger.connection_status
                                  ]
                                }
                              </span>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              {charger.connectors.map(
                                (connector) => {
                                  const chargerOnline =
                                    charger.connection_status ===
                                    "online";
                                  const connectorOpen =
                                    chargerOnline &&
                                    connector.status ===
                                      "available";
                                  const canToggle =
                                    canEdit &&
                                    chargerOnline &&
                                    connector.status !==
                                      "charging" &&
                                    connector.status !==
                                      "reserved";

                                  const nextStatus: ManagerConnectorStatus =
                                    connectorOpen
                                      ? "offline"
                                      : "available";

                                  const statusPending =
                                    connectorStatusMutation.isPending &&
                                    connectorStatusMutation
                                      .variables
                                      ?.connector
                                      .id ===
                                      connector.id;

                                  const connectorStatus =
                                    !chargerOnline
                                      ? charger.connection_status ===
                                        "maintenance"
                                        ? "Maintenance"
                                        : "Unavailable"
                                      : connector.status ===
                                          "available"
                                        ? "Available"
                                        : connector.status ===
                                              "charging" ||
                                            connector.status ===
                                              "reserved"
                                          ? "In use"
                                          : "Hidden";

                                  return (
                                    <motion.div
                                      layout
                                      key={
                                        connector.id
                                      }
                                      transition={spring}
                                      className="rounded-2xl border border-black/10 bg-[#f5f6f1] p-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#111510] text-sm font-semibold text-white">
                                          {connector.connector_number}
                                        </span>

                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-semibold text-[#747b73]">
                                            {
                                              connectorStatus
                                            }
                                          </span>

                                          <button
                                            type="button"
                                            disabled={
                                              !canToggle ||
                                              statusPending
                                            }
                                            onClick={() =>
                                              connectorStatusMutation.mutate(
                                                {
                                                  connector,
                                                  status:
                                                    nextStatus,
                                                }
                                              )
                                            }
                                            className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                                              connectorOpen
                                                ? "bg-[#dfff69]"
                                                : "bg-black/15"
                                            }`}
                                            aria-label={`Port ${connector.connector_number}: ${connectorStatus}`}
                                            aria-pressed={
                                              connectorOpen
                                            }
                                          >
                                            <motion.span
                                              layout
                                              transition={
                                                spring
                                              }
                                              className={`absolute top-1 h-5 w-5 rounded-full bg-[#111510] ${
                                                connectorOpen
                                                  ? "right-1"
                                                  : "left-1"
                                              }`}
                                            />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-4">
                                        <div className="text-sm font-semibold">
                                          {
                                            connectorLabels[
                                              connector.connector_type
                                            ]
                                          }
                                          {" · "}
                                          {numberValue(
                                            connector.max_power_kw
                                          )}{" "}
                                          kW
                                        </div>

                                        <button
                                          type="button"
                                          disabled={
                                            !canEdit
                                          }
                                          onClick={() => {
                                            connectorPriceMutation.reset();
                                            setPricingConnector(
                                              connector
                                            );
                                            setPriceDraft(
                                              String(
                                                connector.price_per_kwh
                                              )
                                            );
                                          }}
                                          className="mt-2 inline-flex items-center text-xs font-semibold text-[#5f665e] underline decoration-black/15 underline-offset-4 disabled:cursor-default disabled:no-underline"
                                        >
                                          {formatMoney(
                                            connector.price_per_kwh,
                                            networkCurrency
                                          )}
                                          /kWh
                                        </button>
                                      </div>
                                    </motion.div>
                                  );
                                }
                              )}
                            </div>
                          </motion.section>
                        )
                      )}

                      {!selectedLocation.chargers
                        .length && (
                        <div className="rounded-3xl border border-dashed border-black/15 px-4 py-6 text-center">
                          <div className="text-sm font-semibold">
                            No chargers yet
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                addChargerMutation.reset();
                                setShowAddCharger(
                                  true
                                );
                              }}
                              className="mt-4 inline-flex h-10 items-center rounded-2xl bg-[#111510] px-4 text-xs font-semibold text-white"
                            >
                              Connect charger
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <aside className="self-start rounded-3xl bg-[#111510] p-5 text-white lg:sticky lg:top-20">
                    <h3 className="text-sm font-semibold">
                      Recent charges
                    </h3>

                    <div className="mt-5 space-y-2">
                      {selectedSessions
                        .slice(0, 5)
                        .map((session) => (
                          <motion.div
                            layout
                            key={session.id}
                            transition={spring}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold">
                                {
                                  connectorLabels[
                                    session.connector_type
                                  ]
                                }
                              </span>

                              <span className="text-xs text-white/35">
                                {formatTime(
                                  session.completed_at ||
                                    session.started_at ||
                                    session.created_at
                                )}
                              </span>
                            </div>

                            <div className="mt-3 flex items-end justify-between gap-3">
                              <span className="text-xs text-white/40">
                                {numberValue(
                                  session.energy_kwh
                                ).toFixed(2)}{" "}
                                kWh
                                {session.payment
                                  ? ` · ${paymentLabel(
                                      session.payment
                                        .method
                                    )}`
                                  : ""}
                                {" · "}
                                {sessionStatusLabel(
                                  session.status
                                )}
                              </span>

                              <span className="text-sm font-semibold">
                                {formatMoney(
                                  session.total_amount,
                                  session.currency_code
                                )}
                              </span>
                            </div>
                          </motion.div>
                        ))}

                      {!selectedSessions.length && (
                        <div className="rounded-2xl border border-dashed border-white/15 px-3 py-5 text-center text-xs text-white/35">
                          No recent sessions
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="empty"
                initial={{
                  opacity: 0,
                  scale: 0.99,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                transition={spring}
                className="grid min-h-[18rem] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.055]"
              >
                <div className="text-center text-white/45">
                  <div className="text-sm">
                    No locations found
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showAddLocation && (
          <div className="fixed inset-0 z-[90] grid place-items-end sm:place-items-center">
            <motion.button
              type="button"
              aria-label="Close"
              onClick={() => {
                if (
                  !addLocationMutation.isPending
                ) {
                  setShowAddLocation(false);
                }
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            />

            <motion.form
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-station-title"
              onSubmit={(
                event: FormEvent<HTMLFormElement>
              ) => {
                event.preventDefault();
                addLocationMutation.mutate();
              }}
              initial={{
                opacity: 0,
                y: 70,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 70,
                scale: 0.98,
              }}
              transition={spring}
              className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#f1f2ed] p-5 text-[#111510] sm:rounded-[2rem] sm:p-6"
            >
              <div className="flex items-center justify-between">
                <h2
                  id="add-station-title"
                  className="text-2xl font-semibold tracking-[-0.045em]"
                >
                  Add site
                </h2>

                <button
                  type="button"
                  disabled={
                    addLocationMutation.isPending
                  }
                  onClick={() =>
                    setShowAddLocation(false)
                  }
                  className="grid h-10 w-10 place-items-center rounded-full bg-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold">
                    Name
                  </span>

                  <input
                    required
                    maxLength={180}
                    value={locationDraft.name}
                    onChange={(event) =>
                      setLocationDraft(
                        (current) => ({
                          ...current,
                          name: event.target.value,
                        })
                      )
                    }
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold">
                    Address
                  </span>

                  <input
                    required
                    maxLength={500}
                    value={locationDraft.address}
                    onChange={(event) =>
                      setLocationDraft(
                        (current) => ({
                          ...current,
                          address:
                            event.target.value,
                        })
                      )
                    }
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold">
                    City
                  </span>

                  <input
                    required
                    maxLength={100}
                    value={locationDraft.city}
                    onChange={(event) =>
                      setLocationDraft(
                        (current) => ({
                          ...current,
                          city: event.target.value,
                        })
                      )
                    }
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                  />
                </label>

                <div className="grid gap-2">
                  <span className="text-xs font-semibold">
                    Location
                  </span>

                  <StationLocationPicker
                    latitude={
                      locationDraft.latitude
                    }
                    longitude={
                      locationDraft.longitude
                    }
                    disabled={
                      addLocationMutation.isPending
                    }
                    onChange={(value) =>
                      setLocationDraft(
                        (current) => ({
                          ...current,
                          ...value,
                        })
                      )
                    }
                  />
                </div>
              </div>

              {addLocationMutation.error && (
                <div className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]">
                  {errorMessage(
                    addLocationMutation.error
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  addLocationMutation.isPending
                }
                className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#111510] text-sm font-semibold text-white disabled:opacity-50"
              >
                {addLocationMutation.isPending
                  ? "Saving…"
                  : "Add site"}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddCharger &&
          selectedLocation && (
            <div className="fixed inset-0 z-[92] grid place-items-end sm:place-items-center">
              <motion.button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (
                    !addChargerMutation.isPending
                  ) {
                    setShowAddCharger(false);
                  }
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              />

              <motion.form
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-charger-title"
                onSubmit={(
                  event: FormEvent<HTMLFormElement>
                ) => {
                  event.preventDefault();
                  addChargerMutation.mutate();
                }}
                initial={{
                  opacity: 0,
                  y: 70,
                  scale: 0.98,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  y: 70,
                  scale: 0.98,
                }}
                transition={spring}
                className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#f1f2ed] p-5 text-[#111510] sm:rounded-[2rem] sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[#747b73]">
                      {selectedLocation.name}
                    </div>

                    <h2
                      id="add-charger-title"
                      className="mt-1 text-2xl font-semibold tracking-[-0.045em]"
                    >
                      Connect charger
                    </h2>
                  </div>

                  <button
                    type="button"
                    disabled={
                      addChargerMutation.isPending
                    }
                    onClick={() =>
                      setShowAddCharger(false)
                    }
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs">
                  <span className="font-medium text-[#747b73]">
                    After registration
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-[#e5b84c]" />
                    Awaiting charger
                  </span>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Charger ID
                      </span>

                      <input
                        required
                        maxLength={120}
                        value={
                          chargerDraft.externalId
                        }
                        onChange={(event) =>
                          setChargerDraft(
                            (current) => ({
                              ...current,
                              externalId:
                                event.target.value,
                            })
                          )
                        }
                        className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Name
                      </span>

                      <input
                        required
                        maxLength={160}
                        value={
                          chargerDraft.displayName
                        }
                        onChange={(event) =>
                          setChargerDraft(
                            (current) => ({
                              ...current,
                              displayName:
                                event.target.value,
                            })
                          )
                        }
                        className="h-12 rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-2">
                      <span className="text-xs font-semibold">
                        Brand
                      </span>

                      <input
                        maxLength={120}
                        value={chargerDraft.manufacturer}
                        onChange={(event) =>
                          setChargerDraft((current) => ({
                            ...current,
                            manufacturer: event.target.value,
                          }))
                        }
                        className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                      />
                    </label>

                    <label className="grid min-w-0 gap-2">
                      <span className="text-xs font-semibold">
                        Serial number
                      </span>

                      <input
                        required
                        maxLength={160}
                        value={chargerDraft.serialNumber}
                        onChange={(event) =>
                          setChargerDraft((current) => ({
                            ...current,
                            serialNumber: event.target.value,
                          }))
                        }
                        className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none focus:border-black"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Plug type
                      </span>

                      <select
                        value={
                          chargerDraft.connectorType
                        }
                        onChange={(event) =>
                          setChargerDraft(
                            (current) => ({
                              ...current,
                              connectorType:
                                event.target.value as ConnectorType,
                            })
                          )
                        }
                        className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
                      >
                        {Object.entries(
                          connectorLabels
                        ).map(
                          ([value, label]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Charger power
                      </span>

                      <select
                        value={
                          chargerDraft.powerKw
                        }
                        onChange={(event) =>
                          setChargerDraft(
                            (current) => ({
                              ...current,
                              powerKw: Number(
                                event.target.value
                              ),
                            })
                          )
                        }
                        className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
                      >
                        {[7, 22, 60, 120, 150].map(
                          (power) => (
                            <option
                              key={power}
                              value={power}
                            >
                              {power} kW
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Number of ports
                      </span>

                      <select
                        value={
                          chargerDraft.connectorCount
                        }
                        onChange={(event) =>
                          setChargerDraft(
                            (current) => ({
                              ...current,
                              connectorCount:
                                Number(
                                  event.target.value
                                ),
                            })
                          )
                        }
                        className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
                      >
                        {[1, 2, 3, 4].map(
                          (count) => (
                            <option
                              key={count}
                              value={count}
                            >
                              {count}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold">
                        Price / kWh
                      </span>

                      <div className="flex h-12 items-center rounded-2xl border border-black/10 bg-white px-4">
                        <span className="mr-2 text-[#747b73]">
                          ₱
                        </span>

                        <input
                          required
                          type="number"
                          min="0"
                          step="0.5"
                          value={
                            chargerDraft.pricePerKwh
                          }
                          onChange={(event) =>
                            setChargerDraft(
                              (current) => ({
                                ...current,
                                pricePerKwh:
                                  event.target.value,
                              })
                            )
                          }
                          className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                        />
                      </div>
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold">
                      OCPP version
                    </span>

                    <select
                      value={chargerDraft.protocol}
                      onChange={(event) =>
                        setChargerDraft(
                          (current) => ({
                            ...current,
                            protocol:
                              event.target.value as ChargerProtocol,
                          })
                        )
                      }
                      className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
                    >
                      {Object.entries(
                        protocolLabels
                      ).map(
                        ([value, label]) => (
                          <option
                            key={value}
                            value={value}
                          >
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                {addChargerMutation.error && (
                  <div className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]">
                    {errorMessage(
                      addChargerMutation.error
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    addChargerMutation.isPending
                  }
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#111510] text-sm font-semibold text-white disabled:opacity-50"
                >
                  {addChargerMutation.isPending
                    ? "Registering…"
                    : "Register & await connection"}
                </button>
              </motion.form>
            </div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {pricingConnector && (
          <div className="fixed inset-0 z-[95] grid place-items-center p-4">
            <motion.button
              type="button"
              aria-label="Close"
              onClick={() => {
                if (
                  !connectorPriceMutation.isPending
                ) {
                  setPricingConnector(null);
                }
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            />

            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="price-title"
              initial={{
                opacity: 0,
                y: 25,
                scale: 0.97,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 25,
                scale: 0.97,
              }}
              transition={spring}
              className="relative z-10 w-full max-w-sm rounded-[2rem] bg-[#f1f2ed] p-6 text-[#111510]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2
                    id="price-title"
                    className="text-2xl font-semibold tracking-[-0.045em]"
                  >
                    Set price
                  </h2>

                  <div className="mt-1 text-xs text-[#747b73]">
                    Port {pricingConnector.connector_number}
                    {" · "}
                    {
                      connectorLabels[
                        pricingConnector.connector_type
                      ]
                    }
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    connectorPriceMutation.isPending
                  }
                  onClick={() =>
                    setPricingConnector(null)
                  }
                  className="grid h-10 w-10 place-items-center rounded-full bg-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex h-14 items-center rounded-2xl border border-black/10 bg-white px-4">
                <span className="mr-2 text-xl text-[#747b73]">
                  ₱
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={priceDraft}
                  onChange={(event) =>
                    setPriceDraft(
                      event.target.value
                    )
                  }
                  className="min-w-0 flex-1 border-0 bg-transparent text-2xl font-semibold outline-none"
                  aria-label="Price per kilowatt-hour"
                />

                <span className="text-sm text-[#747b73]">
                  /kWh
                </span>
              </div>

              {connectorPriceMutation.error && (
                <div className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]">
                  {errorMessage(
                    connectorPriceMutation.error
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={
                  connectorPriceMutation.isPending
                }
                onClick={() =>
                  connectorPriceMutation.mutate()
                }
                className="mt-5 h-12 w-full rounded-2xl bg-[#111510] text-sm font-semibold text-white disabled:opacity-50"
              >
                {connectorPriceMutation.isPending
                  ? "Saving…"
                  : "Save"}
              </button>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingLocationAction &&
          selectedLocation && (
            <div className="fixed inset-0 z-[98] grid place-items-center p-4">
              <motion.button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (
                    !locationActionMutation.isPending
                  ) {
                    setPendingLocationAction(
                      null
                    );
                  }
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              />

              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="location-action-title"
                initial={{
                  opacity: 0,
                  y: 25,
                  scale: 0.97,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  y: 25,
                  scale: 0.97,
                }}
                transition={spring}
                className="relative z-10 w-full max-w-sm rounded-[2rem] bg-[#f1f2ed] p-6 text-[#111510]"
              >
                <h2
                  id="location-action-title"
                  className="text-2xl font-semibold tracking-[-0.045em]"
                >
                  {pendingLocationAction ===
                  "publish"
                    ? selectedLocation.status ===
                      "draft"
                      ? "Publish location?"
                      : "Republish location?"
                    : "Pause this listing?"}
                </h2>

                <div className="mt-2 text-sm text-[#747b73]">
                  {selectedLocation.name}
                </div>

                {locationActionMutation.error && (
                  <div className="mt-4 rounded-2xl bg-[#ffe8e3] px-4 py-3 text-sm text-[#8b2e20]">
                    {errorMessage(
                      locationActionMutation.error
                    )}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={
                      locationActionMutation.isPending
                    }
                    onClick={() =>
                      setPendingLocationAction(
                        null
                      )
                    }
                    className="h-12 rounded-2xl border border-black/10 bg-white text-sm font-semibold"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      locationActionMutation.isPending
                    }
                    onClick={() =>
                      locationActionMutation.mutate()
                    }
                    className="h-12 rounded-2xl bg-[#111510] text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {locationActionMutation.isPending
                      ? "Working…"
                      : pendingLocationAction ===
                          "publish"
                        ? selectedLocation.status ===
                          "draft"
                          ? "Publish listing"
                          : "Republish"
                        : "Pause listing"}
                  </button>
                </div>
              </motion.section>
            </div>
          )}
      </AnimatePresence>
    </main>
  );
};

export default Network;
