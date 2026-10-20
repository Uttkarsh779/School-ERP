import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

// Define a type for the slice state
interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: IUser;
  isAuthenticated: boolean;
  loading: boolean;
}

// Define the initial state using that type
const initialState: AuthState = {
  accessToken: localStorage.getItem("accessToken") || "",
  refreshToken: localStorage.getItem("refreshToken") || "",
  user: localStorage.getItem("user")
    ? JSON.parse(localStorage.getItem("user") as string) as IUser
    : {} as IUser,
  isAuthenticated: !!localStorage.getItem("accessToken"),
  loading: true,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<{ loading: boolean }>) => {
      state.loading = action.payload.loading;
    },
    setTokens: (
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        user: IUser;
      }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.loading = false;
      localStorage.setItem("accessToken", action.payload.accessToken);
      localStorage.setItem("refreshToken", action.payload.refreshToken);
      localStorage.setItem("user", JSON.stringify(action.payload.user));
    },
    // Keeps the signed-in user's saved details (name etc.) in step with their profile, so a
    // renamed account shows the new name everywhere without signing in again.
    updateUser: (state, action: PayloadAction<Partial<IUser>>) => {
      if (!state.user?.id) return;
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem("user", JSON.stringify(state.user));
    },
    resetTokens: (state) => {
      state.accessToken = "";
      state.refreshToken = "";
      state.user = {} as IUser;
      state.isAuthenticated = false;
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
    },
  },
});

export const { setLoading, setTokens, updateUser, resetTokens } = authSlice.actions;

export default authSlice.reducer;
