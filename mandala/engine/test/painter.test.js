import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { createInitialCertifiedState, freezeCertifiedSnapshot } from "../../proto/certified-state.mjs";
import { createImage } from "../../proto/mandala-project.mjs";
import { projectFrozenLayered } from "../project.mjs";
import {
  paintCpu,
  paint,
  PAINTER_STATUS,
  SD_TIMEOUT_MS,
  SD_SIZE,
  SD_STEPS,
  SD_CFG,
  constrainedPrompt,
  uncensoredAdultPrompt,
} from "../painter/index.mjs";
import {
  isProPainterUnlocked,
  isProTierEnv,
  isBillingEnforce,
  resolvePainterBackend,
  assertLegalAdultTheme,
  PRO_UNCENSORED_REFUSAL,
  BILLING_UNCENSORED_REFUSAL,
  clampPainterEdge,
  FREE_SD_MODELS,
} from "../painter/pro-tier.mjs";
import { rgbToPng, decodePngToRgb, compositeSdOverRgb } from "../png.mjs";

describe("AI Painter organ", () => {
  it("CPU painter tints under certified constraints without mutating hash", () => {
    const state = createInitialCertifiedState({ seed: 9 });
    const hash = state.hash;
    const image = createImage(16, 16);
    const snap = freezeCertifiedSnapshot(state);
    projectFrozenLayered(snap, image);
    const before = image.rgb[0];
    paintCpu(snap, image);
    assert.equal(PAINTER_STATUS, "partial");
    assert.equal(image.painter.mutatesCertified, false);
    assert.equal(image.painter.organ, "AIPainter");
    assert.match(image.painter.prompt, /stateHash/);
    assert.match(image.painter.prompt, /constitution/);
    assert.equal(image.painter.tier, "free");
    assert.equal(image.painter.uncensored, false);
    assert.equal(state.hash, hash);
    assert.ok(image.rgb[0] >= before);
  });

  it("SD request stays tiny and PNG overlay does not mutate certified hash", () => {
    assert.ok(SD_TIMEOUT_MS >= 60000);
    assert.equal(SD_SIZE, "64x64");
    assert.equal(SD_STEPS, 4);
    assert.equal(SD_CFG, 1.0);
    assert.equal(clampPainterEdge(512), 128);
    assert.equal(clampPainterEdge(32), 64);

    const state = createInitialCertifiedState({ seed: 9 });
    const hash = state.hash;
    const image = createImage(8, 8);
    const snap = freezeCertifiedSnapshot(state);
    projectFrozenLayered(snap, image);
    paintCpu(snap, image);
    image.rgb.fill(10);
    const png = rgbToPng(4, 4, new Uint8Array(4 * 4 * 3).fill(200));
    const decoded = decodePngToRgb(png);
    assert.equal(decoded.width, 4);
    assert.equal(decoded.height, 4);
    compositeSdOverRgb(image.rgb, 8, 8, decoded.rgb, 4, 4, 0.55);
    assert.ok(image.rgb[0] > 10);
    assert.equal(state.hash, hash);
  });
});

describe("AI Painter open / entitlement gate", () => {
  it("without env → uncensored path denied (CLI flag alone insufficient)", () => {
    const env = {};
    assert.equal(isProTierEnv(env), false);
    assert.equal(isBillingEnforce(env), false);
    assert.equal(isProPainterUnlocked({ env, cliProUncensored: true }), false);

    const denied = resolvePainterBackend({
      requestUncensored: true,
      cliProUncensored: true,
      env,
    });
    assert.equal(denied.denied, true);
    assert.equal(denied.uncensored, false);
    assert.equal(denied.backend, "denied-uncensored");
    assert.match(denied.reason, /AI_PAINTER_UNCENSORED/);
    assert.equal(denied.reason, PRO_UNCENSORED_REFUSAL);

    const free = resolvePainterBackend({ requestUncensored: false, env });
    assert.equal(free.denied, false);
    assert.equal(free.uncensored, false);
    assert.equal(free.backend, "sd-turbo");
    assert.deepEqual(free.models, FREE_SD_MODELS);
    assert.ok(!free.preferAnything);
  });

  it("AI_PAINTER_UNCENSORED alone unlocks locally (no pro key)", () => {
    const env = { AI_PAINTER_UNCENSORED: "1" };
    assert.equal(isProPainterUnlocked({ env }), true);
    const plan = resolvePainterBackend({
      requestUncensored: true,
      env,
      modelIds: ["SD-Turbo", "Anything-V5"],
    });
    assert.equal(plan.denied, false);
    assert.equal(plan.tier, "open");
    assert.equal(plan.uncensored, true);
    assert.equal(plan.backend, "anything-v5");
    assert.equal(plan.preferAnything, true);
  });

  it("localOpen / golden path unlocks without env", () => {
    assert.equal(isProPainterUnlocked({ env: {}, localOpen: true }), true);
    const plan = resolvePainterBackend({
      requestUncensored: true,
      localOpen: true,
      env: {},
      modelIds: ["Anything-V5"],
    });
    assert.equal(plan.denied, false);
    assert.equal(plan.tier, "open");
    assert.equal(plan.uncensored, true);
  });

  it("dual pro+uncensored still resolves tier=pro", () => {
    const env = { MANDALA_PRO_TIER: "1", AI_PAINTER_UNCENSORED: "1" };
    assert.equal(isProPainterUnlocked({ env }), true);

    const plan = resolvePainterBackend({
      requestUncensored: true,
      cliProUncensored: true,
      env,
      modelIds: ["SD-Turbo", "Anything-V5"],
    });
    assert.equal(plan.denied, false);
    assert.equal(plan.tier, "pro");
    assert.equal(plan.uncensored, true);
    assert.equal(plan.backend, "anything-v5");
    assert.equal(plan.model, "Anything-V5");
    assert.equal(plan.preferAnything, true);
    assert.match(plan.logLine, /painter\.tier=pro/);
    assert.match(plan.logLine, /uncensored=true/);
  });

  it("AI_PAINTER_PRO alias with UNCENSORED → tier=pro", () => {
    const env = { AI_PAINTER_PRO: "1", AI_PAINTER_UNCENSORED: "1" };
    const plan = resolvePainterBackend({ requestUncensored: true, env });
    assert.equal(plan.uncensored, true);
    assert.equal(plan.tier, "pro");
  });

  it("pro tier alone without UNCENSORED does not unlock", () => {
    const env = { MANDALA_PRO_TIER: "1" };
    assert.equal(isProPainterUnlocked({ env }), false);
    const plan = resolvePainterBackend({ requestUncensored: true, env });
    assert.equal(plan.denied, true);
    assert.equal(plan.uncensored, false);
  });

  it("billing enforce denies uncensored-only; dual key unlocks", () => {
    const onlyUncen = { MANDALA_BILLING_ENFORCE: "1", AI_PAINTER_UNCENSORED: "1" };
    assert.equal(isBillingEnforce(onlyUncen), true);
    assert.equal(isProPainterUnlocked({ env: onlyUncen }), false);
    assert.equal(isProPainterUnlocked({ env: onlyUncen, localOpen: true }), false);
    const denied = resolvePainterBackend({
      requestUncensored: true,
      localOpen: true,
      env: onlyUncen,
    });
    assert.equal(denied.denied, true);
    assert.equal(denied.reason, BILLING_UNCENSORED_REFUSAL);

    const dual = {
      MANDALA_BILLING_ENFORCE: "1",
      MANDALA_PRO_TIER: "1",
      AI_PAINTER_UNCENSORED: "1",
    };
    assert.equal(isProPainterUnlocked({ env: dual }), true);
    const plan = resolvePainterBackend({ requestUncensored: true, env: dual });
    assert.equal(plan.denied, false);
    assert.equal(plan.tier, "pro");
  });

  it("refuses illegal minor themes; allows empty/adult theme", () => {
    assert.equal(assertLegalAdultTheme("").ok, true);
    assert.equal(assertLegalAdultTheme("adult romantic drama").ok, true);
    assert.equal(assertLegalAdultTheme("involving a child").ok, false);
  });

  it("paint() denies uncensored without env and keeps free safe prompt", async () => {
    const prev = {
      MANDALA_PRO_TIER: process.env.MANDALA_PRO_TIER,
      AI_PAINTER_PRO: process.env.AI_PAINTER_PRO,
      AI_PAINTER_UNCENSORED: process.env.AI_PAINTER_UNCENSORED,
      AI_PAINTER_OPEN: process.env.AI_PAINTER_OPEN,
      MANDALA_BILLING_ENFORCE: process.env.MANDALA_BILLING_ENFORCE,
    };
    delete process.env.MANDALA_PRO_TIER;
    delete process.env.AI_PAINTER_PRO;
    delete process.env.AI_PAINTER_UNCENSORED;
    delete process.env.AI_PAINTER_OPEN;
    delete process.env.MANDALA_BILLING_ENFORCE;
    try {
      const state = createInitialCertifiedState({ seed: 3 });
      const image = createImage(8, 8);
      const snap = freezeCertifiedSnapshot(state);
      projectFrozenLayered(snap, image);
      const result = await paint(snap, image, {
        trySd: false,
        requestUncensored: true,
        cliProUncensored: true,
        theme: "adult dramatic scene",
      });
      assert.ok(result.deniedUncensored);
      assert.match(result.deniedUncensored, /AI_PAINTER_UNCENSORED/);
      assert.equal(image.painter.uncensored, false);
      assert.equal(image.painter.uncensoredDenied, true);
      assert.equal(image.painter.sd.status, "denied");
      assert.match(image.painter.prompt, /amber lattice/);
      assert.ok(!/adult dramatic character appearance/.test(image.painter.prompt));
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("paint() with AI_PAINTER_UNCENSORED alone uses open uncensored prompt", async () => {
    const prev = {
      MANDALA_PRO_TIER: process.env.MANDALA_PRO_TIER,
      AI_PAINTER_PRO: process.env.AI_PAINTER_PRO,
      AI_PAINTER_UNCENSORED: process.env.AI_PAINTER_UNCENSORED,
      MANDALA_BILLING_ENFORCE: process.env.MANDALA_BILLING_ENFORCE,
    };
    delete process.env.MANDALA_PRO_TIER;
    delete process.env.AI_PAINTER_PRO;
    delete process.env.MANDALA_BILLING_ENFORCE;
    process.env.AI_PAINTER_UNCENSORED = "1";
    try {
      const state = createInitialCertifiedState({ seed: 4 });
      const image = createImage(8, 8);
      const snap = freezeCertifiedSnapshot(state);
      projectFrozenLayered(snap, image);
      await paint(snap, image, {
        trySd: false,
        requestUncensored: true,
        theme: "adult novel confrontation",
      });
      assert.equal(image.painter.tier, "open");
      assert.equal(image.painter.uncensored, true);
      assert.match(image.painter.prompt, /adult dramatic character appearance/);
      assert.match(image.painter.prompt, /adult novel confrontation/);
      assert.match(image.painter.prompt, /18\+/);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("free constrainedPrompt never includes Anything-V5 adult system language", () => {
    const stats = { mean: 0.1, mass: 1.2 };
    const p = constrainedPrompt({ hash: "abc", constitutionId: "c1", t: 1 }, stats);
    assert.ok(!/Anything-V5/i.test(p));
    assert.ok(!/adult dramatic character appearance/.test(p));
    const u = uncensoredAdultPrompt({ hash: "abc", constitutionId: "c1", t: 1 }, stats, "theme");
    assert.match(u, /legal adult fiction/);
  });
});

describe("AI Painter golden path gate (no live SD)", () => {
  it("open golden path does not exit 2 for missing pro env", async () => {
    const { runGoldenPainter } = await import("../../../scripts/golden-painter.mjs");
    const r = await runGoldenPainter({
      env: {},
      allowCpu: true,
      theme: "adult dramatic frost night",
    });
    assert.ok(existsSync(r.framePath));
    assert.equal(r.receipt.uncensored, true);
    assert.equal(r.receipt.tier, "open");
    assert.notEqual(r.receipt.status, undefined);
  });

  it("billing enforce still denies golden without dual key", async () => {
    const { runGoldenPainter } = await import("../../../scripts/golden-painter.mjs");
    await assert.rejects(
      () =>
        runGoldenPainter({
          env: { MANDALA_BILLING_ENFORCE: "1", AI_PAINTER_UNCENSORED: "1" },
          allowCpu: true,
          theme: "adult dramatic frost night",
        }),
      (err) => {
        assert.equal(err.code, "DENIED_UNCENSORED");
        assert.equal(err.exitCode, 2);
        assert.match(err.message, /Billing enforce|MANDALA_PRO_TIER/);
        return true;
      },
    );
  });

  it("CLI flag alone in resolvePainterBackend is never enough", () => {
    const denied = resolvePainterBackend({
      requestUncensored: true,
      cliProUncensored: true,
      env: { MANDALA_PRO_TIER: "1" },
    });
    assert.equal(denied.denied, true);
    assert.equal(denied.uncensored, false);
  });
});

describe("AI Painter golden path live smoke (integration)", () => {
  it("produces frame when GOLDEN_PAINTER_LIVE=1 and Anything GGUF or services available", async (t) => {
    if (process.env.GOLDEN_PAINTER_LIVE !== "1") {
      t.skip("set GOLDEN_PAINTER_LIVE=1 to run live golden painter (sd-cli ~60s)");
      return;
    }
    const { sdCliAvailable } = await import("../painter/sd-cli.mjs");
    const { runGoldenPainter } = await import("../../../scripts/golden-painter.mjs");
    if (!sdCliAvailable()) {
      t.skip("Anything-V5 GGUF / sd-cli missing — see docs/mandala/GOLDEN_PATH_PRO_PAINTER.md");
      return;
    }
    const prev = {
      MANDALA_PRO_TIER: process.env.MANDALA_PRO_TIER,
      AI_PAINTER_UNCENSORED: process.env.AI_PAINTER_UNCENSORED,
      MANDALA_BILLING_ENFORCE: process.env.MANDALA_BILLING_ENFORCE,
    };
    delete process.env.MANDALA_PRO_TIER;
    delete process.env.AI_PAINTER_UNCENSORED;
    delete process.env.MANDALA_BILLING_ENFORCE;
    try {
      const r = await runGoldenPainter({
        env: process.env,
        edge: 64,
        allowCpu: false,
      });
      assert.ok(existsSync(r.framePath));
      assert.ok(r.receipt.tier === "open" || r.receipt.tier === "pro");
      assert.equal(r.receipt.uncensored, true);
      assert.ok(r.receipt.sha256);
      assert.ok(
        r.receipt.backend === "anything-v5" ||
          r.receipt.backend === "sd-turbo-fallback" ||
          r.receipt.backend === "sd-turbo",
        `unexpected backend ${r.receipt.backend}`,
      );
      assert.ok(r.receipt.model, "receipt must name a real model");
      assert.notEqual(r.receipt.backend, "cpu-field-tint");
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
