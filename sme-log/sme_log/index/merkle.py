"""
SME-LOG — Merkle Tree Indexing
Constitutional Contract: contract.sme-log.v1
Authority: record
Status: declared
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class MerkleNode:
    """Node in Merkle tree"""
    hash: str
    left: Optional["MerkleNode"] = None
    right: Optional["MerkleNode"] = None
    data: Optional[str] = None  # Leaf data
    is_leaf: bool = False


class MerkleTree:
    """
    Merkle tree for tamper-evident evidence indexing.
    Constitutional requirement: immutable, append-only evidence log.
    """
    
    def __init__(self):
        self.leaves: list[str] = []
        self.root: Optional[MerkleNode] = None
    
    def add_leaf(self, data: str) -> str:
        """Add leaf and return its hash"""
        leaf_hash = hashlib.sha256(data.encode()).hexdigest()
        self.leaves.append(leaf_hash)
        return leaf_hash
    
    def add_leaf_bytes(self, data: bytes) -> str:
        """Add leaf from bytes"""
        leaf_hash = hashlib.sha256(data).hexdigest()
        self.leaves.append(leaf_hash)
        return leaf_hash
    
    def build(self) -> str:
        """Build Merkle tree and return root hash"""
        if not self.leaves:
            return hashlib.sha256(b"empty").hexdigest()
        
        # Build tree bottom-up
        current_level = [MerkleNode(hash=h, is_leaf=True) for h in self.leaves]
        
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left
                
                combined = left.hash + right.hash
                parent_hash = hashlib.sha256(combined.encode()).hexdigest()
                
                parent = MerkleNode(
                    hash=parent_hash,
                    left=left,
                    right=right,
                )
                next_level.append(parent)
            
            current_level = next_level
        
        self.root = current_level[0]
        return self.root.hash
    
    def get_root(self) -> Optional[str]:
        """Get current root hash"""
        return self.root.hash if self.root else None
    
    def get_proof(self, leaf_index: int) -> list[dict[str, str]]:
        """Get Merkle proof for a leaf"""
        if not self.root or leaf_index >= len(self.leaves):
            return []
        
        # Rebuild tree tracking path
        current_level = [MerkleNode(hash=h, is_leaf=True) for h in self.leaves]
        proof = []
        
        target_idx = leaf_index
        
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left
                
                combined = left.hash + right.hash
                parent_hash = hashlib.sha256(combined.encode()).hexdigest()
                
                parent = MerkleNode(hash=parent_hash, left=left, right=right)
                next_level.append(parent)
                
                # Check if target is in this pair
                if i // 2 == target_idx // 2:
                    # Target is one of these two
                    if i == target_idx:
                        proof.append({"sibling": right.hash, "position": "right"})
                    else:
                        proof.append({"sibling": left.hash, "position": "left"})
                    target_idx = i // 2
            
            current_level = next_level
        
        return proof
    
    @staticmethod
    def verify_proof(leaf_hash: str, proof: list[dict[str, str]], root_hash: str) -> bool:
        """Verify Merkle proof"""
        current = leaf_hash
        
        for step in proof:
            sibling = step["sibling"]
            position = step["position"]
            
            if position == "right":
                combined = current + sibling
            else:
                combined = sibling + current
            
            current = hashlib.sha256(combined.encode()).hexdigest()
        
        return current == root_hash


class MerkleIndex:
    """
    Merkle index for evidence store.
    Provides O(1) lookup by evidence ID with tamper detection.
    """
    
    def __init__(self):
        self.tree = MerkleTree()
        self.evidence_map: dict[str, int] = {}  # evidence_id -> leaf_index
        self.built = False
    
    def add_evidence(self, evidence_id: str, data: dict[str, Any]) -> str:
        """Add evidence to index"""
        if self.built:
            raise RuntimeError("Cannot add evidence after tree is built")
        
        data_json = json.dumps(data, sort_keys=True)
        leaf_hash = self.tree.add_leaf(data_json)
        self.evidence_map[evidence_id] = len(self.leaves) - 1
        return leaf_hash
    
    def build(self) -> str:
        """Build the Merkle tree"""
        self.built = True
        return self.tree.build()
    
    def get_root(self) -> Optional[str]:
        """Get Merkle root"""
        return self.tree.get_root()
    
    def get_proof(self, evidence_id: str) -> list[dict[str, str]]:
        """Get proof for evidence"""
        if evidence_id not in self.evidence_map:
            return []
        return self.tree.get_proof(self.evidence_map[evidence_id])
    
    def verify_evidence(self, evidence_id: str, data: dict[str, Any]) -> bool:
        """Verify evidence against Merkle root"""
        if not self.built or evidence_id not in self.evidence_map:
            return False
        
        idx = self.evidence_map[evidence_id]
        data_json = json.dumps(data, sort_keys=True)
        leaf_hash = hashlib.sha256(data_json.encode()).hexdigest()
        
        proof = self.tree.get_proof(idx)
        root = self.tree.get_root()
        
        return MerkleTree.verify_proof(leaf_hash, proof, root)


if __name__ == "__main__":
    # Demo
    index = MerkleIndex()
    
    # Add evidence
    index.add_evidence("ev-1", {"type": "embedding", "model": "mobilevit", "dim": 512})
    index.add_evidence("ev-2", {"type": "transcript", "text": "Hello world"})
    index.add_evidence("ev-3", {"type": "decision", "tokens": 10})
    
    root = index.build()
    print(f"Merkle root: {root}")
    
    # Verify
    for ev_id in ["ev-1", "ev-2", "ev-3"]:
        proof = index.get_proof(ev_id)
        print(f"{ev_id}: proof length = {len(proof)}")
    
    # Verify tampering detection
    print(f"ev-1 valid: {index.verify_evidence('ev-1', {'type': 'embedding', 'model': 'mobilevit', 'dim': 512})}")
    print(f"ev-1 tampered: {index.verify_evidence('ev-1', {'type': 'embedding', 'model': 'mobilevit', 'dim': 256})}")