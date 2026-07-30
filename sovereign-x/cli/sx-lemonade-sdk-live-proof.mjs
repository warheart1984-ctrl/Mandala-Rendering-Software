/**
 * One-shot live Lemonade SDK chat proof (FX-8350 / R9 380 + Vulkan GGUF).
 * Writes docs/4d-engine/proofs/legacy-efficient/lemonade-sdk-live-chat-proof.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LemonadeSdkChatClient,
  DEFAULT_CHAT_MODEL,
  writeSdkCapabilityReport,
} from "../router/modules/gpu/amd/lemonadeSdkChatAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proofDir = resolve(
  __dirname,
  "../../docs/4d-engine/proofs/legacy-efficient",
);

async function main() {
  const client = new LemonadeSdkChatClient({ timeoutMs: 180_000 });
  const connect = await client.connect();
  const listed = await client.listModels();
  const model =
    listed.downloadedLlmModels?.includes(DEFAULT_CHAT_MODEL)
      ? DEFAULT_CHAT_MODEL
      : listed.downloadedLlmModels?.[0] || DEFAULT_CHAT_MODEL;

  const chat = await client.chatCompletions({
    model,
    prompt: "Reply with exactly: OK",
    max_tokens: 16,
    timeoutMs: 180_000,
  });

  const contentOk =
    !!chat.ok &&
    typeof chat.content === "string" &&
    chat.content.trim().length > 0;

  const proof = {
    capturedAt: new Date().toISOString(),
    adapterId: "sx.adapter.lemonade.sdk.chat",
    provider: "lemonade-sdk",
    status: contentOk ? "partial" : chat.ok ? "partial" : "blocked",
    liveChatRoundTrip: contentOk,
    model,
    backend: "llamacpp:vulkan",
    hostHint:
      "FX-8350 / R9 380 — Vulkan GGUF preferred over AVX2-only CPU llama binaries",
    notes: {
      preferred: DEFAULT_CHAT_MODEL,
      alsoPulledOnHost: ["Qwen3-0.6B-GGUF", "Bonsai-1.7B-gguf"],
      qwenNote:
        "Qwen3-0.6B-GGUF may return empty/garbled content on this Vulkan path; Llama-3.2-1B-Instruct is the proven live chat model.",
    },
    connect: {
      serverUp: connect.serverUp,
      selectedBaseUrl: connect.selectedBaseUrl,
      version: connect.version,
    },
    downloadedLlmModels: listed.downloadedLlmModels,
    chat: {
      ok: chat.ok,
      content: chat.content,
      model: chat.model,
      baseUrl: chat.baseUrl,
      elapsedMs: chat.elapsedMs,
      usage: chat.usage,
      finishReason: chat.finishReason || null,
      code: chat.code || null,
      message: chat.message,
    },
    invoke: [
      "node sovereign-x/cli/sx-legacy-efficient.mjs --probe-lemonade-sdk",
      'node sovereign-x/cli/sx-legacy-efficient.mjs --intent demo --provider lemonade-sdk --chat "Reply with exactly: OK"',
      "node sovereign-x/cli/sx-lemonade-sdk-live-proof.mjs",
    ],
  };

  mkdirSync(proofDir, { recursive: true });
  const proofPath = join(proofDir, "lemonade-sdk-live-chat-proof.json");
  writeFileSync(proofPath, JSON.stringify(proof, null, 2), "utf8");

  await writeSdkCapabilityReport(
    join(proofDir, "lemonade-sdk-capability-report.json"),
    {
      tryChat: true,
      model: DEFAULT_CHAT_MODEL,
      prompt: "Reply with exactly: OK",
      max_tokens: 16,
      timeoutMs: 180_000,
    },
  );

  console.log(JSON.stringify({ proofPath, ...proof }, null, 2));
  process.exit(contentOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
