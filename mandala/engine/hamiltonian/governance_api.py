#!/usr/bin/env python3
"""Governance Engine API + visual console (PARTIAL, localhost analogue).

Base: /api/governance   Bind: 127.0.0.1 only.
Auth omitted — tokens assumed later; do not fake OAuth.
Not a production SaaS. Tiny in-memory graphs. No AAIS-UL v20.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from nightly_governance import (  # noqa: E402
    ETA,
    detect_regime_change,
    h_gov,
    local_h_i,
    nightly_governance_relaxation,
)

DASHBOARD_PATH = HERE / "governance_dashboard.html"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.environ.get("GOVERNANCE_API_PORT", "8765"))

NODE_TYPES = frozenset({"decision", "intent", "actor", "policy", "tool"})
COORD_KEYS = ("risk", "ambiguity", "evidence", "compliance", "trust", "jurisdiction")
SHORT = {
    "risk": "r",
    "ambiguity": "a",
    "evidence": "e",
    "compliance": "c",
    "trust": "t",
    "jurisdiction": "j",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clamp01(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _coord_block(src=None):
    src = src or {}
    aliases = {
        "risk": ("risk", "r"),
        "ambiguity": ("ambiguity", "a"),
        "evidence": ("evidence", "e"),
        "compliance": ("compliance", "c"),
        "trust": ("trust", "t"),
        "jurisdiction": ("jurisdiction", "j", "jv", "jFit"),
    }
    out = {}
    for long_k, names in aliases.items():
        val = 0.5
        for n in names:
            if n in src and src[n] is not None:
                val = src[n]
                break
        out[long_k] = _clamp01(val)
    return out


def _weights_block(src=None, default=1.0):
    src = src or {}
    out = {}
    for k in COORD_KEYS:
        short = SHORT[k]
        if k in src:
            out[k] = float(src[k])
        elif short in src:
            out[k] = float(src[short])
        else:
            out[k] = float(default)
    return out


def _alpha_short(block):
    return {SHORT[k]: float(block[k]) for k in COORD_KEYS}


class GovernanceStore:
    def __init__(self):
        self.lock = threading.Lock()
        self.nodes = {}
        self.edges = {}
        self.config = {
            "alpha": _weights_block(None, 1.0),
            "w": _weights_block(None, 1.0),
            "eta": ETA,
            "phase_abs_drop": 0.25,
            "phase_rel_drop": 0.1,
        }
        self.history = {}
        self.runs = []
        self._id_seq = 0
        self.seed_demo()

    def _new_id(self, prefix="node"):
        self._id_seq += 1
        return f"{prefix}-{self._id_seq}"

    def _edge_key(self, source, target):
        a, b = (source, target) if source < target else (target, source)
        return f"{a}|{b}"

    def seed_demo(self):
        ts = _now()
        specs = [
            ("approve-vendor-x", "decision", "Approve vendor X", "alice", ["vendor", "hot"],
             {"risk": 0.92, "ambiguity": 0.80, "evidence": 0.15, "compliance": 0.20, "trust": 0.18, "jurisdiction": 0.25}),
            ("alice", "actor", "Alice", "alice", ["owner"],
             {"risk": 0.12, "ambiguity": 0.10, "evidence": 0.85, "compliance": 0.88, "trust": 0.90, "jurisdiction": 0.85}),
            ("procurement-policy", "policy", "Procurement policy", "ops", ["policy"],
             {"risk": 0.08, "ambiguity": 0.05, "evidence": 0.90, "compliance": 0.95, "trust": 0.92, "jurisdiction": 0.88}),
            ("onboard-intent", "intent", "Onboard vendor", "alice", ["vendor"],
             {"risk": 0.35, "ambiguity": 0.40, "evidence": 0.55, "compliance": 0.60, "trust": 0.50, "jurisdiction": 0.45}),
            ("contract-scan", "tool", "Contract scan", "ops", ["tool"],
             {"risk": 0.20, "ambiguity": 0.25, "evidence": 0.70, "compliance": 0.75, "trust": 0.65, "jurisdiction": 0.60}),
            ("bob", "actor", "Bob", "bob", ["reviewer"],
             {"risk": 0.15, "ambiguity": 0.18, "evidence": 0.80, "compliance": 0.82, "trust": 0.70, "jurisdiction": 0.75}),
            ("reject-unsigned-msa", "decision", "Reject unsigned MSA", "bob", ["legal"],
             {"risk": 0.55, "ambiguity": 0.45, "evidence": 0.40, "compliance": 0.35, "trust": 0.42, "jurisdiction": 0.50}),
        ]
        for nid, typ, label, owner, tags, coords in specs:
            self.nodes[nid] = {
                "id": nid,
                "type": typ,
                "label": label,
                "coordinates": _coord_block(coords),
                "neighbors": [],
                "metadata": {"created_at": ts, "updated_at": ts, "owner": owner, "tags": list(tags)},
            }
            self.history[nid] = []
        edges = [
            ("approve-vendor-x", "alice", 1.2, "cdr"),
            ("approve-vendor-x", "procurement-policy", 1.4, "policy"),
            ("approve-vendor-x", "onboard-intent", 1.0, "intent"),
            ("alice", "onboard-intent", 1.0, "actor"),
            ("alice", "bob", 0.6, "peer"),
            ("procurement-policy", "onboard-intent", 0.9, "policy"),
            ("onboard-intent", "contract-scan", 1.1, "tool"),
            ("bob", "reject-unsigned-msa", 1.0, "cdr"),
            ("reject-unsigned-msa", "procurement-policy", 0.8, "policy"),
        ]
        for src, tgt, J, rel in edges:
            self.upsert_edge({"source": src, "target": tgt, "coupling": J, "relation": rel})

    def neighbors_of(self, nid):
        out = []
        for e in self.edges.values():
            if e["source"] == nid:
                out.append(e["target"])
            elif e["target"] == nid:
                out.append(e["source"])
        return sorted(set(out))

    def refresh_neighbors(self):
        for nid, n in self.nodes.items():
            n["neighbors"] = self.neighbors_of(nid)

    def arrays(self):
        nodes = list(self.nodes.keys())
        r, a, e, c, t, jv = {}, {}, {}, {}, {}, {}
        neighbors = {}
        J = {}
        for nid, n in self.nodes.items():
            co = n["coordinates"]
            r[nid] = co["risk"]
            a[nid] = co["ambiguity"]
            e[nid] = co["evidence"]
            c[nid] = co["compliance"]
            t[nid] = co["trust"]
            jv[nid] = co["jurisdiction"]
            neighbors[nid] = []
            J[nid] = {}
        for edge in self.edges.values():
            s, t_id = edge["source"], edge["target"]
            if s not in self.nodes or t_id not in self.nodes:
                continue
            neighbors[s].append(t_id)
            neighbors[t_id].append(s)
            J[s][t_id] = edge["coupling"]
            J[t_id][s] = edge["coupling"]
        return nodes, r, a, e, c, t, jv, neighbors, J

    def write_back(self, r, a, e, c, t, jv):
        ts = _now()
        for nid in self.nodes:
            self.nodes[nid]["coordinates"] = {
                "risk": r[nid],
                "ambiguity": a[nid],
                "evidence": e[nid],
                "compliance": c[nid],
                "trust": t[nid],
                "jurisdiction": jv[nid],
            }
            self.nodes[nid]["metadata"]["updated_at"] = ts

    def physics_params(self):
        return _alpha_short(self.config["alpha"]), _alpha_short(self.config["w"]), float(self.config["eta"])

    def global_cost(self):
        nodes, r, a, e, c, t, jv, neighbors, J = self.arrays()
        alpha, w, _eta = self.physics_params()
        return h_gov(r, a, e, c, t, jv, neighbors, J, nodes, alpha, w)

    def local_costs(self):
        nodes, r, a, e, c, t, jv, neighbors, J = self.arrays()
        alpha, w, _eta = self.physics_params()
        out = {}
        for nid in nodes:
            out[nid] = local_h_i(nid, r, a, e, c, t, jv, neighbors, J, alpha, w)
        return out

    def public_node(self, nid, include_cost=True):
        n = self.nodes[nid]
        self.refresh_neighbors()
        body = {
            "id": n["id"],
            "type": n["type"],
            "label": n["label"],
            "coordinates": dict(n["coordinates"]),
            "neighbors": list(n["neighbors"]),
            "metadata": dict(n["metadata"]),
        }
        if include_cost:
            body["local_cost"] = self.local_costs().get(nid, 0.0)
        return body

    def upsert_node(self, body):
        body = body or {}
        nid = body.get("id") or self._new_id()
        existing = self.nodes.get(nid)
        typ = body.get("type") or (existing["type"] if existing else "decision")
        if typ == "tool-run":
            typ = "tool"
        if typ not in NODE_TYPES:
            raise ValueError(f"type must be one of {sorted(NODE_TYPES)}")
        coords_src = body.get("coordinates") or body.get("sigma") or body
        coords = _coord_block(coords_src)
        if existing:
            coords = _coord_block({**existing["coordinates"], **coords_src, **coords})
        meta_in = body.get("metadata") or {}
        ts = _now()
        if existing:
            meta = dict(existing["metadata"])
            meta.update({k: v for k, v in meta_in.items() if v is not None})
            meta["updated_at"] = ts
            label = body.get("label", existing["label"])
        else:
            meta = {
                "created_at": meta_in.get("created_at", ts),
                "updated_at": ts,
                "owner": meta_in.get("owner", "local"),
                "tags": list(meta_in.get("tags") or []),
            }
            label = body.get("label", nid)
            self.history.setdefault(nid, [])
        self.nodes[nid] = {
            "id": nid,
            "type": typ,
            "label": label,
            "coordinates": coords,
            "neighbors": list(body.get("neighbors") or (existing["neighbors"] if existing else [])),
            "metadata": meta,
        }
        for nbr in body.get("neighbors") or []:
            if nbr != nid:
                self.upsert_edge({"source": nid, "target": nbr, "coupling": 1.0, "relation": "neighbor"})
        self.refresh_neighbors()
        return self.public_node(nid)

    def upsert_edge(self, body):
        body = body or {}
        source = body.get("source") or body.get("from")
        target = body.get("target") or body.get("to")
        if not source or not target:
            raise ValueError("edge requires source/target (aliases: from/to)")
        if source == target:
            raise ValueError("self-loop not allowed")
        if source not in self.nodes or target not in self.nodes:
            raise ValueError("both endpoints must exist")
        coupling = body.get("coupling", body.get("J", 1.0))
        try:
            coupling = float(coupling)
        except (TypeError, ValueError) as exc:
            raise ValueError("coupling must be a number") from exc
        relation = body.get("relation") or body.get("reason") or "cdr"
        key = self._edge_key(source, target)
        self.edges[key] = {
            "source": source,
            "target": target,
            "coupling": coupling,
            "relation": relation,
        }
        self.refresh_neighbors()
        return dict(self.edges[key])

    def graph_payload(self):
        self.refresh_neighbors()
        costs = self.local_costs()
        nodes = []
        for nid, n in self.nodes.items():
            row = self.public_node(nid, include_cost=False)
            row["local_cost"] = costs.get(nid, 0.0)
            nodes.append(row)
        return {
            "nodes": nodes,
            "edges": [dict(e) for e in self.edges.values()],
            "global_cost": self.global_cost(),
            "timestamp": _now(),
            "runs": list(self.runs),
            "config": dict(self.config),
        }

    def relax(self, body=None):
        body = body or {}
        mode = body.get("mode") or "nightly"
        if mode not in ("nightly", "manual"):
            raise ValueError("mode must be nightly or manual")
        alpha_cfg = dict(self.config["alpha"])
        w_cfg = dict(self.config["w"])
        if body.get("weights"):
            w_cfg = _weights_block({**w_cfg, **body["weights"]})
        if body.get("alpha"):
            alpha_cfg = _weights_block({**alpha_cfg, **body["alpha"]})
        if body.get("w"):
            w_cfg = _weights_block({**w_cfg, **body["w"]})
        eta = body.get("eta_override", body.get("eta", self.config["eta"]))
        eta = float(eta if eta is not None else ETA)
        max_iter = int(body.get("max_iterations", 1) or 1)
        if max_iter < 1:
            max_iter = 1
        if max_iter > 64:
            max_iter = 64
        nodes, r, a, e, c, t, jv, neighbors, J = self.arrays()
        alpha = _alpha_short(alpha_cfg)
        w = _alpha_short(w_cfg)
        before = h_gov(r, a, e, c, t, jv, neighbors, J, nodes, alpha, w)
        for _ in range(max_iter):
            nightly_governance_relaxation(
                r, a, e, c, t, jv, neighbors, J, nodes, eta=eta, alpha=alpha, w=w
            )
        after = h_gov(r, a, e, c, t, jv, neighbors, J, nodes, alpha, w)
        self.write_back(r, a, e, c, t, jv)
        run_id = f"run-{uuid.uuid4().hex[:10]}"
        ts = _now()
        local = self.local_costs()
        for nid in nodes:
            self.history.setdefault(nid, []).append({
                "run_id": run_id,
                "timestamp": ts,
                "coordinates": dict(self.nodes[nid]["coordinates"]),
                "local_cost": local.get(nid, 0.0),
            })
        rec = {
            "run_id": run_id,
            "timestamp": ts,
            "mode": mode,
            "eta": eta,
            "max_iterations": max_iter,
            "jacobi": True,
            "nodes_updated": len(nodes),
            "global_cost_before": before,
            "global_cost_after": after,
            "before_cost": before,
            "after_cost": after,
            "deltaH": after - before,
        }
        self.runs.append(rec)
        series = [{"t": i, "H": run["after_cost"]} for i, run in enumerate(self.runs)]
        if series:
            series = [{"t": 0, "H": self.runs[0]["before_cost"]}] + [
                {"t": i + 1, "H": run["after_cost"]} for i, run in enumerate(self.runs)
            ]
        regime = detect_regime_change(
            series,
            abs_drop=float(self.config.get("phase_abs_drop", 0.25)),
            rel_drop=float(self.config.get("phase_rel_drop", 0.1)),
        )
        rec["regime"] = regime
        summary = {
            "run_id": run_id,
            "before_cost": before,
            "after_cost": after,
            "nodes_updated": len(nodes),
            "mode": mode,
            "eta": eta,
        }
        return {**rec, "summary": summary}

    def failures(self, k=10):
        costs = self.local_costs()
        rows = []
        ranked = sorted(self.nodes.values(), key=lambda n: costs.get(n["id"], 0.0), reverse=True)
        for n in ranked[:k]:
            Hi = costs.get(n["id"], 0.0)
            co = n["coordinates"]
            reasons = []
            if co["risk"] > 0.6:
                reasons.append("high risk")
            if co["ambiguity"] > 0.6:
                reasons.append("high ambiguity")
            if co["evidence"] < 0.4:
                reasons.append("low evidence")
            if co["compliance"] < 0.4:
                reasons.append("low compliance")
            if co["trust"] < 0.4:
                reasons.append("low trust")
            if co["jurisdiction"] < 0.4:
                reasons.append("poor jurisdictional fit")
            if not reasons:
                reasons.append("elevated local H_i relative to peers")
            rows.append({
                "id": n["id"],
                "type": n["type"],
                "label": n["label"],
                "local_cost": Hi,
                "Hi": Hi,
                "normalized": Hi / (ranked and costs.get(ranked[0]["id"], 1.0) or 1.0),
                "coordinates": dict(co),
                "metadata": dict(n["metadata"]),
                "reason": "; ".join(reasons),
            })
        return {"top_k": k, "limit": k, "failures": rows, "status": "partial"}

    def set_config(self, body):
        body = body or {}
        if "alpha" in body:
            self.config["alpha"] = _weights_block({**self.config["alpha"], **body["alpha"]})
        if "w" in body or "weights" in body:
            src = body.get("w") or body.get("weights")
            self.config["w"] = _weights_block({**self.config["w"], **src})
        if "eta" in body:
            self.config["eta"] = float(body["eta"])
        if "phase_abs_drop" in body:
            self.config["phase_abs_drop"] = float(body["phase_abs_drop"])
        if "phase_rel_drop" in body:
            self.config["phase_rel_drop"] = float(body["phase_rel_drop"])
        return dict(self.config)


def _read_json(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from exc


def make_handler(store: GovernanceStore):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            if os.environ.get("GOVERNANCE_API_LOG"):
                super().log_message(fmt, *args)

        def _send(self, code, obj, content_type="application/json"):
            if content_type == "application/json":
                body = json.dumps(obj).encode("utf-8")
            else:
                body = obj if isinstance(obj, (bytes, bytearray)) else str(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _err(self, code, err_code, message):
            self._send(code, {"error": {"code": err_code, "message": message}})

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            q = parse_qs(parsed.query)
            try:
                if path in ("/", "/dashboard"):
                    html = DASHBOARD_PATH.read_text(encoding="utf-8") if DASHBOARD_PATH.exists() else "<h1>dashboard missing</h1>"
                    return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
                if path == "/api/governance/graph":
                    with store.lock:
                        return self._send(200, store.graph_payload())
                if path == "/api/governance/cost":
                    with store.lock:
                        costs = store.local_costs()
                        return self._send(200, {
                            "global_cost": store.global_cost(),
                            "nodes": [{"id": nid, "local_cost": costs[nid]} for nid in store.nodes],
                        })
                if path == "/api/governance/failures":
                    raw = (q.get("top_k") or q.get("limit") or ["10"])[0]
                    try:
                        k = int(raw)
                    except ValueError:
                        k = 10
                    if k <= 0:
                        k = 10
                    k = min(k, 50)
                    with store.lock:
                        return self._send(200, store.failures(k))
                if path == "/api/governance/config":
                    with store.lock:
                        return self._send(200, dict(store.config))
                if path.startswith("/api/governance/node/"):
                    nid = path.split("/api/governance/node/", 1)[1]
                    with store.lock:
                        if nid not in store.nodes:
                            return self._err(404, "not_found", f"node {nid} not found")
                        return self._send(200, store.public_node(nid))
                if path.startswith("/api/governance/history/"):
                    nid = path.split("/api/governance/history/", 1)[1]
                    with store.lock:
                        if nid not in store.nodes:
                            return self._err(404, "not_found", f"node {nid} not found")
                        return self._send(200, {
                            "id": nid,
                            "history": list(store.history.get(nid, [])),
                        })
                return self._err(404, "not_found", f"no route {path}")
            except Exception as exc:  # noqa: BLE001 — localhost analogue, surface message
                return self._err(500, "internal", str(exc))

        def do_POST(self):
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            try:
                body = _read_json(self)
            except ValueError as exc:
                return self._err(400, "bad_request", str(exc))
            try:
                if path == "/api/governance/node":
                    with store.lock:
                        return self._send(200, store.upsert_node(body))
                if path == "/api/governance/edge":
                    with store.lock:
                        return self._send(200, store.upsert_edge(body))
                if path == "/api/governance/relax":
                    with store.lock:
                        return self._send(200, store.relax(body))
                if path == "/api/governance/config":
                    with store.lock:
                        return self._send(200, store.set_config(body))
                return self._err(404, "not_found", f"no route {path}")
            except ValueError as exc:
                return self._err(400, "bad_request", str(exc))
            except Exception as exc:  # noqa: BLE001
                return self._err(500, "internal", str(exc))

    return Handler


def serve(host=DEFAULT_HOST, port=DEFAULT_PORT, store=None):
    store = store or GovernanceStore()
    httpd = ThreadingHTTPServer((host, port), make_handler(store))
    httpd.store = store
    return httpd


def main(argv=None):
    host = os.environ.get("GOVERNANCE_API_HOST", DEFAULT_HOST)
    port = int(os.environ.get("GOVERNANCE_API_PORT", str(DEFAULT_PORT)))
    if argv:
        for i, arg in enumerate(argv):
            if arg == "--port" and i + 1 < len(argv):
                port = int(argv[i + 1])
            if arg == "--host" and i + 1 < len(argv):
                host = argv[i + 1]
    if host not in ("127.0.0.1", "localhost", "::1"):
        print("refusing non-loopback bind; use 127.0.0.1", file=sys.stderr)
        host = "127.0.0.1"
    httpd = serve(host, port)
    actual = httpd.server_address[1]
    print(f"Governance Engine API (partial, localhost analogue)")
    print(f"  dashboard: http://{host}:{actual}/dashboard")
    print(f"  graph:     http://{host}:{actual}/api/governance/graph")
    print(f"  auth:      omitted (loopback only; tokens later, no fake OAuth)")
    print(f"  gpu:       declared (see gpu-hgov.skel.glsl)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
