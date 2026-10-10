import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles/globals.css";

const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
document.documentElement.classList.toggle("dark", prefersDark);
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
