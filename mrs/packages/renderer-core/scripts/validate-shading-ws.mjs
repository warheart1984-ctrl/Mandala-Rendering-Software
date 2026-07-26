#!/usr/bin/env node
/**
 * Validate LiveLink shading_update JSON on ws://127.0.0.1:9487 (default).
 *
 * Modes:
 *   --harness   Start ephemeral LiveLinkServer, broadcast one sample, validate, exit.
 *   (default)   Connect as client to an existing server; wait for shading_update.
 *
 * Always times out deterministically (default 8000ms). Exit 0 on success, nonzero on failure.
 *
 * Status: partial transport validation — does not execute Unity or Shade4D.
 */
import { createRequire } from 'node:module';
import { LiveLinkServer } from '../src/live-link/LiveLinkServer.js';
import {
  buildShadingUpdateMessage,
  validateShadingUpdateMessage,
  SHADING_UPDATE_TYPE,
  OBSERVATION_MODE_IDS,
} from '../src/live-link/shadingWire.js';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

function parseArgs(argv) {
  const out = {
    harness: false,
    url: 'ws://127.0.0.1:9487',
    host: '127.0.0.1',
    port: 9487,
    timeoutMs: 8000,
    maxMessages: 1,
    observationMode: 'Perspective4DTo3D',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--harness') out.harness = true;
    else if (a === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (a === '--host' && argv[i + 1]) out.host = argv[++i];
    else if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]);
    else if (a === '--timeout-ms' && argv[i + 1]) out.timeoutMs = Number(argv[++i]);
    else if (a === '--max-messages' && argv[i + 1]) out.maxMessages = Number(argv[++i]);
    else if (a === '--observation-mode' && argv[i + 1]) out.observationMode = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/validate-shading-ws.mjs [--harness] [--url ws://127.0.0.1:9487]`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(out.port) || out.port <= 0) throw new Error('invalid --port');
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  if (!Number.isFinite(out.maxMessages) || out.maxMessages <= 0) throw new Error('invalid --max-messages');
  return out;
}

/**
 * @param {string} url
 * @param {{ timeoutMs: number, maxMessages: number, expectedObservationModeId?: string }} opts
 */
function receiveShadingUpdates(url, opts) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    /** @type {object[]} */
    const accepted = [];
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      finish(new Error(`timeout after ${opts.timeoutMs}ms waiting for ${SHADING_UPDATE_TYPE}`));
    }, opts.timeoutMs);

    ws.on('error', (err) => finish(err));
    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        /* ignore */
      }
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg?.type !== SHADING_UPDATE_TYPE) return;
      const check = validateShadingUpdateMessage(msg);
      if (!check.ok) {
        finish(new Error(`invalid ${SHADING_UPDATE_TYPE}: ${check.errors.join('; ')}`));
        return;
      }
      if (
        opts.expectedObservationModeId &&
        String(msg.observationModeId).toLowerCase() !== opts.expectedObservationModeId.toLowerCase()
      ) {
        finish(
          new Error(
            `observationModeId mismatch: got ${msg.observationModeId}, expected ${opts.expectedObservationModeId}`,
          ),
        );
        return;
      }
      accepted.push(msg);
      if (accepted.length >= opts.maxMessages) finish(null, accepted);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const expectedId =
    args.observationMode === 'WSliceConstant'
      ? OBSERVATION_MODE_IDS.W_SLICE_CONSTANT
      : OBSERVATION_MODE_IDS.PERSPECTIVE_4D_TO_3D;

  /** @type {LiveLinkServer|null} */
  let server = null;
  try {
    if (args.harness) {
      server = new LiveLinkServer({ host: args.host, port: args.port, relayShadingUpdates: true });
      await server.start();
      console.log(`[validate-shading-ws] harness listening ws://${args.host}:${args.port}`);
    }

    const url = args.harness ? `ws://${args.host}:${args.port}` : args.url;
    const receivePromise = receiveShadingUpdates(url, {
      timeoutMs: args.timeoutMs,
      maxMessages: args.maxMessages,
      expectedObservationModeId: expectedId,
    });

    if (args.harness) {
      // Allow client to connect, then broadcast deterministic sample.
      await new Promise((r) => setTimeout(r, 150));
      const sample = buildShadingUpdateMessage({
        observationMode: args.observationMode,
        surfaceId: 'tesseract',
        frame: 0,
        materialId: 0,
        entries: [
          {
            Position4D: [1, 0, 0, 0],
            Normal4D: [0, 0, 0, 1],
            ViewDir4D: [0, 0, -1, 0],
            MaterialId: 0,
          },
          {
            Position4D: [-1, 0, 0, 0],
            Normal4D: [0, 0, 0, 1],
            ViewDir4D: [0, 0, -1, 0],
            MaterialId: 0,
          },
        ],
      });
      server.broadcastShadingUpdate(sample);
    }

    const messages = await receivePromise;
    console.log(
      `[validate-shading-ws] ok received=${messages.length} observationModeId=${messages[0].observationModeId} count=${messages[0].count}`,
    );
    process.exitCode = 0;
  } catch (err) {
    console.error(`[validate-shading-ws] FAIL: ${err?.message ?? err}`);
    process.exitCode = 1;
  } finally {
    if (server) {
      try {
        server.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

main();
