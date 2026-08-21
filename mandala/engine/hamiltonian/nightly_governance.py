#!/usr/bin/env python3
"""CPU Jacobi nightly pass for H_gov (governance cost, not lattice physics).

Status: working for tiny in-memory graphs. Computational analogue — not a claim
that vacuum physics is decision-making. Do not invent AAIS-UL v20.

W_gov already contains 1/2, so ∂W/∂r_i = w_r (r_i − r_j).
H_gov sums each unordered pair ⟨i,j⟩ once.
Jurisdiction coordinate is `jv` (never the neighbor index).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path
from struct import pack

ETA = 0.01
ALPHA_R = ALPHA_A = ALPHA_E = ALPHA_C = ALPHA_T = ALPHA_JV = 1.0
W_R = W_A = W_E = W_C = W_T = W_JV = 1.0

ALPHA = {
    "r": ALPHA_R,
    "a": ALPHA_A,
    "e": ALPHA_E,
    "c": ALPHA_C,
    "t": ALPHA_T,
    "j": ALPHA_JV,
}
W = {
    "r": W_R,
    "a": W_A,
    "e": W_E,
    "c": W_C,
    "t": W_T,
    "j": W_JV,
}

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT_DIR = REPO / "output" / "mandala-hamiltonian"


def clamp01(x):
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)


def _alpha_w(alpha=None, w=None):
    a = dict(ALPHA if alpha is None else alpha)
    ww = dict(W if w is None else w)
    for src, dst in (
        ("risk", "r"),
        ("ambiguity", "a"),
        ("evidence", "e"),
        ("compliance", "c"),
        ("trust", "t"),
        ("jurisdiction", "j"),
    ):
        if src in a and "r" not in a:
            pass
        if src in a and dst not in a:
            a[dst] = a[src]
        if src in ww and dst not in ww:
            ww[dst] = ww[src]
    return a, ww


def _nbrs(neighbors, i):
    if isinstance(neighbors, dict):
        return neighbors.get(i, [])
    try:
        return neighbors[i]
    except (KeyError, IndexError, TypeError):
        return []


def _coupling(J, i, nbr, default=0.0):
    if J is None:
        return default
    if isinstance(J, dict):
        row = J.get(i)
        if isinstance(row, dict):
            if nbr in row:
                return float(row[nbr])
            if str(nbr) in row:
                return float(row[str(nbr)])
        row2 = J.get(str(i))
        if isinstance(row2, dict):
            if nbr in row2:
                return float(row2[nbr])
            if str(nbr) in row2:
                return float(row2[str(nbr)])
        return default
    try:
        return float(J[i][nbr])
    except (KeyError, IndexError, TypeError):
        return default


def _commit(dst, new_map):
    if isinstance(dst, dict):
        dst.update(new_map)
        return
    for i, v in new_map.items():
        dst[i] = v


def site_u(ri, ai, ei, ci, ti, ji, alpha=None):
    a, _ = _alpha_w(alpha, None)
    return (
        a["r"] * ri * ri
        + a["a"] * ai * ai
        + a["c"] * (1.0 - ci) ** 2
        + a["e"] * (1.0 - ei) ** 2
        + a["t"] * (1.0 - ti) ** 2
        + a["j"] * (1.0 - ji) ** 2
    )


def w_gov_pair(ri, ai, ei, ci, ti, ji, rj, aj, ej, cj, tj, jj, w=None):
    """W_gov = (1/2) Σ w_k (Δk)²."""
    _, ww = _alpha_w(None, w)
    return 0.5 * (
        ww["r"] * (ri - rj) ** 2
        + ww["a"] * (ai - aj) ** 2
        + ww["e"] * (ei - ej) ** 2
        + ww["c"] * (ci - cj) ** 2
        + ww["t"] * (ti - tj) ** 2
        + ww["j"] * (ji - jj) ** 2
    )


def h_gov(r, a, e, c, t, jv, neighbors, J, nodes=None, alpha=None, w=None):
    """H_gov = Σ U + Σ_⟨i,j⟩ J_ij W. Each unordered pair once."""
    keys = list(nodes if nodes is not None else (r.keys() if isinstance(r, dict) else range(len(r))))
    H = 0.0
    for i in keys:
        H += site_u(r[i], a[i], e[i], c[i], t[i], jv[i], alpha)
    seen = set()
    for i in keys:
        for nbr in _nbrs(neighbors, i):
            pair = (i, nbr) if str(i) < str(nbr) else (nbr, i)
            if pair[0] == pair[1] or pair in seen:
                continue
            seen.add(pair)
            Jij = _coupling(J, i, nbr)
            if Jij == 0.0:
                Jij = _coupling(J, nbr, i)
            H += Jij * w_gov_pair(
                r[i], a[i], e[i], c[i], t[i], jv[i],
                r[nbr], a[nbr], e[nbr], c[nbr], t[nbr], jv[nbr],
                w,
            )
    return H


def local_h_i(i, r, a, e, c, t, jv, neighbors, J, alpha=None, w=None):
    """H_i = U_gov(σ_i) + Σ_{j∈N(i)} J_ij W_gov. W contains 1/2."""
    h = site_u(r[i], a[i], e[i], c[i], t[i], jv[i], alpha)
    for nbr in _nbrs(neighbors, i):
        Jij = _coupling(J, i, nbr)
        if Jij == 0.0:
            Jij = _coupling(J, nbr, i)
        h += Jij * w_gov_pair(
            r[i], a[i], e[i], c[i], t[i], jv[i],
            r[nbr], a[nbr], e[nbr], c[nbr], t[nbr], jv[nbr],
            w,
        )
    return h


def nightly_governance_relaxation(r, a, e, c, t, jv, neighbors, J, governance_nodes, **kwargs):
    """Jacobi one-pass. Mutates r,a,e,c,t,jv after computing new_* from CURRENT state.

    Optional kwargs: eta (default 0.01), alpha, w. All α_*=1, w_*=1 by default.
    """
    eta = float(kwargs.get("eta", ETA))
    alpha, ww = _alpha_w(kwargs.get("alpha"), kwargs.get("w"))
    ar, aa, ae, ac, at, aj = alpha["r"], alpha["a"], alpha["e"], alpha["c"], alpha["t"], alpha["j"]
    wr, wa, we, wc, wt, wj = ww["r"], ww["a"], ww["e"], ww["c"], ww["t"], ww["j"]

    new_r, new_a, new_e, new_c, new_t, new_jv = {}, {}, {}, {}, {}, {}
    for i in governance_nodes:
        ri, ai, ei, ci, ti, ji = r[i], a[i], e[i], c[i], t[i], jv[i]
        dH_dr = 2.0 * ar * ri
        dH_da = 2.0 * aa * ai
        dH_de = 2.0 * ae * (ei - 1.0)
        dH_dc = 2.0 * ac * (ci - 1.0)
        dH_dt = 2.0 * at * (ti - 1.0)
        dH_dj = 2.0 * aj * (ji - 1.0)
        for nbr in _nbrs(neighbors, i):
            Jij = _coupling(J, i, nbr)
            dH_dr += Jij * wr * (ri - r[nbr])
            dH_da += Jij * wa * (ai - a[nbr])
            dH_de += Jij * we * (ei - e[nbr])
            dH_dc += Jij * wc * (ci - c[nbr])
            dH_dt += Jij * wt * (ti - t[nbr])
            dH_dj += Jij * wj * (ji - jv[nbr])
        new_r[i] = clamp01(ri - eta * dH_dr)
        new_a[i] = clamp01(ai - eta * dH_da)
        new_e[i] = clamp01(ei - eta * dH_de)
        new_c[i] = clamp01(ci - eta * dH_dc)
        new_t[i] = clamp01(ti - eta * dH_dt)
        new_jv[i] = clamp01(ji - eta * dH_dj)

    _commit(r, new_r)
    _commit(a, new_a)
    _commit(e, new_e)
    _commit(c, new_c)
    _commit(t, new_t)
    _commit(jv, new_jv)


def detect_regime_change(series, abs_drop=0.25, rel_drop=0.1):
    """Flag large |ΔH| / relative drops. Analogue of regime change, not a proven critical point."""
    flagged = []
    for i in range(1, len(series)):
        prev = series[i - 1]["H"]
        cur = series[i]["H"]
        dH = cur - prev
        rel = dH / abs(prev) if prev != 0 else 0.0
        if abs(dH) >= abs_drop or rel <= -rel_drop:
            flagged.append({
                "t": series[i].get("t", i),
                "H_prev": prev,
                "H": cur,
                "dH": dH,
                "rel": rel,
            })
    return {
        "status": "partial",
        "flagged": flagged,
        "flaggedDrop": len(flagged) > 0,
        "analogue": "regime-change analogue on H_gov(t), not a proven critical exponent",
    }


def rank_failures(r, a, e, c, t, jv, neighbors, J, nodes, k=10, alpha=None, w=None):
    rows = []
    for i in nodes:
        Hi = local_h_i(i, r, a, e, c, t, jv, neighbors, J, alpha, w)
        rows.append({"id": i, "Hi": Hi, "local_cost": Hi})
    max_h = max((row["Hi"] for row in rows), default=1.0) or 1.0
    for row in rows:
        row["normalized"] = row["Hi"] / max_h
    rows.sort(key=lambda x: x["Hi"], reverse=True)
    return {"status": "partial", "top": rows[:k], "all": rows}


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return pack(">I", len(data)) + tag + data + pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png_rgb(path, width, height, rgb: bytes):
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        raw.extend(rgb[y * stride : (y + 1) * stride])
    ihdr = pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _png_chunk(b"IEND", b"")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(png)


def write_node_cost_heatmap(path, ids, costs, cell=28):
    n = max(len(ids), 1)
    cols = max(1, int(n ** 0.5 + 0.999))
    rows = (n + cols - 1) // cols
    width = cols * cell
    height = rows * cell
    rgb = bytearray(width * height * 3)
    max_c = max(costs) if costs else 1.0
    max_c = max_c if max_c > 0 else 1.0
    for i, cost in enumerate(costs):
        t = cost / max_c
        r = int(20 + 220 * t)
        g = int(40 + 40 * (1 - t))
        b = int(180 * (1 - t) + 30 * t)
        cx = (i % cols) * cell
        cy = (i // cols) * cell
        for y in range(cy, cy + cell):
            for x in range(cx, cx + cell):
                o = (y * width + x) * 3
                rgb[o] = r
                rgb[o + 1] = g
                rgb[o + 2] = b
    write_png_rgb(path, width, height, bytes(rgb))
    return str(path)


def demo_payload():
    """Tiny demo (not the JS chamber demo). Includes a hot vendor decision."""
    nodes = ["approve-vendor-x", "alice", "procurement-policy", "onboard-intent", "contract-scan", "bob"]
    r = {"approve-vendor-x": 0.92, "alice": 0.12, "procurement-policy": 0.08, "onboard-intent": 0.35, "contract-scan": 0.2, "bob": 0.15}
    a = {"approve-vendor-x": 0.80, "alice": 0.10, "procurement-policy": 0.05, "onboard-intent": 0.40, "contract-scan": 0.25, "bob": 0.18}
    e = {"approve-vendor-x": 0.15, "alice": 0.85, "procurement-policy": 0.90, "onboard-intent": 0.55, "contract-scan": 0.70, "bob": 0.80}
    c = {"approve-vendor-x": 0.20, "alice": 0.88, "procurement-policy": 0.95, "onboard-intent": 0.60, "contract-scan": 0.75, "bob": 0.82}
    t = {"approve-vendor-x": 0.18, "alice": 0.90, "procurement-policy": 0.92, "onboard-intent": 0.50, "contract-scan": 0.65, "bob": 0.70}
    jv = {"approve-vendor-x": 0.25, "alice": 0.85, "procurement-policy": 0.88, "onboard-intent": 0.45, "contract-scan": 0.60, "bob": 0.75}
    neighbors = {
        "approve-vendor-x": ["alice", "procurement-policy", "onboard-intent"],
        "alice": ["approve-vendor-x", "onboard-intent", "bob"],
        "procurement-policy": ["approve-vendor-x", "onboard-intent"],
        "onboard-intent": ["approve-vendor-x", "alice", "procurement-policy", "contract-scan"],
        "contract-scan": ["onboard-intent"],
        "bob": ["alice"],
    }
    J = {i: {nbr: 1.0 for nbr in neighbors[i]} for i in nodes}
    J["approve-vendor-x"]["alice"] = 1.2
    J["alice"]["approve-vendor-x"] = 1.2
    J["approve-vendor-x"]["procurement-policy"] = 1.4
    J["procurement-policy"]["approve-vendor-x"] = 1.4
    return nodes, r, a, e, c, t, jv, neighbors, J


def payload_from_fixture(data):
    nodes = data["nodes"]
    r = dict(data["r"])
    a = dict(data["a"])
    e = dict(data["e"])
    c = dict(data["c"])
    t = dict(data["t"])
    jv = dict(data.get("j") or data.get("jv") or data.get("jurisdiction"))
    neighbors = data["neighbors"]
    J = data["J"]
    eta = float(data.get("eta", ETA))
    return nodes, r, a, e, c, t, jv, neighbors, J, eta


def sigma_dump(nodes, r, a, e, c, t, jv):
    out = {}
    for i in nodes:
        out[i] = {"r": r[i], "a": a[i], "e": e[i], "c": c[i], "t": t[i], "j": jv[i]}
    return out


def run_once(nodes, r, a, e, c, t, jv, neighbors, J, eta=ETA, alpha=None, w=None):
    H_before = h_gov(r, a, e, c, t, jv, neighbors, J, nodes, alpha, w)
    nightly_governance_relaxation(r, a, e, c, t, jv, neighbors, J, nodes, eta=eta, alpha=alpha, w=w)
    H_after = h_gov(r, a, e, c, t, jv, neighbors, J, nodes, alpha, w)
    return H_before, H_after


def main(argv=None):
    parser = argparse.ArgumentParser(description="H_gov nightly Jacobi pass (CPU analogue)")
    parser.add_argument("--fixture", help="JSON payload (r,a,e,c,t,j,neighbors,J)")
    parser.add_argument("--dump-json", action="store_true", help="print sigma + H as JSON")
    parser.add_argument("--eta", type=float, default=None)
    args = parser.parse_args(argv)

    if args.fixture:
        data = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
        nodes, r, a, e, c, t, jv, neighbors, J, eta_f = payload_from_fixture(data)
        eta = args.eta if args.eta is not None else eta_f
    else:
        nodes, r, a, e, c, t, jv, neighbors, J = demo_payload()
        eta = args.eta if args.eta is not None else ETA

    H_before, H_after = run_once(nodes, r, a, e, c, t, jv, neighbors, J, eta=eta)
    receipt = {
        "type": "hgov-nightly-receipt",
        "jacobi": True,
        "eta": eta,
        "nodesTouched": len(nodes),
        "H_before": H_before,
        "H_after": H_after,
        "deltaH": H_after - H_before,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "note": "Gradient descent on governance cost (computational analogue).",
        "sigma": sigma_dump(nodes, r, a, e, c, t, jv),
        "gpu": "declared",
    }
    if args.dump_json:
        json.dump(receipt, sys.stdout)
        sys.stdout.write("\n")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    receipt_path = OUT_DIR / "nightly-python-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    costs = [local_h_i(i, r, a, e, c, t, jv, neighbors, J) for i in nodes]
    heat_path = OUT_DIR / "hgov-node-cost.png"
    write_node_cost_heatmap(heat_path, nodes, costs)
    series = [{"t": 0, "H": H_before}, {"t": 1, "H": H_after}]
    series_path = OUT_DIR / "hgov-nightly-series.json"
    series_path.write_text(json.dumps({"series": series, "regime": detect_regime_change(series)}, indent=2), encoding="utf-8")
    print(f"H_gov before: {H_before:.6f}")
    print(f"H_gov after:  {H_after:.6f}")
    print(f"deltaH:       {H_after - H_before:.6f}")
    print(f"eta:          {eta}  jacobi=true")
    print(f"receipt:      {receipt_path}")
    print(f"node cost:    {heat_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
