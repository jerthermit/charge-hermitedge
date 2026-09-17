const API_VERSION_PATH = "/api/v1";
const LOCAL_API_ORIGIN = "http://localhost:8000";

const cleanEnvironmentValue = (
  value?: string
): string => value?.trim() ?? "";

const normalizeApiBaseUrl = (
  rawUrl?: string
): string => {
  const trimmedUrl = cleanEnvironmentValue(
    rawUrl
  ).replace(/\/+$/, "");

  if (!trimmedUrl) {
    return `${LOCAL_API_ORIGIN}${API_VERSION_PATH}`;
  }

  if (trimmedUrl.endsWith(API_VERSION_PATH)) {
    return trimmedUrl;
  }

  if (trimmedUrl.endsWith("/api")) {
    return `${trimmedUrl}/v1`;
  }

  return `${trimmedUrl}${API_VERSION_PATH}`;
};

export const API_BASE_URL =
  normalizeApiBaseUrl(
    import.meta.env.VITE_API_URL
  );

export const GOOGLE_MAPS_API_KEY =
  cleanEnvironmentValue(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  );

export const GOOGLE_MAP_ID =
  cleanEnvironmentValue(
    import.meta.env.VITE_GOOGLE_MAP_ID
  ) || "DEMO_MAP_ID";

export const GOOGLE_MAPS_CONFIGURED =
  GOOGLE_MAPS_API_KEY.length > 0;

export const AUTH_TOKEN_KEY =
  "charge_auth_token";

export default {
  API_BASE_URL,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAP_ID,
  GOOGLE_MAPS_CONFIGURED,
  AUTH_TOKEN_KEY,
};