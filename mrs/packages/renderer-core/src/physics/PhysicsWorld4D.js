import { RigidBody4D } from "./RigidBody4D.js";
import { detectCollision } from "./Collider4D.js";

export class PhysicsWorld4D {
  constructor(options = {}) {
    this.bodies = [];
    this.gravity = options.gravity ?? { x: 0, y: 0, z: 0, w: 0 };
    this.damping = options.damping ?? 0.98;
    this.solverIterations = options.solverIterations ?? 3;
    this._collisionPairs = new Set();
  }

  createBody(options = {}) {
    const body = new RigidBody4D(options);
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) this.bodies.splice(idx, 1);
  }

  step(dt) {
    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this._applyForces(subDt);
      this._integrate(subDt);
      this._detectAndResolve();
    }
  }

  _applyForces(dt) {
    for (const body of this.bodies) {
      if (body.isStatic) continue;
      body.applyForce(this.gravity.x * body.mass, this.gravity.y * body.mass, this.gravity.z * body.mass, this.gravity.w * body.mass);
    }
  }

  _integrate(dt) {
    for (const body of this.bodies) {
      body.integrate(dt);
      if (!body.isStatic) {
        body.velocity.x *= this.damping;
        body.velocity.y *= this.damping;
        body.velocity.z *= this.damping;
        body.velocity.w *= this.damping;
      }
    }
  }

  _detectAndResolve() {
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const b = this.bodies[j];
        if (a.isStatic && b.isStatic) continue;

        const collision = detectCollision(a, b);
        if (collision) {
          this._resolveCollision(collision);
        }
      }
    }
  }

  _resolveCollision(col) {
    const { bodyA, bodyB, normal, penetration } = col;
    const totalMass = bodyA.mass + (bodyB.isStatic ? 0 : bodyB.mass);
    if (totalMass === 0) return;

    const ratioA = bodyB.isStatic ? 1 : bodyB.mass / totalMass;
    const ratioB = bodyA.isStatic ? 1 : bodyA.mass / totalMass;

    if (!bodyA.isStatic) {
      bodyA.position.x -= normal.x * penetration * ratioA;
      bodyA.position.y -= normal.y * penetration * ratioA;
      bodyA.position.z -= normal.z * penetration * ratioA;
      bodyA.position.w -= normal.w * penetration * ratioA;
    }
    if (!bodyB.isStatic) {
      bodyB.position.x += normal.x * penetration * ratioB;
      bodyB.position.y += normal.y * penetration * ratioB;
      bodyB.position.z += normal.z * penetration * ratioB;
      bodyB.position.w += normal.w * penetration * ratioB;
    }

    const relVel = {
      x: bodyA.velocity.x - (bodyB.isStatic ? 0 : bodyB.velocity.x),
      y: bodyA.velocity.y - (bodyB.isStatic ? 0 : bodyB.velocity.y),
      z: bodyA.velocity.z - (bodyB.isStatic ? 0 : bodyB.velocity.z),
      w: bodyA.velocity.w - (bodyB.isStatic ? 0 : bodyB.velocity.w),
    };
    const relVelDotN = relVel.x * normal.x + relVel.y * normal.y + relVel.z * normal.z + relVel.w * normal.w;

    if (relVelDotN <= 0) return;
    const e = Math.min(bodyA.restitution, bodyB.restitution);
    const j = -(1 + e) * relVelDotN / ((1 / bodyA.mass) + (bodyB.isStatic ? 0 : 1 / bodyB.mass));

    bodyA.velocity.x += j * normal.x / bodyA.mass;
    bodyA.velocity.y += j * normal.y / bodyA.mass;
    bodyA.velocity.z += j * normal.z / bodyA.mass;
    bodyA.velocity.w += j * normal.w / bodyA.mass;

    if (!bodyB.isStatic) {
      bodyB.velocity.x -= j * normal.x / bodyB.mass;
      bodyB.velocity.y -= j * normal.y / bodyB.mass;
      bodyB.velocity.z -= j * normal.z / bodyB.mass;
      bodyB.velocity.w -= j * normal.w / bodyB.mass;
    }
  }

  clear() {
    this.bodies = [];
  }
}
