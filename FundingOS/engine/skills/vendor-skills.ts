/**
 * FundingOS Vendor Skills Loader — Loads all skills from .opencode/skill/
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Skill {
  name: string;
  description: string;
  location: string;
  triggers: string[];
  metadata: Record<string, unknown>;
}

export class VendorSkillsLoader {
  private skills = new Map<string, Skill>();
  private skillsRoot: string;

  constructor(skillsRoot?: string) {
    this.skillsRoot = skillsRoot || join(__dirname, "..", "..", "..", ".opencode", "skill");
    this.loadAllSkills();
  }

  loadAllSkills(): void {
    if (!existsSync(this.skillsRoot)) {
      console.warn(`Skills directory not found: ${this.skillsRoot}`);
      return;
    }

    const skillDirs = readdirSync(this.skillsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const skillName of skillDirs) {
      const skillPath = join(this.skillsRoot, skillName, "SKILL.md");
      if (existsSync(skillPath)) {
        const content = readFileSync(skillPath, "utf-8");
        const skill = this.parseSkillMarkdown(skillName, content, skillPath);
        this.skills.set(skillName, skill);
      }
    }

    console.log(`Loaded ${this.skills.size} vendor skills`);
  }

  parseSkillMarkdown(name: string, content: string, path: string): Skill {
    const lines = content.split("\n");
    let description = "";
    let triggers: string[] = [];
    const metadata: Record<string, unknown> = {};

    for (const line of lines) {
      if (line.trim() && !line.startsWith("#") && !line.startsWith("##")) {
        description = line.trim();
        break;
      }
    }

    const triggerMatch = content.match(/Triggers on:\s*(.+)/i);
    if (triggerMatch) {
      triggers = triggerMatch[1].split(",").map(t => t.trim().replace(/[`*]/g, ""));
    }

    const kvMatches = content.matchAll(/(\w+):\s*(.+)/g);
    for (const match of kvMatches) {
      metadata[match[1].toLowerCase()] = match[2].trim();
    }

    return {
      name,
      description,
      location: path,
      triggers,
      metadata
    };
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkillsByTrigger(trigger: string): Skill[] {
    return this.getAllSkills().filter(s =>
      s.triggers.some(t => t.toLowerCase().includes(trigger.toLowerCase()))
    );
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }
}

export function createVendorSkillsLoader(skillsRoot?: string): VendorSkillsLoader {
  return new VendorSkillsLoader(skillsRoot);
}

let skillsLoaderInstance: VendorSkillsLoader | null = null;

export function getVendorSkillsLoader(skillsRoot?: string): VendorSkillsLoader {
  if (!skillsLoaderInstance) {
    skillsLoaderInstance = createVendorSkillsLoader(skillsRoot);
  }
  return skillsLoaderInstance;
}