import { configureStore, createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import authReducer, { resetTokens, setTokens, updateUser } from "./reducers/authReducer";
import { apiUser } from "./services/user.api";
import { apiListpage } from "./services/listpage.api";
import { apiOpportunities } from "./services/opportunities.api";
import { apiFaq } from "./services/faq.api";
import { apiSliders } from "./services/sliders.api";
import { apiSetting } from "./services/setting.api";
import { apiMainMenu } from "./services/mainMenu.api";
import { galleryCategoryApi } from "./services/galleryCategory.api";
import { galleryImageApi } from "./services/galleryImage.api";
import { apiSubmenu } from "./services/submenu.api";
import { apiTelephonic } from "./services/telephonic.api";
import { apiFooterMenu } from "./services/footerMenu.api";
import { apiQuickMenu } from "./services/quickMenu.api";
import { apiSocial } from "./services/social.api";
import { apiPortal } from "./services/portal.api";
import { erpApi } from "./api/erpApi";
import { profileApi, type MyProfile } from "./api/profile.api";

// Cached ERP data belongs to the logged-in account: drop it on logout, and when a login
// switches to a different account (a token refresh for the same user keeps it).
const sessionListener = createListenerMiddleware();
sessionListener.startListening({
  predicate: (action, current, previous) =>
    resetTokens.match(action) ||
    (setTokens.match(action) &&
      (current as RootState).auth.user?.id !== (previous as RootState).auth.user?.id),
  effect: (_action, api) => {
    api.dispatch(erpApi.util.resetApiState());
    // Also drop any API responses the service worker saved (older app versions cached
    // signed-in data), so nothing from the previous account can be shown.
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("api-")).map((k) => caches.delete(k))))
        .catch(() => undefined);
    }
  },
});

// The name saved at login goes stale when the account is renamed (by the user on My Profile
// or by the Super Admin). Whenever the live profile loads or is saved, copy its name over.
sessionListener.startListening({
  matcher: isAnyOf(profileApi.endpoints.getMyProfile.matchFulfilled, profileApi.endpoints.updateMyProfile.matchFulfilled),
  effect: (action, api) => {
    const profile = action.payload as MyProfile | undefined;
    const user = (api.getState() as RootState).auth.user;
    if (profile && user?.id === profile.id && user.name !== profile.name) api.dispatch(updateUser({ name: profile.name }));
  },
});

// Earlier versions cached signed-in API responses per URL ("api-get-cache"); remove it.
if (typeof caches !== "undefined") caches.delete("api-get-cache").catch(() => undefined);

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiUser.reducerPath]: apiUser.reducer,
    [apiSubmenu.reducerPath]: apiSubmenu.reducer,
    [apiTelephonic.reducerPath]: apiTelephonic.reducer,
    [apiListpage.reducerPath]: apiListpage.reducer,
    [apiOpportunities.reducerPath]: apiOpportunities.reducer,
    [apiFaq.reducerPath]: apiFaq.reducer,
    [apiSliders.reducerPath]: apiSliders.reducer,
    [apiSetting.reducerPath]: apiSetting.reducer,
    [apiMainMenu.reducerPath]: apiMainMenu.reducer,
    [galleryCategoryApi.reducerPath]: galleryCategoryApi.reducer,
    [galleryImageApi.reducerPath]: galleryImageApi.reducer,
    [apiFooterMenu.reducerPath]: apiFooterMenu.reducer,
    [apiQuickMenu.reducerPath]: apiQuickMenu.reducer,
    [apiSocial.reducerPath]: apiSocial.reducer,
    [apiPortal.reducerPath]: apiPortal.reducer,
    [erpApi.reducerPath]: erpApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).prepend(sessionListener.middleware).concat(
      apiUser.middleware,
      apiSubmenu.middleware,
      apiTelephonic.middleware,
      apiListpage.middleware,
      apiOpportunities.middleware,
      apiFaq.middleware,
      apiSliders.middleware,
      apiSetting.middleware,
      apiMainMenu.middleware,
      galleryCategoryApi.middleware,
      galleryImageApi.middleware,
      apiFooterMenu.middleware,
      apiQuickMenu.middleware,
      apiSocial.middleware,
      apiPortal.middleware,
      erpApi.middleware
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
