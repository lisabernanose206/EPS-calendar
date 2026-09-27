import "./styles.css";
import "./ui/error-state.css";
import { configureWebRuntime } from "./app/config.js";
import { startApp } from "./app/start.js";

configureWebRuntime(import.meta.env);
startApp();
