import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cached for the lifetime of the process; both files only change between deploys.
let cached: { version: string; changelog: string } | null = null;

function loadAboutInfo() {
  if (cached) return cached;
  const packagePath = path.join(process.cwd(), "package.json");
  const changelogPath = path.join(process.cwd(), "../../CHANGELOG.md");

  let version = "unknown";
  let changelog = "";

  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    if (typeof pkg.version === "string") version = pkg.version;
  } catch (e) {
    console.warn("[/api/about] failed to read package.json:", e);
  }

  try {
    const changelogContent = readFileSync(changelogPath, "utf-8");
    const sections = changelogContent.split(/\n(?=## )/);
    changelog = sections.slice(0, 6).join("\n"); // header + 5 releases
  } catch (e) {
    console.warn("[/api/about] failed to read CHANGELOG.md:", e);
  }

  cached = { version, changelog };
  return cached;
}

export async function GET() {
  const { version, changelog } = loadAboutInfo();
  return NextResponse.json({
    name: "CtxNest",
    author: "Safiyu",
    version,
    changelog,
  });
}
