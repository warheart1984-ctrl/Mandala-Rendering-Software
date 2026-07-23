# Website Copy — FourDRenderer v2.0 (Evidence-Bound + Redlines)

> **Status:** Public-facing draft with inline redlines.  
> **Do not** paste into product README capability tables.  
> Aspirational homepage tone: [`aspirational/WEBSITE_COPY.md`](./aspirational/WEBSITE_COPY.md)  
> Map: [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md)

---

## Hero

**Headline:** FourDRenderer v2.0 — Higher-Dimensional Rendering Architecture (**Declared**)

**Subhead:** Contracts for 4D acceleration, SO(4)-aware shading, projection, and Observation Modes — extending existing MRS / RT4D work. Deep Unreal RHI integration remains a **roadmap**.

~~REDLINE reject: “World’s first real-time 4D engine”~~  
~~REDLINE reject: “Production-ready Unreal plugin”~~

**CTA primary:** Read the architecture index  
**CTA secondary:** View maturity scorecard  
**Contact:** TBD

---

## What it is

FourDRenderer v2.0 **declares** how a renderer can operate in \(\mathbb{R}^{4}\) and produce host-visible 3D imagery through explicit projection and Observation Modes. Host adapters consume Scene3D + lineage (hybrid-first); they are not claimed as full 4D RHI replacements today.

---

## Building blocks (status badges)

| Block | Public badge |
| --- | --- |
| 4D BVH contracts | Declared |
| SO(4) BSDF contracts | Declared |
| Path transport | Declared · RT4D partial prior art |
| Projection / PLP alignment | Declared |
| Observation Modes | Declared |
| Unreal blend interface | Declared · deep RHI roadmap |
| Nanite / Lumen extensions | Roadmap |
| Tooling suite | Roadmap |

---

## Performance callout (honest)

**Design target** for a future real-time preview configuration: keep 4D passes within a **4–6 ms** planning envelope on a future target GPU.

**Not a measured SLA.** Do not show a fake FPS badge.

~~REDLINE reject: “Delivers 4–6 ms today”~~

---

## For studios

Evaluate the RFC suite and hybrid-first adapter boundary. Ask for a design review — not a production go-live checklist for Unreal RHI 4D.

---

## For researchers

See the research abstract and architecture whitepaper. Results sections must say **targets / declared**, not measured frame times as fact.

---

## Footer legal-ish

Positioning drafts only. Capability claims require evidence refresh (Drive-G-1). Maturity is multi-dimensional (Drive-G-2). Press / sales contact: **TBD**.
