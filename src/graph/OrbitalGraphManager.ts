import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphManager, ForceGraphConfig } from './ForceGraphManager';
import { ForceGraphNode } from './ForceGraphNode';
import { PinPoint } from './PinPoint';
import { BlockerNode } from './BlockerNode';
import { EdgeConstraint, EdgeType } from './EdgeConstraint';
import type { ForceSimulationConfig } from './ForceSimulation';
import type { IGraphPhysics } from './IGraphPhysics';

/**
 * OrbitalGraphManager — object-based physics engine (2026-07).
 *
 * Design (per Alex): the world consists of
 *  - FIXED STARS: pins and blockers. They never move within a step and
 *    emit anti-gravity (repulsion) — e.g. route blockers keeping the
 *    route corridor free.
 *  - ORBITAL BODIES: nodes bound to a pin by an edge. Their edge length
 *    is a CONSTRUCTION PARAMETER, not a simulated quantity: the body's
 *    only degree of freedom is its angle θ around the pin. Its position
 *    is always computed as `pin + L·(cosθ, sinθ)`, so the rod cannot
 *    stretch — not because a constraint corrects it, but because the
 *    parametrization has no radial dimension at all. Forces act on the
 *    body, but only their tangential component does anything: it
 *    accelerates the angular velocity ω.
 *  - FREE BODIES: nodes without an edge (screen points). Classic damped
 *    point-mass integration.
 *
 * External position writes (dragging, initial seeding, moving pins from
 *  snap-to-path) are absorbed naturally: θ is re-derived from the current
 *  position at the start of every step, then the exact-length position is
 *  written back. A drag therefore turns into pure rotation and a moving
 *  anchor carries its body along at exact distance.
 *
 * Rendering: visualPosition is synced immediately (no smoothing lerp) —
 * the sub-stepped, damped simulation is the motion model; an extra lerp
 * would reintroduce radial error on arcs.
 *
 * Structure management and rendering are delegated to the shared graph
 * container (nodes/pins/edges/blockers + views) so hit-testing and all
 * existing views work unchanged. Only `update()` — the physics — is new.
 */
export class OrbitalGraphManager<T = any> extends ForceGraphManager<T> implements IGraphPhysics<T> {
  private orbitalConfig = {
    repulsionStrength: 100,
    minRepulsionDistance: 1,
    maxForce: 1000,
    /** Per-substep velocity damping (matches legacy feel). */
    damping: 0.9,
    /** Angular velocity below this (rad/s) snaps to 0 — settle helper. */
    omegaSnap: 0.0005,
    iterations: 1,
  };

  /** Angular velocity per orbital node id (rad/s). */
  private omega = new Map<string, number>();

  constructor(config: ForceGraphConfig<T> = {}) {
    super(config);
    if (config.simulation) this.applySimConfig(config.simulation);
  }

  private applySimConfig(c: Partial<ForceSimulationConfig>): void {
    if (c.repulsionStrength !== undefined) this.orbitalConfig.repulsionStrength = c.repulsionStrength;
    if (c.minRepulsionDistance !== undefined) this.orbitalConfig.minRepulsionDistance = c.minRepulsionDistance;
    if (c.maxForce !== undefined) this.orbitalConfig.maxForce = c.maxForce;
    if ((c as { iterations?: number }).iterations !== undefined) this.orbitalConfig.iterations = (c as { iterations?: number }).iterations!;
  }

  public override setSimulationConfig(config: Partial<ForceSimulationConfig>): void {
    // Do NOT forward to the legacy simulation — it never runs here.
    this.applySimConfig(config);
  }

  public override removeNode(id: string): boolean {
    this.omega.delete(id);
    return super.removeNode(id);
  }

  public override clear(): void {
    this.omega.clear();
    super.clear();
  }

  // ── Physics ─────────────────────────────────────────────────

  public override update(deltaTime: number): void {
    const dt = deltaTime / this.orbitalConfig.iterations;
    for (let i = 0; i < this.orbitalConfig.iterations; i++) {
      this.stepOnce(dt);
    }
  }

  private stepOnce(dt: number): void {
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    const blockers = this.getAllBlockers();
    const { repulsionStrength, minRepulsionDistance, maxForce, damping, omegaSnap } = this.orbitalConfig;

    // Edge lookup: one rod per node (last edge wins if multiple).
    const edgeByNode = new Map<ForceGraphNode<T>, EdgeConstraint<T>>();
    for (const e of edges) edgeByNode.set(e.node, e);

    // 0. Re-derive positions from the rod parametrization BEFORE forces:
    //    absorbs external writes (drag, seeding) and moved anchors, so all
    //    force calculations already see exact-length geometry.
    for (const e of edges) {
      this.writeRodPosition(e);
    }

    // 1. Reset forces
    for (const n of nodes) n.resetForces();

    // 2. Node↔node anti-gravity (fixed nodes push but don't move)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.isFixed && b.isFixed) continue;
        const f = this.repulsion(a.position, b.position, a.radius, b.radius, repulsionStrength, minRepulsionDistance, maxForce);
        if (!a.isFixed) a.applyForce(f);
        if (!b.isFixed) b.applyForce(new Vector2(-f.x, -f.y));
      }
    }

    // 3. Fixed-star anti-gravity (blockers → nodes)
    for (const blocker of blockers) {
      for (const n of nodes) {
        if (n.isFixed) continue;
        const f = this.repulsion(n.position, blocker.position, n.radius, blocker.radius, blocker.repulsionStrength * 100, minRepulsionDistance, maxForce);
        n.applyForce(f);
      }
    }

    // 4. Integrate
    for (const n of nodes) {
      const edge = edgeByNode.get(n);

      if (edge) {
        // ORBITAL BODY — single degree of freedom: angle around the pin.
        if (n.isFixed) {
          // Dragged/pinned: position was renormalized in step 0; freeze ω.
          this.omega.set(this.nodeKey(n), 0);
          continue;
        }
        const pin = edge.pin.getPosition();
        const dx = n.position.x - pin.x;
        const dy = n.position.y - pin.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || edge.length || 1;
        // Tangential unit vector at current angle
        const tx = -dy / dist;
        const ty = dx / dist;
        // Tangential force → angular acceleration: α = F_t / (m·L)
        const ft = n.force.x * tx + n.force.y * ty;
        const L = Math.max(edge.length, 0.001);
        const alpha = ft / (n.mass * L);

        const key = this.nodeKey(n);
        let w = (this.omega.get(key) ?? 0) + alpha * dt;
        w *= damping;
        if (Math.abs(w) < omegaSnap) w = 0;
        this.omega.set(key, w);

        const theta = Math.atan2(dy, dx) + w * dt;
        n.position.x = pin.x + Math.cos(theta) * L;
        n.position.y = pin.y + Math.sin(theta) * L;
        // Keep node.velocity coherent for consumers that read it (tangential)
        n.velocity.x = -Math.sin(theta) * w * L;
        n.velocity.y = Math.cos(theta) * w * L;
        n.visualPosition.setImmediate(new Vector2(n.position.x, n.position.y));
      } else {
        // FREE BODY — classic damped point mass (screen points etc.)
        if (n.isFixed) continue;
        const ax = n.force.x / n.mass;
        const ay = n.force.y / n.mass;
        n.velocity.x = (n.velocity.x + ax * dt) * damping;
        n.velocity.y = (n.velocity.y + ay * dt) * damping;
        if (n.velocity.x * n.velocity.x + n.velocity.y * n.velocity.y < 0.0001) {
          n.velocity.x = 0;
          n.velocity.y = 0;
        }
        n.position.x += n.velocity.x * dt;
        n.position.y += n.velocity.y * dt;
        n.visualPosition.setImmediate(new Vector2(n.position.x, n.position.y));
      }
    }
  }

  /**
   * Anti-gravity between two bodies — identical formula to the legacy
   * ForceSimulation (surface-distance based, overlap boost, force clamp)
   * so existing per-project tuning (repulsionStrength sliders/config)
   * behaves the same under both engines.
   */
  private repulsion(
    posA: Vector2,
    posB: Vector2,
    radiusA: number,
    radiusB: number,
    strength: number,
    minDistance: number,
    maxForce: number,
  ): Vector2 {
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    const centerDistance = Math.sqrt(dx * dx + dy * dy);

    if (centerDistance < 0.001) {
      const a = Math.random() * Math.PI * 2;
      return new Vector2(Math.cos(a) * maxForce, Math.sin(a) * maxForce);
    }

    const surfaceDistance = centerDistance - (radiusA + radiusB);
    let magnitude: number;
    if (surfaceDistance < 0) {
      magnitude = strength * (1 + Math.abs(surfaceDistance) / 10);
    } else {
      magnitude = strength / Math.max(surfaceDistance, minDistance);
    }
    const clamped = Math.min(magnitude, maxForce);
    const inv = clamped / centerDistance;
    return new Vector2(dx * inv, dy * inv);
  }

  /** Write the exact rod position for an edge-bound node (keeps angle). */
  private writeRodPosition(e: EdgeConstraint<T>): void {
    const pin = e.pin.getPosition();
    const n = e.node;
    const dx = n.position.x - pin.x;
    const dy = n.position.y - pin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const L = Math.max(e.length, 0.001);
    if (dist < 0.001) {
      // Degenerate: place at rest angle 0
      n.position.x = pin.x + L;
      n.position.y = pin.y;
    } else {
      const s = L / dist;
      n.position.x = pin.x + dx * s;
      n.position.y = pin.y + dy * s;
    }
    n.visualPosition.setImmediate(new Vector2(n.position.x, n.position.y));
  }

  private nodeKey(n: ForceGraphNode<T>): string {
    return n.id;
  }

  // ── Settlement ──────────────────────────────────────────────

  public override getKineticEnergy(): number {
    let e = 0;
    const edges = this.getAllEdges();
    const bound = new Set(edges.map((x) => x.node));
    for (const edge of edges) {
      const w = this.omega.get(this.nodeKey(edge.node)) ?? 0;
      const v = Math.abs(w) * edge.length;
      e += 0.5 * edge.node.mass * v * v;
    }
    for (const n of this.getAllNodes()) {
      if (bound.has(n) || n.isFixed) continue;
      e += 0.5 * n.mass * (n.velocity.x * n.velocity.x + n.velocity.y * n.velocity.y);
    }
    return e;
  }

  public override hasSettled(threshold: number = 0.1): boolean {
    return this.getKineticEnergy() < threshold;
  }
}

export { EdgeType };
