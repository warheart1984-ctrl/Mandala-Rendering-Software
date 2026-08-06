#pragma once

// SME ContractEngine - constitutional layer for SME modules.
//
// Every module links against this header + contract_engine.cpp.
// Enforces the SME lawbook chain:
//   Authority -> Validation -> Decision -> Evidence -> Verification -> Replay -> Audit
//
// A module refuses to run if its declared invariants are not met.

#include <string>
#include <vector>
#include <functional>
#include <map>
#include <cstdint>

namespace sme {

struct ContractViolation {
    std::string invariant;
    std::string message;
};

struct EvidenceRecord {
    std::string id;
    std::string kind;      // intent | authority | validation | decision | output | verification
    std::string detail;
    int64_t    timestampMs = 0;
    bool       ok          = false;
};

struct ContractResult {
    bool                        ok          = false;
    std::string                 moduleId;
    std::string                 intentId;
    std::string                 error;
    std::vector<ContractViolation> violations;
    std::vector<EvidenceRecord> evidence;
};

// The central engine. Thread-safe for sequential use.
class ContractEngine {
public:
    explicit ContractEngine(std::string moduleId);

    // --- intent declaration (R1) ---
    void declareIntent(const std::string& intentId, const std::string& action, const std::string& target);

    // --- invariant registration ---
    // name:  machine readable invariant id (e.g. "input_rank", "model_exists")
    // check: returns true if invariant holds
    void addInvariant(const std::string& name, std::function<bool()> check, const std::string& message);

    // --- run: validates all invariants; runs action only if all pass ---
    // action is invoked only when the contract is satisfied.
    ContractResult run(std::function<void()> action);

    // --- evidence helpers ---
    void record(const std::string& kind, const std::string& detail, bool ok = true);
    void setModuleVersion(const std::string& version);

    const std::vector<EvidenceRecord>& evidence() const { return evidence_; }
    bool lastOk() const { return lastOk_; }
    const std::string& error() const { return error_; }

    // Serialize the whole contract result as JSON (audit-ready).
    std::string toJson(const ContractResult& res) const;

private:
    bool validate();

    std::string moduleId_;
    std::string moduleVersion_ = "0.1.0";
    std::string intentId_;
    std::string action_;
    std::string target_;
    std::vector<std::pair<std::string, std::pair<std::function<bool()>, std::string>>> invariants_;
    std::vector<EvidenceRecord> evidence_;
    bool   lastOk_ = false;
    std::string error_;
    int64_t startTimeMs_ = 0;

    static int64_t nowMs();
    static std::string iso8601(int64_t ms);
};

} // namespace sme
