import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

export async function GET() {
  const packagePath = path.join(process.cwd(), "package.json");
  const changelogPath = path.join(process.cwd(), "../../CHANGELOG.md");

  const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
  const changelogContent = readFileSync(changelogPath, "utf-8");

  // Extract last 5 sections (assuming sections start with ##)
  const sections = changelogContent.split(/\n(?=## )/);
  const last5Sections = sections.slice(0, 6).join("\n"); // Take 6 to include header + 5 sections

  return NextResponse.json({
    name: "CtxNest",
    author: "Safiyu",
    version: pkg.version,
    changelog: last5Sections,
  });
}
