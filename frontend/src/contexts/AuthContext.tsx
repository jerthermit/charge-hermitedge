/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { chargingService } from "../services/chargingService";
import { authService } from "../services/authService";
import type {
  DemoPersona,
  User,
} from "../services/authService";

type RegisterData = {
  email: string;
  password: string;
  full_name?: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: (persona: DemoPersona) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const AuthProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const resolveHome = async (
    fallback: "/charge" | "/network" = "/charge"
  ) => {
    try {
      const access = await chargingService.getAccess();
      queryClient.setQueryData(
        ["charging", "access"],
        access
      );

      if (access.default_mode === "manage") {
        return "/network" as const;
      }

      if (access.can_find) {
        return "/charge" as const;
      }

      if (access.can_manage) {
        return "/network" as const;
      }
    } catch {
      // The destination can recover through its normal query state.
    }

    return fallback;
  };

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);

    try {
      const authenticatedUser = await authService.login(
        email,
        password,
      );

      queryClient.clear();
      setUser(authenticatedUser);
      navigate(await resolveHome(), { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  const loginDemo = async (persona: DemoPersona) => {
    setIsLoading(true);

    try {
      const demoUser = await authService.loginDemo(persona);
      queryClient.clear();
      setUser(demoUser);
      navigate(
        await resolveHome(
          persona === "owner" ? "/network" : "/charge"
        ),
        { replace: true }
      );
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: RegisterData) => {
    setIsLoading(true);

    try {
      await authService.register(
        userData.email,
        userData.password,
        userData.full_name,
      );

      navigate("/login", {
        state: { registrationComplete: true },
        replace: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    queryClient.clear();
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        loginDemo,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
