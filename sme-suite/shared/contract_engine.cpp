#include "contract_engine.h"

#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>

namespace sme {

ContractEngine::ContractEngine(std::string moduleId)
    : moduleId_(std::move(moduleId)), startTimeMs_(nowMs()) {}

int64_t ContractEngine::nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

std::string ContractEngine::iso8601(int64_t ms) {
    std::time_t secs = static_cast<std::time_t>(ms / 1000);
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &secs);
#else
    localtime_r(&secs, &tm);
#endif
    char buf[40];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
    return std::string(buf) + "." + std::to_string(ms % 1000) + "Z";
}

void ContractEngine::setModuleVersion(const std::string& version) {
    moduleVersion_ = version;
}

void ContractEngine::declareIntent(const std::string& intentId, const std::string& action, const std::string& target) {
    intentId_ = intentId;
    action_ = action;
    target_ = target;
    record("intent", "intent=" + intentId + " action=" + action + " target=" + target, true);
}

void ContractEngine::addInvariant(const std::string& name, std::function<bool()> check, const std::string& message) {
    invariants_.emplace_back(name, std::make_pair(std::move(check), message));
}

bool ContractEngine::validate() {
    bool allOk = true;
    for (auto& inv : invariants_) {
        bool ok = false;
        try {
            ok = inv.second.first();
        } catch (...) {
            ok = false;
        }
        if (!ok) {
            allOk = false;
            record("validation", "FAILED invariant=" + inv.first + " :: " + inv.second.second, false);
        } else {
            record("validation", "OK invariant=" + inv.first, true);
        }
    }
    return allOk;
}

void ContractEngine::record(const std::string& kind, const std::string& detail, bool ok) {
    EvidenceRecord e;
    e.id = moduleId_ + "-ev-" + std::to_string(nowMs());
    e.kind = kind;
    e.detail = detail;
    e.timestampMs = nowMs();
    e.ok = ok;
    evidence_.push_back(std::move(e));
}

ContractResult ContractEngine::run(std::function<void()> action) {
    ContractResult res;
    res.moduleId = moduleId_;
    res.intentId = intentId_;

    if (intentId_.empty()) {
        res.error = "POLICY: no intent declared (policy-no-execution-without-intent)";
        res.ok = false;
        return res;
    }

    bool valid = validate();
    if (!valid) {
        res.error = "CONTRACT VIOLATION: invariants failed for action=" + action_ + " target=" + target_;
        res.ok = false;
        for (auto& ev : evidence_) {
            if (ev.kind == "validation" && !ev.ok) {
                res.violations.push_back({ev.detail, ev.detail});
            }
        }
        res.evidence = evidence_;
        return res;
    }

    record("authority", "module=" + moduleId_ + " version=" + moduleVersion_ + " authorized to run", true);
    record("decision", "action=" + action_ + " target=" + target_ + " APPROVED", true);

    if (action) {
        try {
            action();
        } catch (const std::exception& ex) {
            res.error = std::string("ACTION FAILED: ") + ex.what();
            res.ok = false;
            res.evidence = evidence_;
            return res;
        } catch (...) {
            res.error = "ACTION FAILED: unknown exception";
            res.ok = false;
            res.evidence = evidence_;
            return res;
        }
    }

    record("verification", "action completed", true);
    res.ok = true;
    res.evidence = evidence_;
    return res;
}

std::string ContractEngine::toJson(const ContractResult& res) const {
    std::ostringstream oss;
    oss << "{\n";
    oss << "  \"ok\": " << (res.ok ? "true" : "false") << ",\n";
    oss << "  \"moduleId\": \"" << res.moduleId << "\",\n";
    oss << "  \"moduleVersion\": \"" << moduleVersion_ << "\",\n";
    oss << "  \"intentId\": \"" << res.intentId << "\",\n";
    if (!res.error.empty()) {
        oss << "  \"error\": \"" << res.error << "\",\n";
    }
    oss << "  \"violations\": [\n";
    for (size_t i = 0; i < res.violations.size(); ++i) {
        oss << "    { \"invariant\": \"" << res.violations[i].invariant
            << "\", \"message\": \"" << res.violations[i].message << "\" }"
            << (i + 1 < res.violations.size() ? "," : "") << "\n";
    }
    oss << "  ],\n";
    oss << "  \"evidence\": [\n";
    for (size_t i = 0; i < res.evidence.size(); ++i) {
        const auto& e = res.evidence[i];
        oss << "    { \"id\": \"" << e.id << "\", \"kind\": \"" << e.kind
            << "\", \"detail\": \"" << e.detail
            << "\", \"timestamp\": \"" << iso8601(e.timestampMs)
            << "\", \"ok\": " << (e.ok ? "true" : "false") << " }"
            << (i + 1 < res.evidence.size() ? "," : "") << "\n";
    }
    oss << "  ]\n";
    oss << "}";
    return oss.str();
}

} // namespace sme
