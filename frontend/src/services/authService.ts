import axios from "axios";
import { AUTH_TOKEN_KEY } from "../config";
import api from "./api";

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string | null;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export type DemoPersona = "driver" | "owner";

export interface DemoCapabilities {
  enabled: boolean;
  personas: DemoPersona[];
}

const LEGACY_AUTH_TOKEN_KEY = "token";
const isBrowser = typeof window !== "undefined";

const getStoredToken = (): string | null => {
  if (!isBrowser) return null;

  const currentToken =
    localStorage.getItem(AUTH_TOKEN_KEY);

  if (currentToken) {
    return currentToken;
  }

  const legacyToken =
    localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);

  if (legacyToken) {
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      legacyToken
    );
    localStorage.removeItem(
      LEGACY_AUTH_TOKEN_KEY
    );
  }

  return legacyToken;
};

const setStoredToken = (token: string): void => {
  if (!isBrowser) return;

  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
};

const removeStoredToken = (): void => {
  if (!isBrowser) return;

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
};

const getCurrentUser =
  async (): Promise<User | null> => {
    const token = getStoredToken();

    if (!token) {
      return null;
    }

    try {
      const response =
        await api.get<User>("/auth/me");

      return response.data;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401
      ) {
        removeStoredToken();
      }

      return null;
    }
  };

export const authService = {
  async login(
    email: string,
    password: string
  ): Promise<User> {
    const formData = new URLSearchParams();

    formData.append("username", email.trim());
    formData.append("password", password);

    const response = await api.post<LoginResponse>(
      "/auth/login",
      formData,
      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
      }
    );

    const token =
      response.data.access_token?.trim();

    if (!token) {
      throw new Error(
        "The server did not return an access token."
      );
    }

    setStoredToken(token);

    const user = await getCurrentUser();

    if (!user) {
      removeStoredToken();

      throw new Error(
        "The account session could not be loaded."
      );
    }

    return user;
  },

  async register(
    email: string,
    password: string,
    full_name?: string
  ): Promise<User> {
    const response = await api.post<User>(
      "/auth/register",
      {
        email: email.trim(),
        password,
        full_name: full_name?.trim() || undefined,
      }
    );

    return response.data;
  },

  async getDemoCapabilities(): Promise<DemoCapabilities> {
    const response =
      await api.get<DemoCapabilities>(
        "/auth/demo-capabilities"
      );

    return response.data;
  },

  async loginDemo(persona: DemoPersona): Promise<User> {
    const response =
      await api.post<LoginResponse>(
        "/auth/demo-session",
        { persona }
      );

    const token =
      response.data.access_token?.trim();

    if (!token) {
      throw new Error(
        "The demo session did not return an access token."
      );
    }

    setStoredToken(token);

    const user = await getCurrentUser();

    if (!user) {
      removeStoredToken();

      throw new Error(
        "The demo session could not be loaded."
      );
    }

    return user;
  },

  getCurrentUser,

  logout(): void {
    removeStoredToken();
  },

  getAuthHeader():
    | { Authorization: string }
    | Record<string, never> {
    const token = getStoredToken();

    return token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};
  },
};

export default authService;
