import { FourVector } from "../tensor/TensorTypes.js";
import { MetricTensor } from "../arena/MetricTensor.js";
import { ChristoffelSymbols } from "../arena/Christoffel.js";
import { CertifiedTensor, certifyTensor, AUTHORITIES } from "../governance/CertifiedTensor.js";

export class FourVelocity extends FourVector {
  constructor(vector, metric) {
    if (!(vector instanceof FourVector)) {
      throw new Error("FourVelocity requires a FourVector");
    }
    // Call parent constructor with vector components
    super(vector.x, vector.y, vector.z, vector.w, metric);
    this._normalized = false;
  }

  normalize(c = 1) {
    const norm2 = this.metric.norm2(this);
    const expected = -c * c;
    if (Math.abs(norm2 - expected) > 1e-10) {
      const factor = Math.sqrt(Math.abs(expected / norm2));
      // Create new normalized vector and copy components
      const normalized = new FourVector(
        this.x * factor,
        this.y * factor,
        this.z * factor,
        this.w * factor,
        this.metric
      );
      this.x = normalized.x;
      this.y = normalized.y;
      this.z = normalized.z;
      this.w = normalized.w;
    }
    this._normalized = true;
    return this;
  }

  isNormalized(c = 1) {
    const norm2 = this.metric.norm2(this);
    return Math.abs(norm2 + c * c) < 1e-10;
  }

  static fromPositionVelocity(ct, x, y, z, vx, vy, vz, metric, c = 1) {
    const gamma = 1 / Math.sqrt(1 - (vx * vx + vy * vy + vz * vz) / (c * c));
    const u = new FourVector(
      gamma * c,
      gamma * vx,
      gamma * vy,
      gamma * vz,
      metric
    );
    return new FourVelocity(u, metric).normalize(c);
  }

  static fromProperVelocity(ct, x, y, z, ux, uy, uz, uw, metric) {
    const u = new FourVector(ux, uy, uz, uw, metric);
    return new FourVelocity(u, metric);
  }
}

export class FourAcceleration {
  constructor(vector, metric) {
    if (!(vector instanceof FourVector)) {
      throw new Error("FourAcceleration requires a FourVector");
    }
    this.vector = vector;
    this.metric = metric;
  }

  get x() { return this.vector.x; }
  get y() { return this.vector.y; }
  get z() { return this.vector.z; }
  get w() { return this.vector.w; }

  static fromGeodesic(christoffel, fourVelocity) {
    const accel = christoffel.geodesicAcceleration(fourVelocity);
    return new FourAcceleration(
      new FourVector(accel.x, accel.y, accel.z, accel.w, fourVelocity.metric),
      fourVelocity.metric
    );
  }

  static fromForce(fourForce, mass) {
    const a = new FourVector(
      fourForce.x / mass,
      fourForce.y / mass,
      fourForce.z / mass,
      fourForce.w / mass,
      fourForce.metric
    );
    return new FourAcceleration(a, fourForce.metric);
  }

  orthogonalityCheck(fourVelocity) {
    return this.metric.innerProduct(this.vector, fourVelocity);
  }

  toArray() {
    return [this.x, this.y, this.z, this.w];
  }

  toJSON() {
    return {
      rank: 1,
      components: [this.x, this.y, this.z, this.w],
    };
  }
}

export class FourMomentum {
  constructor(vector, metric, mass) {
    if (!(vector instanceof FourVector)) {
      throw new Error("FourMomentum requires a FourVector");
    }
    this.vector = vector;
    this.metric = metric;
    this.mass = mass;
  }

  get x() { return this.vector.x; }
  get y() { return this.vector.y; }
  get z() { return this.vector.z; }
  get w() { return this.vector.w; }
  get E() { return this.vector.w; }
  get px() { return this.vector.x; }
  get py() { return this.vector.y; }
  get pz() { return this.vector.z; }

  static fromVelocity(mass, fourVelocity) {
    const p = new FourVector(
      mass * fourVelocity.x,
      mass * fourVelocity.y,
      mass * fourVelocity.z,
      mass * fourVelocity.w,
      fourVelocity.metric
    );
    return new FourMomentum(p, fourVelocity.metric, mass);
  }

  invariantMass() {
    const norm2 = this.metric.norm2(this.vector);
    return Math.sqrt(Math.abs(norm2));
  }

  invariantCheck() {
    const norm2 = this.metric.norm2(this.vector);
    const expected = -this.mass * this.mass;
    return { norm2, expected, diff: Math.abs(norm2 - expected) };
  }

  toArray() {
    return [this.x, this.y, this.z, this.w];
  }

  toJSON() {
    return {
      rank: 1,
      components: this.toArray(),
      mass: this.mass,
      invariantMass: this.invariantMass(),
    };
  }
}

export class FourForce {
  constructor(vector, metric) {
    if (!(vector instanceof FourVector)) {
      throw new Error("FourForce requires a FourVector");
    }
    this.vector = vector;
    this.metric = metric;
  }

  static fromMomentumDerivative(dp_dtau, metric) {
    return new FourForce(dp_dtau, metric);
  }

  toJSON() {
    return {
      rank: 1,
      components: [this.x, this.y, this.z, this.w],
    };
  }
}

export class GeodesicSolver {
  constructor(metric, christoffel, c = 1) {
    this.metric = metric;
    this.christoffel = christoffel;
    this.c = c;
  }

  step(x, u, dtau) {
    if (!(x instanceof FourVector) || !(u instanceof FourVelocity)) {
      throw new Error("Geodesic step requires FourVector position and FourVelocity");
    }

    const a = this.christoffel.geodesicAcceleration(u);

    const uNext = new FourVector(
      u.x + a.x * dtau,
      u.y + a.y * dtau,
      u.z + a.z * dtau,
      u.w + a.w * dtau,
      this.metric
    );
    const fourVelocityNext = new FourVelocity(uNext, this.metric).normalize(this.c);

    const xNext = new FourVector(
      x.x + fourVelocityNext.x * dtau,
      x.y + fourVelocityNext.y * dtau,
      x.z + fourVelocityNext.z * dtau,
      x.w + fourVelocityNext.w * dtau,
      this.metric
    );

    return {
      position: xNext,
      velocity: fourVelocityNext,
      acceleration: new FourAcceleration(
        new FourVector(a.x, a.y, a.z, a.w, this.metric),
        this.metric
      ),
    };
  }

  integrate(x0, u0, dtau, steps) {
    let x = x0;
    let u = u0;
    const trajectory = [{ position: x, velocity: u }];

    for (let i = 0; i < steps; i++) {
      const result = this.step(x, u, dtau);
      x = result.position;
      u = result.velocity;
      trajectory.push({ position: x, velocity: u });
    }

    return trajectory;
  }

  computeGeodesicResidual(x, u) {
    const a = this.christoffel.geodesicAcceleration(u.toVector());
    return {
      x: a.x,
      y: a.y,
      z: a.z,
      w: a.w,
    };
  }
}

export function createGeodesicSolver(metric, christoffel, c = 1) {
  return new GeodesicSolver(metric, christoffel, c);
}

export class KinematicsEngine {
  constructor(metric, christoffel, c = 1) {
    this.metric = metric;
    this.christoffel = christoffel;
    this.c = c;
    this.geodesicSolver = new GeodesicSolver(metric, christoffel, c);
  }

  createFourVelocity(vector) {
    return new FourVelocity(vector, this.metric);
  }

  createFourAcceleration(vector) {
    return new FourAcceleration(vector, this.metric);
  }

  createFourMomentum(vector, mass) {
    return new FourMomentum(vector, this.metric, mass);
  }

  createFourForce(vector) {
    return new FourForce(vector, this.metric);
  }

  velocityFromPositionVelocity(ct, x, y, z, vx, vy, vz) {
    return FourVelocity.fromPositionVelocity(ct, x, y, z, vx, vy, vz, this.metric, this.c);
  }

  momentumFromVelocity(mass, fourVelocity) {
    return FourMomentum.fromVelocity(mass, fourVelocity);
  }

  accelerationFromGeodesic(fourVelocity) {
    return FourAcceleration.fromGeodesic(this.christoffel, fourVelocity);
  }

  accelerationFromForce(fourForce, mass) {
    return FourAcceleration.fromForce(fourForce, mass);
  }

  geodesicStep(x, u, dtau) {
    return this.geodesicSolver.step(x, u, dtau);
  }

  integrateGeodesic(x0, u0, dtau, steps) {
    return this.geodesicSolver.integrate(x0, u0, dtau, steps);
  }

  certifyFourVelocity(u, c = 1) {
    const normalized = new FourVelocity(u, this.metric).normalize(c);
    const norm2 = this.metric.norm2(normalized);
    return certifyTensor(
      normalized,
      AUTHORITIES.KINEMATICS_ENGINE,
      [
        { name: "normalization", passed: normalized.isNormalized(c), value: norm2, diff: Math.abs(norm2 + c * c), residual: Math.abs(norm2 + c * c), tolerance: 1e-9 },
        { name: "timelike", passed: this.metric.isTimelike(normalized) },
      ],
      [{ type: "four_velocity", components: normalized.toArray() }]
    );
  }

  certifyFourMomentum(p, mass) {
    const inv = p.invariantCheck();
    return certifyTensor(
      p,
      AUTHORITIES.KINEMATICS_ENGINE,
      [
        { name: "momentum_invariant", passed: inv.diff < 1e-10, diff: inv.diff, residual: inv.diff, tolerance: 1e-10 },
        { name: "mass_consistency", passed: Math.abs(p.mass - mass) < 1e-10, diff: Math.abs(p.mass - mass) },
      ],
      [{ type: "four_momentum", components: p.toArray(), mass }]
    );
  }

  toJSON() {
    return {
      metricHash: this.metric.hash(),
      christoffelNonZero: this.christoffel.gamma.filter(g => Math.abs(g) > 1e-15).length,
      c: this.c,
    };
  }
}

export function createKinematicsEngine(metric, christoffel, c = 1) {
  return new KinematicsEngine(metric, christoffel, c);
}