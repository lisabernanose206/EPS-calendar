import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderErrorState } from "../src/ui/error-state.js";

export async function generateNotFound() {
  const base = process.env.PAGES_BASE_PATH || "";
  if (base && !/^\/(?:[A-Za-z0-9_.~-]+\/?)*$/.test(base)) throw new Error("Invalid PAGES_BASE_PATH");
  if (base.split("/").some(part => part === "." || part === "..")) throw new Error("Invalid PAGES_BASE_PATH");
  const home = base.replace(/\/$/, "") + "/";
  const read = path => readFile(new URL("../" + path, import.meta.url));
  const [template, css, png] = await Promise.all([read("src/404.template.html"), read("src/ui/error-state.css"), read("assets/icon_app_small.png")]);
  const icon = "data:image/png;base64," + png.toString("base64");
  const styles = css.toString("utf8");
  const output = template.toString("utf8")
    .replace("ERROR_STYLE_HASH", createHash("sha256").update(styles).digest("base64"))
    .replace("ERROR_ICON", icon)
    .replace("ERROR_STYLES", () => styles)
    .replace("ERROR_CONTENT", () => renderErrorState("notFound", { icon, home }));
  await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
  await writeFile(new URL("../dist/404.html", import.meta.url), output, "utf8");
  console.log("dist/404.html generated (home: " + home + ").");
}
