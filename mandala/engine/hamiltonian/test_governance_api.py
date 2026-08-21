#!/usr/bin/env python3
"""Unit tests for H_gov Python Jacobi + HTTP governance API (localhost)."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import governance_api as gapi  # noqa: E402
import nightly_governance as ng  # noqa: E402


def two_node():
    nodes = ["n0", "n1"]
    r = {"n0": 0.9, "n1": 0.1}
    a = {"n0": 0.1, "n1": 0.8}
    e = {"n0": 0.2, "n1": 0.9}
    c = {"n0": 0.3, "n1": 0.7}
    t = {"n0": 0.4, "n1": 0.6}
    jv = {"n0": 0.5, "n1": 0.2}
    neighbors = {"n0": ["n1"], "n1": ["n0"]}
    J = {"n0": {"n1": 1.25}, "n1": {"n0": 1.25}}
    return nodes, r, a, e, c, t, jv, neighbors, J


class NightlyMathTests(unittest.TestCase):
    def test_isolated_gradients_via_energy(self):
        r, a, e, c, t, jv = {"i": 0.3}, {"i": 0.4}, {"i": 0.5}, {"i": 0.6}, {"i": 0.7}, {"i": 0.8}
        neighbors, J = {"i": []}, {}
        H = ng.h_gov(r, a, e, c, t, jv, neighbors, J, ["i"])
        self.assertAlmostEqual(H, ng.site_u(0.3, 0.4, 0.5, 0.6, 0.7, 0.8), places=12)

    def test_two_node_interaction_and_jacobi_not_gs(self):
        nodes, r, a, e, c, t, jv, neighbors, J = two_node()
        eta = 0.01
        Jij, wr, ar = 1.25, 1.0, 1.0
        r0, r1 = r["n0"], r["n1"]
        d0 = 2 * ar * r0 + Jij * wr * (r0 - r1)
        d1 = 2 * ar * r1 + Jij * wr * (r1 - r0)
        exp0 = ng.clamp01(r0 - eta * d0)
        exp1 = ng.clamp01(r1 - eta * d1)
        gs1 = ng.clamp01(r1 - eta * (2 * ar * r1 + Jij * wr * (r1 - exp0)))
        ng.nightly_governance_relaxation(r, a, e, c, t, jv, neighbors, J, nodes, eta=eta)
        self.assertAlmostEqual(r["n0"], exp0, places=12)
        self.assertAlmostEqual(r["n1"], exp1, places=12)
        self.assertNotAlmostEqual(r["n1"], gs1, places=9)

    def test_w_has_half(self):
        w = ng.w_gov_pair(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        self.assertAlmostEqual(w, 0.5, places=12)

    def test_h_nonincreasing_and_clamp(self):
        nodes, r, a, e, c, t, jv, neighbors, J = two_node()
        Hb, Ha = ng.run_once(nodes, r, a, e, c, t, jv, neighbors, J, eta=0.01)
        self.assertLessEqual(Ha, Hb + 1e-12)
        for i in nodes:
            for arr in (r, a, e, c, t, jv):
                self.assertGreaterEqual(arr[i], 0.0)
                self.assertLessEqual(arr[i], 1.0)

    def test_eta_default(self):
        self.assertEqual(ng.ETA, 0.01)

    def test_regime_change_on_evidence_influx(self):
        nodes, r, a, e, c, t, jv, neighbors, J = ng.demo_payload()
        H0 = ng.h_gov(r, a, e, c, t, jv, neighbors, J, nodes)
        for i in nodes:
            e[i] = 1.0
        H1 = ng.h_gov(r, a, e, c, t, jv, neighbors, J, nodes)
        det = ng.detect_regime_change([{"t": 0, "H": H0}, {"t": 1, "H": H1}], abs_drop=0.25)
        self.assertTrue(det["flaggedDrop"])
        self.assertLess(H1, H0)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = gapi.GovernanceStore()
        cls.httpd = gapi.serve("127.0.0.1", 0, cls.store)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def _req(self, method, path, body=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"} if payload else {}
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        conn.close()
        data = json.loads(raw.decode()) if raw else {}
        return resp.status, data

    def test_dashboard(self):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/dashboard")
        resp = conn.getresponse()
        html = resp.read().decode()
        conn.close()
        self.assertEqual(resp.status, 200)
        self.assertIn("Governance Relaxation Dashboard", html)
        self.assertIn("/api/governance/graph", html)

    def test_node_crud_and_graph(self):
        st, node = self._req("POST", "/api/governance/node", {
            "id": "extra-1",
            "type": "decision",
            "label": "Extra",
            "coordinates": {"risk": 1.4, "ambiguity": -0.2, "evidence": 0.5, "compliance": 0.5, "trust": 0.5, "jurisdiction": 0.5},
            "metadata": {"owner": "qa", "tags": ["test"]},
        })
        self.assertEqual(st, 200)
        self.assertEqual(node["coordinates"]["risk"], 1.0)
        self.assertEqual(node["coordinates"]["ambiguity"], 0.0)
        st, got = self._req("GET", "/api/governance/node/extra-1")
        self.assertEqual(st, 200)
        self.assertIn("local_cost", got)
        self.assertIn("neighbors", got)
        st, graph = self._req("GET", "/api/governance/graph")
        self.assertEqual(st, 200)
        self.assertIn("global_cost", graph)
        self.assertIn("timestamp", graph)
        ids = {n["id"] for n in graph["nodes"]}
        self.assertIn("approve-vendor-x", ids)
        self.assertIn("extra-1", ids)

    def test_edge_aliases(self):
        st, edge = self._req("POST", "/api/governance/edge", {
            "from": "alice",
            "to": "contract-scan",
            "J": 0.7,
            "relation": "review",
        })
        self.assertEqual(st, 200)
        self.assertEqual(edge["source"], "alice")
        self.assertEqual(edge["target"], "contract-scan")
        self.assertEqual(edge["coupling"], 0.7)

    def test_relax_cost_drop_and_dual_names(self):
        st, before = self._req("GET", "/api/governance/cost")
        self.assertEqual(st, 200)
        st, rec = self._req("POST", "/api/governance/relax", {"mode": "nightly", "max_iterations": 1})
        self.assertEqual(st, 200)
        self.assertTrue(rec["jacobi"])
        self.assertIn("run_id", rec)
        self.assertIn("global_cost_before", rec)
        self.assertIn("before_cost", rec)
        self.assertIn("after_cost", rec)
        self.assertIn("summary", rec)
        self.assertEqual(rec["before_cost"], rec["summary"]["before_cost"])
        self.assertLessEqual(rec["after_cost"], rec["before_cost"] + 1e-9)
        st, hist = self._req("GET", "/api/governance/history/approve-vendor-x")
        self.assertEqual(st, 200)
        self.assertGreaterEqual(len(hist["history"]), 1)

    def test_failures_and_config(self):
        st, fail = self._req("GET", "/api/governance/failures?top_k=3")
        self.assertEqual(st, 200)
        self.assertEqual(len(fail["failures"]), 3)
        self.assertIn("reason", fail["failures"][0])
        self.assertIn("coordinates", fail["failures"][0])
        self.assertIn("metadata", fail["failures"][0])
        st, fail2 = self._req("GET", "/api/governance/failures?limit=2")
        self.assertEqual(st, 200)
        self.assertEqual(len(fail2["failures"]), 2)
        st, cfg = self._req("GET", "/api/governance/config")
        self.assertEqual(st, 200)
        self.assertEqual(cfg["eta"], 0.01)
        st, cfg2 = self._req("POST", "/api/governance/config", {"eta": 0.02, "alpha": {"risk": 1.1}})
        self.assertEqual(st, 200)
        self.assertEqual(cfg2["eta"], 0.02)
        self.assertEqual(cfg2["alpha"]["risk"], 1.1)

    def test_error_shape(self):
        st, err = self._req("GET", "/api/governance/node/no-such")
        self.assertEqual(st, 404)
        self.assertIn("error", err)
        self.assertIn("code", err["error"])
        self.assertIn("message", err["error"])


if __name__ == "__main__":
    unittest.main()
