import axios from "axios";
import {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
} from "../config";

const LEGACY_AUTH_TOKEN_KEY = "token";
const isBrowser = typeof window !== "undefined";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    if (!isBrowser) {
      return config;
    }

    const token =
      localStorage.getItem(AUTH_TOKEN_KEY);

    if (token) {
      config.headers.set(
        "Authorization",
        `Bearer ${token}`
      );
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401 && isBrowser) {
      const currentPath =
        window.location.pathname;

      const onAuthPage =
        currentPath.startsWith("/login") ||
        currentPath.startsWith("/register");

      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(
        LEGACY_AUTH_TOKEN_KEY
      );

      if (!onAuthPage) {
        window.location.replace("/login");
      }
    }

    if (
      import.meta.env.DEV &&
      status !== 401
    ) {
      console.error("API request failed", {
        status,
        method: error?.config?.method,
        url: error?.config?.url,
      });
    }

    return Promise.reject(error);
  }
);

export { api };
export default api;
