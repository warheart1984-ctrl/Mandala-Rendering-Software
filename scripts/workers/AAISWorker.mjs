import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export class AAISWorker {
  constructor(name, version = "1.0.0") {
    this.name = name;
    this.version = version;
    this.startTime = null;
    this.endTime = null;
  }

  async execute(input) {
    this.startTime = Date.now();
    const inputHash = this.hashInput(input);
    const intentId = `intent-${this.name}-${Date.now()}`;

    console.log(`[AAIS:${this.name}] Intent: ${intentId}`);
    console.log(`[AAIS:${this.name}] Input hash: ${inputHash}`);

    try {
      const result = await this.process(input);
      this.endTime = Date.now();

      const outputHash = this.hashOutput(result);
      const evidence = {
        worker: this.name,
        version: this.version,
        intentId,
        inputHash,
        outputHash,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.endTime - this.startTime,
        timestamp: new Date().toISOString(),
      };

      console.log(`[AAIS:${this.name}] Output hash: ${outputHash}`);
      console.log(`[AAIS:${this.name}] Duration: ${evidence.duration}ms`);

      return { result, evidence };
    } catch (error) {
      this.endTime = Date.now();
      const errorEvidence = {
        worker: this.name,
        version: this.version,
        intentId,
        inputHash,
        error: error.message,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.endTime - this.startTime,
        timestamp: new Date().toISOString(),
      };

      console.error(`[AAIS:${this.name}] Error: ${error.message}`);
      throw { error, evidence: errorEvidence };
    }
  }

  async process(input) {
    throw new Error("process() must be implemented by subclass");
  }

  hashInput(input) {
    return createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex")
      .slice(0, 16);
  }

  hashOutput(output) {
    return createHash("sha256")
      .update(JSON.stringify(output))
      .digest("hex")
      .slice(0, 16);
  }

  logEvidence(evidence, outputDir) {
    mkdirSync(outputDir, { recursive: true });
    const evidencePath = resolve(outputDir, `${this.name}-evidence.json`);
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(`[AAIS:${this.name}] Evidence: ${evidencePath}`);
    return evidencePath;
  }
}
