import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  useEffect,
  useMemo,
} from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { chargingService } from "../../services/chargingService";

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

interface NavigationItem {
  to: string;
  label: string;
}

const NavBar = () => {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const accessQuery = useQuery({
    queryKey: ["charging", "access"],
    queryFn: () => chargingService.getAccess(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const access = accessQuery.data;

  const navigation = useMemo(() => {
    const items: NavigationItem[] = [];

    if (access?.can_find) {
      items.push({
        to: "/charge",
        label: "Find",
      });
    }

    if (access?.can_manage) {
      items.push({
        to: "/network",
        label: "Network",
      });
    }

    return items;
  }, [access]);

  const homePath =
    access?.default_mode === "manage"
      ? "/network"
      : access?.can_find
        ? "/charge"
        : access?.can_manage
          ? "/network"
          : "/charge";

  useEffect(() => {
    if (!access) return;

    const onFind =
      location.pathname.startsWith("/charge");
    const onManage =
      location.pathname.startsWith("/network");

    if (
      onFind &&
      !access.can_find &&
      access.can_manage
    ) {
      navigate("/network", {
        replace: true,
      });
      return;
    }

    if (
      onManage &&
      !access.can_manage &&
      access.can_find
    ) {
      navigate("/charge", {
        replace: true,
      });
    }
  }, [access, location.pathname, navigate]);

  const displayName =
    user?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Account";

  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    queryClient.clear();
    logout();
  };

  return (
    <nav
      className="border-b border-black/10 bg-[#f1f2ed]/95 text-[#111510] backdrop-blur-xl"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-2.5 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link
          to={homePath}
          className="group flex shrink-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#111510]"
          aria-label="Charge home"
        >
          <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-[#dfff69] px-1.5 transition-colors group-hover:bg-[#d7f75f]">
            <img
              src="/icons/charge-mark.png"
              alt=""
              className="h-7 w-auto max-w-[6rem] object-contain"
            />
          </span>

          <span className="hidden text-base font-semibold tracking-[-0.035em] lg:block">
            Charge
          </span>
        </Link>

        {accessQuery.isLoading ? (
          <div
            className="h-10 w-28 rounded-2xl bg-black/[0.045]"
            role="status"
            aria-label="Loading navigation"
          />
        ) : accessQuery.isError ? (
          <button
            type="button"
            onClick={() => void accessQuery.refetch()}
            className="h-10 rounded-2xl bg-black/[0.055] px-3 text-xs font-semibold text-black/55 outline-none transition-colors hover:bg-black/10 hover:text-black focus-visible:ring-2 focus-visible:ring-[#111510]"
          >
            Retry
          </button>
        ) : navigation.length > 0 ? (
          <div className="flex h-10 items-center rounded-2xl bg-black/[0.055] p-1">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="relative flex h-8 items-center rounded-xl px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#111510] sm:px-3 sm:text-sm"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="primary-navigation"
                        transition={spring}
                        className="absolute inset-0 rounded-xl bg-[#111510]"
                      />
                    )}

                    <span
                      className={`relative z-10 transition-colors ${
                        isActive
                          ? "text-white"
                          : "text-black/55 hover:text-black"
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="hidden max-w-40 truncate text-sm font-medium text-black/45 lg:block">
            {displayName}
          </span>

          <span
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-[#111510] text-sm font-semibold text-white sm:grid"
            aria-hidden="true"
          >
            {initial}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="h-9 shrink-0 rounded-xl px-2 text-xs font-semibold text-black/45 outline-none transition-colors hover:bg-black/[0.06] hover:text-black focus-visible:ring-2 focus-visible:ring-[#111510] sm:px-3 sm:text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
