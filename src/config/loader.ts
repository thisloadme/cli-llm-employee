import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { ProjectConfigSchema, type ProjectConfig } from "./schema.js";

export function loadConfig(cwd: string): ProjectConfig {
  const configPath = path.join(cwd, ".digital-team", "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "Config not found. Run /init first to create .digital-team/config.yaml",
    );
  }

  const raw = yaml.load(fs.readFileSync(configPath, "utf8"));
  const parsed = ProjectConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${issues}`);
  }

  return parsed.data;
}

export function saveConfig(cwd: string, config: ProjectConfig): void {
  const configPath = path.join(cwd, ".digital-team", "config.yaml");
  const validated = ProjectConfigSchema.parse(config);
  const yamlStr = yaml.dump(validated, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(configPath, yamlStr);
}

export function configExists(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".digital-team", "config.yaml"));
}
