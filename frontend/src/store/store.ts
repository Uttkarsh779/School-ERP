import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import authReducer from "./reducers/authReducer";
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
    }).concat(
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
