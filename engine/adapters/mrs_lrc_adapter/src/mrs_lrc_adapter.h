#pragma once

// MRS → LRC Adapter
// Bridges Mandala Rendering System (MRS) to Sovereign X Router LRC protocol

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <chrono>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// MRS Scene4D representation (simplified)
struct MRS_Scene4D {
    std::string scene_id;
    std::string world_id;
    json hypersurface;      // 4D geometry
    json materials;         // BRDF parameters
    json lights;            // 4D light sources
    json camera;            // Camera4D parameters
    json timeline;          // Animation timeline
};

// MRS Timeline
struct MRS_Timeline {
    std::string timeline_id;
    std::string world_id;
    double start_time = 0.0;
    double end_time = 10.0;
    int frame_rate = 30;
    json clips;             // Animation clips
};

// MRS World
struct MRS_World {
    std::string world_id;
    json metadata;
    std::vector<MRS_Scene4D> scenes;
    std::vector<MRS_Timeline> timelines;
};

// RoutingRequest matching governance/contracts/v1/schemas/routing-request.json
struct RoutingRequest {
    std::string request_id;
    struct Intent {
        std::string goal;
        std::vector<std::string> modality;
        struct Constraints {
            int max_latency_ms = 5000;
            double max_cost_usd = 0.01;
            std::string privacy = "local";
            bool deterministic = true;
            std::string evidence_level = "full";
        } constraints;
    } intent;
    json payload;
    std::string actor_id;
    std::vector<std::string> authority_chain;
    std::vector<std::string> lawbook_chain = {"authority", "validation", "decision", "evidence", "verification", "replay", "audit"};
};

// ExecutionPlan matching governance/contracts/v1/schemas/execution-plan.json
struct ExecutionPlan {
    std::string plan_id;
    std::string request_id;
    struct CapabilityPlan {
        int64_t estimated_flops = 0;
        double estimated_ram_gb = 0.0;
        int estimated_latency_ms = 0;
        std::string execution_mode; // LOCAL, HYBRID, OFFLOAD, DEFER
        std::map<std::string, std::string> substrate_hints;
        std::vector<json> selected_backends;
        std::vector<json> modality_requirements;
    } capability_plan;
    std::vector<json> lrc_envelopes;
    json constitutional_trace;
    std::vector<std::string> evidence_requirements;
};

// LRC Envelope
struct LRCEnvelope {
    std::string envelope_id;
    std::string origin_node = "sovereign-x-router";
    std::string target_node; // sme-txt, sme-vis, sme-aud, sme-vid, sme-gen, sme-log
    std::string actor_id;
    std::string action; // encode, transcribe, complete, generate, replay, audit
    std::vector<std::string> lawbook_chain = {"authority", "validation", "decision", "evidence", "verification", "replay", "audit"};
    json payload;
    std::vector<std::string> evidence_requirements;
};

// Evidence Bundle
struct EvidenceBundle {
    std::string bundle_id;
    std::string intent_id;
    std::string world_id;
    std::string timeline_id;
    json artifacts;
    json frames;
    std::string merkle_root;
    std::string created_at;
};

// Adapter configuration
struct AdapterConfig {
    std::string router_path;           // Path to sme_router executable
    std::string modules_root;          // Root directory for SME modules
    std::string evidence_store;        // Path to evidence store
    std::string replay_store;          // Path to replay store
    std::string ledger_store;          // Path to ledger store
    bool use_http = false;             // Use HTTP instead of subprocess
    std::string router_http_url;       // HTTP URL for router if use_http=true
};

class MRS_LRC_Adapter {
public:
    explicit MRS_LRC_Adapter(const AdapterConfig& config);
    ~MRS_LRC_Adapter();

    // Convert MRS Scene4D to RoutingRequest
    RoutingRequest convert_scene_to_request(const MRS_Scene4D& scene, const std::string& actor_id);
    
    // Convert MRS Timeline to RoutingRequest  
    RoutingRequest convert_timeline_to_request(const MRS_Timeline& timeline, const std::string& actor_id);
    
    // Convert MRS World to RoutingRequest
    RoutingRequest convert_world_to_request(const MRS_World& world, const std::string& actor_id);

    // Submit request to router and execute
    ExecutionPlan route_and_execute(const RoutingRequest& request);

    // Execute LRC envelopes from execution plan
    EvidenceBundle execute_envelopes(const ExecutionPlan& plan);

    // Replay a previous execution
    EvidenceBundle replay(const std::string& request_id);

    // Verify deterministic replay
    bool verify_replay(const std::string& request_id);

private:
    AdapterConfig config_;
    
    std::string generate_id();
    std::string generate_timestamp();
    
    // Call sme-router via subprocess or HTTP
    ExecutionPlan call_router(const RoutingRequest& request);
    
    // Execute single LRC envelope
    json execute_envelope(const LRCEnvelope& envelope);
    
    // Call SME module
    json call_sme_module(const std::string& module_name, const json& envelope);
    
    // Build evidence bundle from execution results
    EvidenceBundle build_evidence_bundle(const ExecutionPlan& plan, const std::vector<json>& results);
    
    // Store evidence
    void store_evidence(const EvidenceBundle& bundle);
    
    // Store replay record
    void store_replay(const std::string& request_id, const EvidenceBundle& bundle);
};