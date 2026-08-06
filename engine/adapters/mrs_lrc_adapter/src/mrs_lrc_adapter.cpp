// MRS → LRC Adapter Implementation

#include "mrs_lrc_adapter.h"
#include "contract_engine.h"

#include <fstream>
#include <sstream>
#include <iomanip>
#include <random>
#include <filesystem>
#include <thread>
#include <future>
#include <iostream>

#if defined(_WIN32)
#include <windows.h>
#include <shellapi.h>
#endif

MRS_LRC_Adapter::MRS_LRC_Adapter(const AdapterConfig& config) : config_(config) {
    std::filesystem::create_directories(config.evidence_store);
    std::filesystem::create_directories(config.replay_store);
    std::filesystem::create_directories(config.ledger_store);
}

MRS_LRC_Adapter::~MRS_LRC_Adapter() = default;

std::string MRS_LRC_Adapter::generate_id() {
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<> dis(0, 15);
    static std::uniform_int_distribution<> dis2(8, 11);
    
    std::stringstream ss;
    for (int i = 0; i < 36; ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            ss << '-';
        } else if (i == 14) {
            ss << std::hex << dis2(gen);
        } else {
            ss << std::hex << dis(gen);
        }
    }
    return ss.str();
}

std::string MRS_LRC_Adapter::generate_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    std::time_t secs = ms / 1000;
    std::tm tm{};
#ifdef _WIN32
    localtime_s(&tm, &secs);
#else
    localtime_r(&secs, &tm);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tm);
    return std::string(buf) + "." + std::to_string(ms % 1000) + "Z";
}

RoutingRequest MRS_LRC_Adapter::convert_scene_to_request(const MRS_Scene4D& scene, const std::string& actor_id) {
    RoutingRequest request;
    request.request_id = "mrs-scene-" + generate_id();
    request.intent.goal = "Render 4D scene: " + scene.scene_id;
    request.intent.modality = {"scene", "generation"};
    request.intent.constraints.deterministic = true;
    request.intent.constraints.max_latency_ms = 30000;
    request.intent.constraints.max_cost_usd = 0.10;
    request.intent.constraints.privacy = "local";
    request.intent.constraints.evidence_level = "full";
    
    request.payload = {
        {"scene_id", scene.scene_id},
        {"world_id", scene.world_id},
        {"hypersurface", scene.hypersurface},
        {"materials", scene.materials},
        {"lights", scene.lights},
        {"camera", scene.camera}
    };
    
    request.actor_id = actor_id;
    request.authority_chain = {"mrs-user", "mrs-renderer", "sovereign-x-router"};
    
    return request;
}

RoutingRequest MRS_LRC_Adapter::convert_timeline_to_request(const MRS_Timeline& timeline, const std::string& actor_id) {
    RoutingRequest request;
    request.request_id = "mrs-timeline-" + generate_id();
    request.intent.goal = "Play timeline: " + timeline.timeline_id;
    request.intent.modality = {"scene", "video"};
    request.intent.constraints.deterministic = true;
    request.intent.constraints.max_latency_ms = 60000;
    request.intent.constraints.max_cost_usd = 0.50;
    request.intent.constraints.privacy = "local";
    request.intent.constraints.evidence_level = "full";
    
    request.payload = {
        {"timeline_id", timeline.timeline_id},
        {"world_id", timeline.world_id},
        {"start_time", timeline.start_time},
        {"end_time", timeline.end_time},
        {"frame_rate", timeline.frame_rate},
        {"clips", timeline.clips}
    };
    
    request.actor_id = actor_id;
    request.authority_chain = {"mrs-user", "mrs-renderer", "sovereign-x-router"};
    
    return request;
}

RoutingRequest MRS_LRC_Adapter::convert_world_to_request(const MRS_World& world, const std::string& actor_id) {
    RoutingRequest request;
    request.request_id = "mrs-world-" + generate_id();
    request.intent.goal = "Process world: " + world.world_id;
    request.intent.modality = {"scene", "generation", "video"};
    request.intent.constraints.deterministic = true;
    request.intent.constraints.max_latency_ms = 120000;
    request.intent.constraints.max_cost_usd = 1.00;
    request.intent.constraints.privacy = "local";
    request.intent.constraints.evidence_level = "full";
    
    json scenes_json = json::array();
    for (const auto& scene : world.scenes) {
        json scene_obj;
        scene_obj["scene_id"] = scene.scene_id;
        scene_obj["world_id"] = scene.world_id;
        scenes_json.push_back(scene_obj);
    }
    
    request.payload = json::object();
    request.payload["world_id"] = world.world_id;
    request.payload["metadata"] = world.metadata;
    request.payload["scenes"] = scenes_json;
    
    json timelines_json = json::array();
    for (const auto& tl : world.timelines) {
        json tl_obj;
        tl_obj["timeline_id"] = tl.timeline_id;
        tl_obj["world_id"] = tl.world_id;
        tl_obj["start_time"] = tl.start_time;
        tl_obj["end_time"] = tl.end_time;
        tl_obj["frame_rate"] = tl.frame_rate;
        tl_obj["clips"] = tl.clips;
        timelines_json.push_back(tl_obj);
    }
    request.payload["timelines"] = timelines_json;
    
    request.actor_id = actor_id;
    request.authority_chain = {"mrs-user", "mrs-renderer", "sovereign-x-router"};
    
    return request;
}

ExecutionPlan MRS_LRC_Adapter::call_router(const RoutingRequest& request) {
    // Build request JSON
    json request_json;
    request_json["request_id"] = request.request_id;
    request_json["intent"]["goal"] = request.intent.goal;
    request_json["intent"]["modality"] = request.intent.modality;
    request_json["intent"]["constraints"]["max_latency_ms"] = request.intent.constraints.max_latency_ms;
    request_json["intent"]["constraints"]["max_cost_usd"] = request.intent.constraints.max_cost_usd;
    request_json["intent"]["constraints"]["privacy"] = request.intent.constraints.privacy;
    request_json["intent"]["constraints"]["deterministic"] = request.intent.constraints.deterministic;
    request_json["intent"]["constraints"]["evidence_level"] = request.intent.constraints.evidence_level;
    request_json["payload"] = request.payload;
    request_json["actor_id"] = request.actor_id;
    request_json["authority_chain"] = request.authority_chain;
    request_json["lawbook_chain"] = request.lawbook_chain;
    
    // Write request to temp file
    std::string temp_request = config_.modules_root + "/temp_request_" + request.request_id + ".json";
    std::filesystem::create_directories(std::filesystem::path(temp_request).parent_path());
    {
        std::ofstream out(temp_request);
        out << std::setw(2) << request_json << "\n";
    }
    
    // Call sme-router
    std::string temp_output = config_.modules_root + "/temp_output_" + request.request_id + ".json";
    std::string router_exe = config_.router_path;
    
    std::string cmd = "\"" + router_exe + "\" \"" + temp_request + "\" --output \"" + temp_output + "\"";
    
#if defined(_WIN32)
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    if (!CreateProcessA(nullptr, const_cast<LPSTR>(cmd.c_str()), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        throw std::runtime_error("Failed to start router: " + cmd);
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
#else
    int result = system(cmd.c_str());
    if (result != 0) {
        throw std::runtime_error("Router execution failed: " + cmd);
    }
#endif
    
    // Read output
    std::ifstream in(temp_output);
    if (!in) {
        throw std::runtime_error("Router output not found: " + temp_output);
    }
    
    json output_json;
    in >> output_json;
    
    // Clean up temp files
    std::filesystem::remove(temp_request);
    std::filesystem::remove(temp_output);
    
    // Parse ExecutionPlan
    ExecutionPlan plan;
    plan.plan_id = output_json.value("plan_id", "");
    plan.request_id = output_json.value("request_id", "");
    plan.capability_plan.estimated_flops = output_json.value("capability_plan.estimatedFlops", 0);
    plan.capability_plan.estimated_ram_gb = output_json.value("capability_plan.estimatedRamGB", 0.0);
    plan.capability_plan.estimated_latency_ms = output_json.value("capability_plan.estimatedLatencyMs", 0);
    plan.capability_plan.execution_mode = output_json.value("capability_plan.executionMode", "LOCAL");
    plan.capability_plan.substrate_hints = output_json.value("capability_plan.substrateHints", std::map<std::string, std::string>{});
    plan.capability_plan.selected_backends = output_json.value("capability_plan.selectedBackends", std::vector<json>{});
    plan.capability_plan.modality_requirements = output_json.value("capability_plan.modalityRequirements", std::vector<json>{});
    plan.lrc_envelopes = output_json.value("lrc_envelopes", std::vector<json>{});
    plan.constitutional_trace = output_json.value("constitutional_trace", json::object());
    plan.evidence_requirements = output_json.value("evidence_requirements", std::vector<std::string>{});
    
    return plan;
}

ExecutionPlan MRS_LRC_Adapter::route_and_execute(const RoutingRequest& request) {
    // Step 1: Route through Sovereign X Router
    ExecutionPlan plan = call_router(request);
    
    // Step 2: Execute LRC envelopes
    EvidenceBundle bundle = execute_envelopes(plan);
    
    // Step 3: Store evidence and replay record
    store_evidence(bundle);
    store_replay(request.request_id, bundle);
    
    return plan;
}

json MRS_LRC_Adapter::execute_envelope(const LRCEnvelope& envelope) {
    // Determine SME module from target_node
    std::string module_name = envelope.target_node;
    if (module_name.rfind("sme-", 0) == 0) {
        module_name = module_name.substr(4); // Remove "sme-" prefix
    }
    
    return call_sme_module(module_name, json{
        {"envelope_id", envelope.envelope_id},
        {"action", envelope.action},
        {"payload", envelope.payload},
        {"evidence_requirements", envelope.evidence_requirements}
    });
}

json MRS_LRC_Adapter::call_sme_module(const std::string& module_name, const json& envelope) {
    std::string module_exe = config_.modules_root + "/modules/sme-" + module_name + "/build/sme_" + module_name + ".exe";
    
    // Write envelope to temp file
    std::string temp_input = config_.modules_root + "/temp_envelope_" + generate_id() + ".json";
    std::string temp_output = config_.modules_root + "/temp_result_" + generate_id() + ".json";
    std::filesystem::create_directories(std::filesystem::path(temp_input).parent_path());
    
    {
        std::ofstream out(temp_input);
        out << std::setw(2) << envelope << "\n";
    }
    
    // Call module
    std::string cmd = "\"" + module_exe + "\" \"" + temp_input + "\" --output \"" + temp_output + "\"";
    
#if defined(_WIN32)
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    if (!CreateProcessA(nullptr, const_cast<LPSTR>(cmd.c_str()), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        return {{"error", "Failed to start module: " + module_name}};
    }
    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
#else
    int result = system(cmd.c_str());
    if (result != 0) {
        return {{"error", "Module execution failed: " + module_name}};
    }
#endif
    
    // Read result
    std::ifstream in(temp_output);
    json result;
    if (in) {
        in >> result;
    } else {
        result = {{"error", "Module output not found"}};
    }
    
    // Clean up
    std::filesystem::remove(temp_input);
    std::filesystem::remove(temp_output);
    
    return result;
}

EvidenceBundle MRS_LRC_Adapter::execute_envelopes(const ExecutionPlan& plan) {
    EvidenceBundle bundle;
    bundle.bundle_id = "bundle-" + generate_id();
    bundle.intent_id = plan.request_id;
    bundle.world_id = plan.capability_plan.modality_requirements.empty() ? "" : 
                      plan.capability_plan.modality_requirements[0].value("world_id", "");
    bundle.timeline_id = "";
    bundle.artifacts = json::object();
    bundle.frames = json::array();
    bundle.created_at = generate_timestamp();
    
    std::vector<json> results;
    
    // Execute each LRC envelope
    for (const auto& envelope_json : plan.lrc_envelopes) {
        LRCEnvelope envelope;
        envelope.envelope_id = envelope_json.value("envelope_id", "");
        envelope.target_node = envelope_json.value("target_node", "");
        envelope.action = envelope_json.value("action", "");
        envelope.payload = envelope_json.value("payload", json::object());
        envelope.evidence_requirements = envelope_json.value("evidence_requirements", std::vector<std::string>{});
        
        json result = execute_envelope(envelope);
        results.push_back(result);
        
        // Collect evidence from result
        if (result.contains("evidence")) {
            for (const auto& ev : result["evidence"]) {
                bundle.frames.push_back(ev);
            }
        }
        
        // Collect artifacts
        if (result.contains("output") || result.contains("response")) {
            bundle.artifacts[envelope.envelope_id] = result;
        }
    }
    
    // Compute merkle root
    std::string combined = bundle.artifacts.dump() + bundle.frames.dump();
    std::hash<std::string> hasher;
    bundle.merkle_root = std::to_string(hasher(combined));
    
    return bundle;
}

void MRS_LRC_Adapter::store_evidence(const EvidenceBundle& bundle) {
    std::string file = config_.evidence_store + "/evidence_" + bundle.bundle_id + ".json";
    std::filesystem::create_directories(std::filesystem::path(file).parent_path());
    
    json out;
    out["bundle_id"] = bundle.bundle_id;
    out["intent_id"] = bundle.intent_id;
    out["world_id"] = bundle.world_id;
    out["timeline_id"] = bundle.timeline_id;
    out["artifacts"] = bundle.artifacts;
    out["frames"] = bundle.frames;
    out["merkle_root"] = bundle.merkle_root;
    out["created_at"] = bundle.created_at;
    
    std::ofstream out_stream(file);
    out_stream << std::setw(2) << out << "\n";
}

void MRS_LRC_Adapter::store_replay(const std::string& request_id, const EvidenceBundle& bundle) {
    std::string file = config_.replay_store + "/replay_" + request_id + ".json";
    std::filesystem::create_directories(std::filesystem::path(file).parent_path());
    
    json out;
    out["request_id"] = request_id;
    out["bundle"] = {
        {"bundle_id", bundle.bundle_id},
        {"intent_id", bundle.intent_id},
        {"world_id", bundle.world_id},
        {"timeline_id", bundle.timeline_id},
        {"artifacts", bundle.artifacts},
        {"frames", bundle.frames},
        {"merkle_root", bundle.merkle_root},
        {"created_at", bundle.created_at}
    };
    out["stored_at"] = generate_timestamp();
    
    std::ofstream out_stream(file);
    out_stream << std::setw(2) << out << "\n";
}

EvidenceBundle MRS_LRC_Adapter::replay(const std::string& request_id) {
    std::string file = config_.replay_store + "/replay_" + request_id + ".json";
    std::ifstream in(file);
    if (!in) {
        throw std::runtime_error("Replay record not found: " + request_id);
    }
    
    json data;
    in >> data;
    
    EvidenceBundle bundle;
    auto& b = data["bundle"];
    bundle.bundle_id = b.value("bundle_id", "");
    bundle.intent_id = b.value("intent_id", "");
    bundle.world_id = b.value("world_id", "");
    bundle.timeline_id = b.value("timeline_id", "");
    bundle.artifacts = b.value("artifacts", json::object());
    bundle.frames = b.value("frames", json::array());
    bundle.merkle_root = b.value("merkle_root", "");
    bundle.created_at = b.value("created_at", "");
    
    return bundle;
}

bool MRS_LRC_Adapter::verify_replay(const std::string& request_id) {
    // Load original replay record
    EvidenceBundle original = replay(request_id);
    
    // Find original request (would need to store routing request too)
    // For now, just verify merkle root consistency
    std::string combined = original.artifacts.dump() + original.frames.dump();
    std::hash<std::string> hasher;
    std::string computed_root = std::to_string(hasher(combined));
    
    return computed_root == original.merkle_root;
}