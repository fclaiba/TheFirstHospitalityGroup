// All install icons derive from the same replaceable mark and the approved brand tokens.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const mark = await readFile(new URL("../public/brand/mark.svg", import.meta.url), "utf8");
const tokens = await readFile(new URL("../docs/brand/tokens.css", import.meta.url), "utf8");
const color = (name) => {
  const value = tokens.match(new RegExp(`--color-${name}:\\s*([^;]+)`))?.[1];
  if (!value) throw new Error(`Missing brand color: ${name}`);
  return value.startsWith("var(") ? color(value.match(/--color-([\w-]+)/)[1]) : value;
};
const foreground = mark.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replaceAll("currentColor", color("on-brand"));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="${color("on-brand")}"><rect width="512" height="512" fill="${color("brand")}"/>${foreground}</svg>`;
await writeFile(new URL("../public/icon.svg", import.meta.url), svg);
await writeFile(new URL("../app/icon.svg", import.meta.url), svg);
for (const [path, size] of [["public/icon-192.png", 192], ["public/icon-512.png", 512], ["app/apple-icon.png", 180]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(`../${path}`, import.meta.url)));
}
console.log("Brand icons generated from public/brand/mark.svg");
