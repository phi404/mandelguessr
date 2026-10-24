import { createRoot } from "react-dom/client";
import { MandelGuessrPrototype } from "./MandelGuessrPrototype";
import "./globals.css";
import { LanguageProvider } from "./i18n/LanguageProvider";

const root = createRoot(document.getElementById("root")!);

if (import.meta.env.DEV && /^\/generator-lab\/?$/.test(window.location.pathname)) {
  const { GeneratorLab } = await import("./generator-lab/GeneratorLab");
  await import("./generator-lab/lab.css");
  document.title = "Generator Lab · MandelGuessr";
  root.render(<LanguageProvider><GeneratorLab /></LanguageProvider>);
} else {
  root.render(<LanguageProvider><MandelGuessrPrototype /></LanguageProvider>);
}
