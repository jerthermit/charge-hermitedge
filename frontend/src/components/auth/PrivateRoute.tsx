import {
  motion,
  useReducedMotion,
} from "framer-motion";
import type { ReactNode } from "react";
import {
  Navigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

interface PrivateRouteProps {
  children: ReactNode;
}

const PrivateRoute = ({
  children,
}: PrivateRouteProps) => {
  const {
    isAuthenticated,
    isLoading,
  } = useAuth();

  const location = useLocation();
  const reduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="grid min-h-screen min-h-[100svh] place-items-center bg-[#f1f2ed] px-5 text-[#111510]"
      >
        <motion.div
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 8,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 34,
          }}
          className="flex flex-col items-center"
        >
          <span className="text-lg font-semibold tracking-[-0.04em]">
            Charge
          </span>

          <span className="mt-4 h-1 w-20 overflow-hidden rounded-full bg-black/10">
            <motion.span
              className="block h-full w-1/2 rounded-full bg-[#111510]"
              animate={
                reduceMotion
                  ? { x: "50%" }
                  : {
                      x: ["-110%", "210%"],
                    }
              }
              transition={
                reduceMotion
                  ? undefined
                  : {
                      duration: 1.1,
                      repeat: Infinity,
                      ease: [0.65, 0, 0.35, 1],
                    }
              }
            />
          </span>

          <span className="sr-only">
            Loading your account
          </span>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const destination = `${location.pathname}${location.search}${location.hash}`;

    return (
      <Navigate
        to="/login"
        state={{ from: destination }}
        replace
      />
    );
  }

  return <>{children}</>;
};

export default PrivateRoute;