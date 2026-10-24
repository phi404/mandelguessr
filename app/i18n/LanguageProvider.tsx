import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadLanguage, saveLanguage, translate, type Language, type MessageKey } from "./messages";

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({
  language: "ja",
  setLanguage: () => {},
});

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, updateLanguage] = useState<Language>(() => initialLanguage ?? loadLanguage());
  useEffect(() => {
    document.documentElement.lang = language;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", translate(language, "homeDescription"));
  }, [language]);
  const setLanguage = (value: Language) => {
    updateLanguage(value);
    saveLanguage(value);
  };
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  return {
    language,
    setLanguage,
    t: (key: MessageKey, values?: Record<string, string | number>) => translate(language, key, values),
    number: (value: number) => value.toLocaleString(language === "ja" ? "ja-JP" : language),
  };
}
