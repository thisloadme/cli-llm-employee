import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { getDb } from "../storage/db.js";
import * as docsRepo from "../storage/repos/documents.js";

export function detectDocType(content: string, filename: string): string {
  const lower = content.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerName.includes("adr") || lower.includes("architecture decision")) return "adr";
  if (lower.includes("specification") || lowerName.includes("spec")) return "spec";
  if (
    lower.includes("product requirement") ||
    lower.includes("prd") ||
    lower.includes("user story") ||
    lower.includes("functional requirement")
  ) {
    return "prd";
  }
  return "notes";
}

export function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();

  return path.basename(filename, path.extname(filename))
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface IngestResult {
  filename: string;
  type: string;
  title: string;
  destination: string;
}

export function ingestAll(cwd: string): IngestResult[] {
  const db = getDb(cwd);
  const inboxDir = path.join(cwd, "docs", "inbox");
  const results: IngestResult[] = [];

  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
    return results;
  }

  const entries = fs.readdirSync(inboxDir, { withFileTypes: true });
  const allowed = [".md", ".txt", ".yaml", ".yml", ".json"];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowed.includes(ext)) continue;

    const sourcePath = path.join(inboxDir, entry.name);

    const existing = docsRepo.getBySourcePath(db, entry.name);
    if (existing && existing.status === "ingested") {
      continue;
    }

    const content = fs.readFileSync(sourcePath, "utf8");
    const docType = detectDocType(content, entry.name);
    const title = extractTitle(content, entry.name);

    const dateStr = new Date().toISOString().split("T")[0];
    const destName = `${docType}.${dateStr}.${entry.name}`;

    const categoryDir = path.join(cwd, "docs", docType);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    const destPath = path.join(categoryDir, destName);
    fs.copyFileSync(sourcePath, destPath);

    if (existing) {
      docsRepo.updateProcessedPath(db, existing.id, destName);
      docsRepo.updateStatus(db, existing.id, "ingested");
    } else {
      docsRepo.create(db, {
        source_path: entry.name,
        processed_path: destName,
        doc_type: docType,
        title,
        word_count: content.split(/\s+/).length,
        status: "ingested",
      });
    }

    results.push({
      filename: entry.name,
      type: docType,
      title,
      destination: `docs/${docType}/${destName}`,
    });
  }

  return results;
}
