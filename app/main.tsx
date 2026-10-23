import { createRoot } from "react-dom/client";
import { MandelGuessrPrototype } from "./MandelGuessrPrototype";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);

if (import.meta.env.DEV && /^\/generator-lab\/?$/.test(window.location.pathname)) {
  const { GeneratorLab } = await import("./generator-lab/GeneratorLab");
  await import("./generator-lab/lab.css");
  document.title = "Generator Lab · MandelGuessr";
  root.render(<GeneratorLab />);
} else {
  root.render(<MandelGuessrPrototype />);
}
