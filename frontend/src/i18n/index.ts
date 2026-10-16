import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import hi from "./hi.json";

i18n
  //   .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: localStorage.getItem("i18nextLng") || "hi", // set Hindi as default
    fallbackLng: "hi",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Order and from where user language should be detected
      order: ["localStorage", "navigator"],

      // Keys or params to lookup language from
      lookupLocalStorage: "i18nextLng",

      // Cache user language on
      caches: ["localStorage"],
    },
  });

export default i18n;
