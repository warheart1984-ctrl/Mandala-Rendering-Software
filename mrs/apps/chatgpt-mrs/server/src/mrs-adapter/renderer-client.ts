import WebSocket from "ws";
import { resolveLiveLinkUrl } from "./ports.js";

export type LiveLinkResult =
  | { ok: true; message: unknown }
  | { ok: false; status: "not_connected" | "timeout" | "error"; detail: string };

/**
 * Thin WebSocket client → LiveLinkServer.
 * Default URL from ports.ts (9487 unless env override).
 * Does not start a LiveLink server — only connects if one is already running.
 */
export class RendererClient {
  constructor(private readonly url = resolveLiveLinkUrl()) {}

  getUrl(): string {
    return this.url;
  }

  async sendAndWait(
    payload: Record<string, unknown>,
    opts: { timeoutMs?: number; expectType?: string } = {}
  ): Promise<LiveLinkResult> {
    const timeoutMs = opts.timeoutMs ?? 3000;
    const expectType = opts.expectType;

    return new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        resolve({
          ok: false,
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const finish = (result: LiveLinkResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          status: "timeout",
          detail: `Timed out waiting for LiveLink at ${this.url}`,
        });
      }, timeoutMs);

      ws.on("open", () => {
        ws.send(JSON.stringify(payload));
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string };
          if (expectType && msg.type !== expectType) return;
          finish({ ok: true, message: msg });
        } catch (err) {
          finish({
            ok: false,
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      });

      ws.on("error", (err) => {
        finish({
          ok: false,
          status: "not_connected",
          detail: `LiveLink not reachable at ${this.url}: ${err.message}`,
        });
      });
    });
  }

  async setConfig(config: Record<string, unknown>): Promise<LiveLinkResult> {
    return this.sendAndWait(
      { type: "set_config", config },
      { timeoutMs: 1500 }
    );
  }

  async inspectScreen(args: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<LiveLinkResult> {
    return this.sendAndWait(
      {
        type: "inspect_screen",
        schemaVersion: "1.1",
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      },
      { timeoutMs: 4000, expectType: "inspect_result" }
    );
  }

  async inspectRay(args: {
    origin4d: [number, number, number, number];
    direction4d: [number, number, number, number];
  }): Promise<LiveLinkResult> {
    return this.sendAndWait(
      {
        type: "inspect_ray",
        schemaVersion: "1.1",
        origin: {
          x: args.origin4d[0],
          y: args.origin4d[1],
          z: args.origin4d[2],
          w: args.origin4d[3],
        },
        direction: {
          x: args.direction4d[0],
          y: args.direction4d[1],
          z: args.direction4d[2],
          w: args.direction4d[3],
        },
      },
      { timeoutMs: 4000, expectType: "inspect_result" }
    );
  }
}
