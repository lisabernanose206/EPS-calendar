import { readdir, copyFile, mkdir } from "node:fs/promises";

const source = new URL("../assets/", import.meta.url);
const destination = new URL("../dist/assets/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (name.endsWith(".png")) await copyFile(new URL(name, source), new URL(name, destination));
}
