import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "websites/veele-services";
mkdirSync(join(root, "dist"), { recursive: true });
cpSync(join(root, "assets"), join(root, "dist/assets"), { recursive: true });
execFileSync("python3", [join(root, "scripts/build-frame.py")], { stdio: "inherit" });
const pages = {};
function collect(directory, path = "/") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "assets") continue;
    if (entry.isDirectory()) collect(join(directory, entry.name), `${path}${entry.name}/`);
    else if (entry.name === "index.html") pages[path] = readFileSync(join(directory, entry.name), "utf8");
  }
}
collect(join(root, "dist"));
if (Object.keys(pages).length !== 28) throw new Error("Expected all 28 supplied marketing routes");
pages["404"] = readFileSync(join(root, "dist/404.html"), "utf8");
writeFileSync(join(root, "pages.generated.json"), JSON.stringify(pages, null, 2) + "\n");
mkdirSync("public/veele-services", { recursive: true });
cpSync(join(root, "assets"), "public/veele-services/assets", { recursive: true });
console.log("28 marketing routes and supplied assets generated.");
