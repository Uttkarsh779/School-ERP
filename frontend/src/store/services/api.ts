import type { BaseQueryApi } from "@reduxjs/toolkit/query";
import type { FetchArgs } from "@reduxjs/toolkit/query";
import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../store";
import { resetTokens, setTokens } from "../reducers/authReducer";

// In development the backend URL is "localhost". When the app is opened from another device
// on the Wi-Fi (e.g. http://192.168.1.105:5173 on a phone), "localhost" would mean that
// device, so point at the same computer the page came from. Production URLs are unchanged.
const backendUrl = String(import.meta.env.VITE_BACKEND_SERVER ?? "").replace(
  /\/\/(localhost|127\.0\.0\.1)(?=[:/])/,
  `//${typeof window !== "undefined" ? window.location.hostname : "localhost"}`
);

const baseQuery = fetchBaseQuery({
  baseUrl: backendUrl + "api/",
  prepareHeaders: (headers, { getState }) => {
    // A request that brings its own Authorization (the token refresh sends the refresh
    // token) must keep it — overwriting it with the access token made every refresh fail.
    if (headers.has("Authorization")) return headers;
    const state = getState() as RootState;
    const token = state.auth.accessToken || localStorage.getItem("accessToken");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

const endSession = (api: BaseQueryApi) => {
  api.dispatch(resetTokens());
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
};

// One refresh at a time: requests that fail together wait for the same refresh.
let refreshing: Promise<boolean> | null = null;

const refreshSession = async (api: BaseQueryApi, extraOptions: object): Promise<boolean> => {
  const state = api.getState() as RootState;
  const refreshToken = state.auth.refreshToken || localStorage.getItem("refreshToken");
  if (!refreshToken) return false;

  const refreshResult = await baseQuery(
    { url: "users/ref-token", method: "GET", headers: { Authorization: `Bearer ${refreshToken}` } },
    api,
    extraOptions
  );
  const data = refreshResult?.data as { accessToken: string; refreshToken: string } | undefined;
  if (!data?.accessToken) return false;

  api.dispatch(setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: state.auth.user }));
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  return true;
};

const urlOf = (args: string | FetchArgs) => (typeof args === "string" ? args : args.url) ?? "";

// 401 = the session is missing/expired: refresh once and retry; end the session only if the
// refresh fails. 403 = signed in but not allowed to do this — just an error, never a logout.
export const baseQueryWithReauth = async (
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object
) => {
  let result = await baseQuery(args, api, extraOptions);
  const isAuthCall = urlOf(args).startsWith("users/login") || urlOf(args).startsWith("users/ref-token");

  if (result.error?.status === 401 && !isAuthCall) {
    refreshing ??= refreshSession(api, extraOptions).finally(() => {
      refreshing = null;
    });
    if (await refreshing) {
      result = await baseQuery(args, api, extraOptions);
    } else {
      endSession(api);
    }
  }

  return result;
};
