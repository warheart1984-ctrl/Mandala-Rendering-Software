/**
 * Lineage — reconstructable ancestry without runtime memory.
 *
 * Identity scheme: root, root/0, root/0/0, root/0/1, root/1, ...
 * branchPath is the ordered list of child indices from the root; the lineage
 * is fully recoverable from the path alone.
 *
 * Status: enforced (verified by hierarchy tests + invariant 9).
 */

export function lineagePathFromBranchPath(branchPath) {
  if (!branchPath || branchPath.length === 0) return "root";
  return ["root", ...branchPath].join("/");
}

export function branchPathFromId(id) {
  if (id === "root") return [];
  const parts = String(id).split("/");
  if (parts[0] !== "root") return null;
  return parts.slice(1).map((p) => parseInt(p, 10));
}

/**
 * Reconstruct the full lineage (list of ids from root down to the node)
 * from a branchPath.
 */
export function lineageFromBranchPath(branchPath) {
  if (!branchPath || branchPath.length === 0) return ["root"];
  const ids = ["root"];
  for (let i = 1; i <= branchPath.length; i++) {
    ids.push(`root/${branchPath.slice(0, i).join("/")}`);
  }
  return ids;
}

export function getLineage(node) {
  if (!node) return null;
  if (node.lineage) return [...node.lineage];
  return lineageFromBranchPath(node.branchPath || []);
}

export function lineageDepth(lineage) {
  return lineage ? lineage.length - 1 : 0;
}