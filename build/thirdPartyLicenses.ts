import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

interface PackageLicense {
  name: string;
  version: string;
  license: string;
  repository?: string;
  text?: string;
}

const NODE_MODULES = "/node_modules/";

/**
 * License texts for packages that declare a license but ship no text of it, copied from their
 * repositories: Terraformer's (terraformer-js/terraformer) and Terra Draw's (JamesLMilner/terra-draw).
 */
const VENDORED: [RegExp, string][] = [
  [/^@terraformer\//, "terraformer.txt"],
  [/^terra-draw(-|$)/, "terra-draw.txt"],
];

function vendoredLicense(name: string): string | undefined {
  const file = VENDORED.find(([pattern]) => pattern.test(name))?.[1];
  return file
    ? readFileSync(
        fileURLToPath(new URL(`./licenses/${file}`, import.meta.url)),
        "utf8",
      ).trim()
    : undefined;
}

/** A README's "License" section, where some packages keep their license text. */
function readmeLicense(dir: string): string | undefined {
  const readme = readdirSync(dir).find((file) => /^readme(\.|$)/i.test(file));
  if (!readme) return undefined;
  const text = readFileSync(`${dir}/${readme}`, "utf8");
  const section = /^#+\s*licen[cs]e[^\n]*\n([\s\S]*?)(?=^#|(?![\s\S]))/im.exec(
    text,
  )?.[1];
  // A bare "MIT" says less than the package.json already does.
  return section && /copyright/i.test(section) ? section.trim() : undefined;
}

/** The node_modules folder of the package a bundled module comes from, scoped names included. */
export function packageDir(moduleId: string): string | null {
  const id = moduleId.replace(/\0/g, "").split("?")[0].replaceAll("\\", "/");
  const at = id.lastIndexOf(NODE_MODULES);
  if (at < 0) return null;
  const parts = id.slice(at + NODE_MODULES.length).split("/");
  const depth = parts[0].startsWith("@") ? 2 : 1;
  return (
    id.slice(0, at + NODE_MODULES.length) + parts.slice(0, depth).join("/")
  );
}

function readPackage(dir: string): PackageLicense {
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  // Old packages list licenses as objects instead of an SPDX expression.
  const license =
    pkg.license ??
    pkg.licenses?.map((l: { type: string }) => l.type).join(" OR ") ??
    "UNKNOWN";
  const repository =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  const licenseFile = readdirSync(dir).find((file) =>
    /^(licen[cs]e|copying)([.-]|$)/i.test(file),
  );
  return {
    name: pkg.name,
    version: pkg.version,
    license,
    repository: repository
      // GitHub shorthand, as in "JamesLMilner/terra-draw".
      ?.replace(/^(github:)?([\w.-]+\/[\w.-]+)$/, "https://github.com/$2")
      .replace(/^git\+/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/\.git$/, ""),
    text: licenseFile
      ? readFileSync(`${dir}/${licenseFile}`, "utf8").trim()
      : (readmeLicense(dir) ?? vendoredLicense(pkg.name)),
  };
}

/** Where Node would find a dependency of the package in fromDir: its own node_modules, then each enclosing one. */
export function resolveDependency(
  fromDir: string,
  name: string,
): string | null {
  for (let base = fromDir; ;) {
    const candidate = `${base}/node_modules/${name}`;
    if (existsSync(`${candidate}/package.json`)) return candidate;
    const at = base.lastIndexOf(NODE_MODULES);
    if (at < 0) return null;
    base = base.slice(0, at);
  }
}

/**
 * A package's runtime dependencies. Libraries such as MapLibre ship with theirs already
 * bundled in, so they never show up as modules of their own.
 */
function dependencyDirs(dir: string): string[] {
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  return Object.keys(pkg.dependencies ?? {})
    .filter((name) => !name.startsWith("@types/"))
    .flatMap((name) => resolveDependency(dir, name) ?? []);
}

export function formatLicenses(packages: PackageLicense[]): string {
  const header = [
    "Third-party licenses",
    "",
    "GeoWut bundles the following open-source packages, under these licenses.",
    "GeoWut itself is MIT licensed: see LICENSE in its repository.",
  ].join("\n");
  const sections = packages.map(
    ({ name, version, license, repository, text }) =>
      [
        "=".repeat(80),
        `${name} ${version} (${license})`,
        ...(repository ? [repository] : []),
        "",
        text ??
          `No license file is included with this package; it is licensed under ${license}.`,
      ].join("\n"),
  );
  return [header, ...sections, ""].join("\n\n");
}

/**
 * Writes every bundled package's license to a file served with the site, as MIT, BSD and
 * Apache ask their notices to travel with the code. Only packages that end up in the bundle
 * count, so the list can't drift from what's shipped.
 */
export function thirdPartyLicenses(
  fileName = "third-party-licenses.txt",
): Plugin {
  return {
    name: "third-party-licenses",
    apply: "build",
    generateBundle(_, bundle) {
      const dirs = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of output.moduleIds) {
          const dir = packageDir(id);
          if (dir) dirs.add(dir);
        }
      }
      // Their dependencies too, all the way down: more than strictly bundled, never less.
      for (const dir of dirs)
        for (const dep of dependencyDirs(dir)) dirs.add(dep);
      const packages = [...dirs]
        .map(readPackage)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.emitFile({
        type: "asset",
        fileName,
        source: formatLicenses(packages),
      });
    },
  };
}
