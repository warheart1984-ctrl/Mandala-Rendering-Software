import type { Body } from "./Body.js";

export interface BodyRegistry {
  resolve(id: string): Body | undefined;
  forEachBody(cb: (body: Body) => void): void;
  collectBodies(): Body[];
}

export class DefaultBodyRegistry implements BodyRegistry {
  private readonly map = new Map<string, Body>();

  register(body: Body): void {
    this.map.set(body.id, body);
  }

  unregister(id: string): void {
    this.map.delete(id);
  }

  resolve(id: string): Body | undefined {
    return this.map.get(id);
  }

  forEachBody(cb: (body: Body) => void): void {
    for (const body of this.map.values()) {
      cb(body);
    }
  }

  collectBodies(): Body[] {
    return Array.from(this.map.values());
  }
}
