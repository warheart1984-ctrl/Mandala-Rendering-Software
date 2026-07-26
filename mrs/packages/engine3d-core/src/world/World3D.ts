import type { Body } from "./Body.js";
import type { WorldMesh } from "./WorldMesh.js";

export interface World3D {
  readonly bodies: Body[];
  readonly mesh: WorldMesh;
  addBody(body: Body): void;
  removeBody(id: string): void;
}

export class DefaultWorld3D implements World3D {
  readonly bodies: Body[] = [];

  constructor(public readonly mesh: WorldMesh) {}

  addBody(body: Body): void {
    if (this.bodies.some((b) => b.id === body.id)) {
      throw new Error(`World3D already has body id ${body.id}`);
    }
    this.bodies.push(body);
  }

  removeBody(id: string): void {
    const idx = this.bodies.findIndex((b) => b.id === id);
    if (idx >= 0) {
      this.bodies.splice(idx, 1);
    }
  }
}
