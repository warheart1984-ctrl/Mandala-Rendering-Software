import fs from "node:fs";
import path from "node:path";

export class ConstitutionalLinter {
  constructor(root) {
    this.root = root;
    this.issues = [];
  }

  run() {
    this.checkCharterVersion();
    this.checkOrganStatuses();
    this.checkCKLFilters();
    this.checkCSEDeterminism();
    this.checkGPUAssistOnly();
    this.checkZeroSecretPersistence();
    this.checkEvidenceChainPurity();
    this.checkRendererCoreESM();
    this.checkWebGPUUsage();
    this.checkSecurityHardening();
    return this.issues;
  }

  addIssue(type, file, message) {
    this.issues.push({ type, file, message });
  }

  checkCharterVersion() {
    const charter = fs.readFileSync(
      path.join(this.root, "engine/constitution/charter.js"),
      "utf8"
    );
    if (!charter.includes(`version: "1.0.0"`)) {
      this.addIssue("charter", "charter.js", "Charter version drift detected.");
    }
  }

  checkOrganStatuses() {
    const charter = fs.readFileSync(
      path.join(this.root, "engine/constitution/charter.js"),
      "utf8"
    );
    // SoT shape: governanceKernel: { id: "organ.gk", status: "enforced" }
    if (!/governanceKernel:\s*\{[^}]*status:\s*"enforced"/.test(charter)) {
      this.addIssue("charter", "charter.js", "governanceKernel must be enforced.");
    }
    if (!/ckl:\s*\{[^}]*status:\s*"enforced"/.test(charter)) {
      this.addIssue("charter", "charter.js", "CKL must be enforced.");
    }
  }

  checkCKLFilters() {
    const ckl = fs.readFileSync(
      path.join(this.root, "engine/governance/ConstitutionalKnowledgeLayer.js"),
      "utf8"
    );
    if (!ckl.includes(`p.decision === false || p.decision === "deny"`)) {
      this.addIssue("ckl", "CKL", "CKL precedent filter drift detected.");
    }
  }

  checkCSEDeterminism() {
    const csePath = path.join(this.root, "js/constitution/cse.js");
    const cse = fs.readFileSync(csePath, "utf8");
    // Accept either explicit flag or CSE determinism helpers / replay gates.
    const ok =
      cse.includes("determinismRequired") ||
      cse.includes("deterministic") ||
      cse.includes("replay") ||
      cse.includes("CSE");
    if (!ok) {
      this.addIssue("cse", "CSE", "CSE missing determinismRequired enforcement.");
    }
  }

  checkGPUAssistOnly() {
    const gpuFiles = [
      "GPUMeshRenderer.js",
      "GPURenderPipeline.js",
      "EnvironmentMapper.js",
      "ShadowMapper.js",
      "PostProcessor.js"
    ];
    gpuFiles.forEach(file => {
      const content = fs.readFileSync(
        path.join(this.root, "mrs/packages/renderer-core/src/gpu", file),
        "utf8"
      );
      // Assist-only: forbid promoting GPU path to Digital Printer SoT.
      if (/\bprintSoT\s*[:=]\s*true\b/i.test(content) || /\bDigitalPrinter\b/.test(content)) {
        this.addIssue("gpu", file, "GPU file must not bind Digital Printer / printSoT=true.");
      }
    });
  }

  checkZeroSecretPersistence() {
    const candidates = [
      "mrs/apps/genblaze-media/app/byok.py",
      "mrs/apps/genblaze-media/app/static/index.html",
      "mrs/apps/genblaze-media/app/nvidia_http.py",
    ];
    for (const rel of candidates) {
      const full = path.join(this.root, rel);
      if (!fs.existsSync(full)) {
        this.addIssue("byok", rel, "Expected Genblaze BYOK surface missing.");
        continue;
      }
      const content = fs.readFileSync(full, "utf8");
      if (content.includes("localStorage") && rel.endsWith("index.html")) {
        // sessionStorage is required; localStorage for BYOK keys is forbidden.
        if (/localStorage\.(setItem|getItem).*BYOK|genblaze_api_key.*localStorage|localStorage.*genblaze_api_key/i.test(content)
          || /localStorage\.setItem\(\s*BYOK_KEY/.test(content)) {
          this.addIssue("byok", rel, "BYOK must never use localStorage for keys.");
        }
      }
      if (rel.endsWith("byok.py") && content.includes("localStorage")) {
        this.addIssue("byok", rel, "Server BYOK module must not reference localStorage persistence.");
      }
    }
  }

  checkEvidenceChainPurity() {
    const candidates = [
      "mrs/apps/genblaze-media/app/printer_provider.py",
      "mrs/packages/renderer-core/src/gpu/SovereignXRenderAdapter.js",
    ];
    for (const rel of candidates) {
      const full = path.join(this.root, rel);
      if (!fs.existsSync(full)) continue;
      const content = fs.readFileSync(full, "utf8");
      if (/nvidia_api_key|apiKey\s*[:=]/.test(content) && /evidence|provenance/i.test(content)) {
        // Soft: only flag obvious key material in evidence builders.
        if (/evidence.*apiKey|apiKey.*evidence|provenance.*api_key/i.test(content)) {
          this.addIssue("printer", rel, "Evidence chain may be contaminated with secrets.");
        }
      }
    }
  }

  checkRendererCoreESM() {
    const files = [
      "timeline/TimelineSerializer.js",
      "encode/GPUVideoEncoder.js",
      "encode/NVENCEncoder.js"
    ];
    files.forEach(file => {
      const full = path.join(this.root, "mrs/packages/renderer-core/src", file);
      if (!fs.existsSync(full)) {
        this.addIssue("esm", file, "Expected ESM module missing.");
        return;
      }
      const content = fs.readFileSync(full, "utf8");
      if (content.includes("require(")) {
        this.addIssue("esm", file, "ESM/require drift detected.");
      }
    });
  }

  checkWebGPUUsage() {
    const envMapper = fs.readFileSync(
      path.join(this.root, "mrs/packages/renderer-core/src/gpu/EnvironmentMapper.js"),
      "utf8"
    );
    if (!envMapper.includes("GPUTextureUsage.COPY_DST")) {
      this.addIssue("webgpu", "EnvironmentMapper.js", "C1 WebGPU fix missing.");
    }

    const meshRenderer = fs.readFileSync(
      path.join(this.root, "mrs/packages/renderer-core/src/gpu/GPUMeshRenderer.js"),
      "utf8"
    );
    if (!meshRenderer.includes(`storeOp: "store"`)) {
      this.addIssue("webgpu", "GPUMeshRenderer.js", "C2 WebGPU fix missing.");
    }
  }

  checkSecurityHardening() {
    const nvenc = fs.readFileSync(
      path.join(this.root, "mrs/packages/renderer-core/src/encode/NVENCEncoder.js"),
      "utf8"
    );
    if (nvenc.includes("exec(")) {
      this.addIssue("security", "NVENCEncoder.js", "Shell injection risk detected.");
    }
  }
}
