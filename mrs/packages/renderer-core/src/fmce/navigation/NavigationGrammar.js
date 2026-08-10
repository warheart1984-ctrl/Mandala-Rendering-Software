/**
 * Navigation Grammar - Constitutional Navigation Grammar
 * Status: partial
 * Module: MODULE_10_NAVIGATION (Section 1)
 */

export class NavigationGrammar {
  constructor() {
    this.primitives = new GeometricPrimitives();
    this.zones = new ConstitutionalZones();
    this.boundaries = new DomainBoundaries();
    this.temporalPaths = new TemporalPaths();
    this.riskGradients = new RiskGradients();
    this.rules = new NavigationRules();
  }

  validate(input) {
    const primitives = this.primitives.parse(input.mandalaGeometry);
    const zones = this.zones.getZones();
    const boundaries = this.boundaries.getBoundaries();
    const temporalPaths = this.temporalPaths.getPaths(input.rt4dGeometry);
    const riskProfile = this.riskGradients.getGradients(input.mandalaGeometry);

    const routes = temporalPaths.map(path => ({
      ...path,
      zones,
      boundaries,
      riskProfile,
      valid: this.rules.check(path)
    }));

    const validRoutes = routes.filter(r => r.valid);

    return {
      navigationRoutes: validRoutes,
      grammarValidation: {
        primitivesValid: !!primitives,
        zonesDefined: Object.keys(zones).length > 0,
        boundariesDefined: Object.keys(boundaries).length > 0,
        temporalPathsValid: temporalPaths.length > 0,
        riskProfileDefined: Object.keys(riskProfile).length > 0,
        allRulesPassed: validRoutes.length === routes.length
      },
      intentId: input.intentId,
      worldId: input.worldId,
      timelineId: input.timelineId,
      timeSeconds: input.timeSeconds,
      parameters: input.parameters
    };
  }
}

export class GeometricPrimitives {
  parse(geometry) {
    const g = geometry;
    return {
      nodes: g.nodes || [],
      edges: g.edges || [],
      surfaces: g.surfaces || [],
      volumes: g.volumes || []
    };
  }
}

export class ConstitutionalZones {
  getZones() {
    return {
      authorized: ["render", "compute", "memory"],
      forbidden: ["kernel", "bootloader"],
      conditional: ["network", "storage"],
      supervised: ["admin", "config"]
    };
  }
}

export class DomainBoundaries {
  getBoundaries() {
    return {
      hard: ["kernel", "hardware"],
      soft: ["network", "filesystem"],
      transitional: ["cache", "buffer"]
    };
  }
}

export class TemporalPaths {
  getPaths(rt4d) {
    const r = rt4d;
    return r.navigationPaths || [{
      waypoints: [],
      constraints: [],
      riskZones: [],
      temporalAlignment: true
    }];
  }
}

export class RiskGradients {
  getGradients(mandala) {
    const m = mandala;
    const prob = m.perceptualLattice?.layers?.probability || {};
    return {
      uncertainty: prob.uncertainty || {},
      risk: prob.riskZones || [],
      likelihood: prob.likelihood || {}
    };
  }
}

export class NavigationRules {
  check(route) {
    const r = route;

    if (r.riskProfile?.risk?.some(z => z.type === "forbidden")) {
      return false;
    }

    if (!r.temporalAlignment) {
      return false;
    }

    if (r.boundaries?.hard?.some(b => r.waypoints?.some(w => w.domain === b))) {
      return false;
    }

    const riskScore = r.riskProfile?.risk?.reduce((sum, z) => sum + (z.severity === "high" ? 3 : z.severity === "medium" ? 2 : 1), 0) || 0;
    if (riskScore > 10) {
      return false;
    }

    return true;
  }
}