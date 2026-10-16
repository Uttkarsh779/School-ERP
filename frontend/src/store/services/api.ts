import type { BaseQueryApi } from "@reduxjs/toolkit/query";
import type { FetchArgs } from "@reduxjs/toolkit/query";
import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../store";
import { resetTokens, setTokens } from "../reducers/authReducer";

const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_BACKEND_SERVER + "api/",
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootState;
    const token = state.auth.accessToken || localStorage.getItem("accessToken");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

export const baseQueryWithReauth = async (
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object
) => {
  let result = await baseQuery(args, api, extraOptions);
  if (
    typeof args !== "string" &&
    !(args.url?.split("/")[0] === "users" && args?.method === "POST") &&
    result.error &&
    (result.error.status === 401 || result.error.status === 403)
  ) {
    const state = api.getState() as RootState;
    const refreshToken = state.auth.refreshToken || localStorage.getItem("refreshToken");

    if (refreshToken) {
      const refreshResult = await baseQuery(
        {
          url: "users/ref-token",
          method: "GET",
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        },
        api,
        extraOptions
      );

      const data = refreshResult?.data as { accessToken: string; refreshToken: string } | undefined;

      if (data && data.accessToken) {
        api.dispatch(
          setTokens({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: state.auth.user,
          })
        );
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);

        // Retry original request
        result = await baseQuery(args, api, extraOptions);
      } else {
        // Refresh failed, clear session and reset
        api.dispatch(resetTokens());
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
      }
    } else {
      api.dispatch(resetTokens());
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    }
  }

  return result;
};
