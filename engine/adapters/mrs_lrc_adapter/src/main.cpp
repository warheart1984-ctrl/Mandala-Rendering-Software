// MRS → LRC Adapter CLI

#include "mrs_lrc_adapter.h"

#include <iostream>
#include <fstream>
#include <chrono>
#include <iomanip>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

static void print_usage(const char* prog) {
    std::cerr << "Usage: " << prog << " <command> [options]\n";
    std::cerr << "Commands:\n";
    std::cerr << "  scene     --scene <scene.json> --actor <id>     Convert MRS Scene4D to LRC request\n";
    std::cerr << "  timeline  --timeline <timeline.json> --actor <id>  Convert MRS Timeline to LRC request\n";
    std::cerr << "  world     --world <world.json> --actor <id>     Convert MRS World to LRC request\n";
    std::cerr << "  route     --request <request.json>              Route and execute via Sovereign X Router\n";
    std::cerr << "  replay    --request-id <id>                     Replay a previous execution\n";
    std::cerr << "  verify    --request-id <id>                     Verify deterministic replay\n";
    std::cerr << "Options:\n";
    std::cerr << "  --config <path>    Adapter config file (default: adapter_config.json)\n";
}

static json load_json_file(const std::string& path) {
    std::ifstream in(path);
    if (!in) throw std::runtime_error("Cannot open file: " + path);
    json j;
    in >> j;
    return j;
}

static AdapterConfig load_config(const std::string& path) {
    json j = load_json_file(path);
    AdapterConfig cfg;
    cfg.router_path = j.value("router_path", "");
    cfg.modules_root = j.value("modules_root", "");
    cfg.evidence_store = j.value("evidence_store", "data/evidence");
    cfg.replay_store = j.value("replay_store", "data/replay");
    cfg.ledger_store = j.value("ledger_store", "data/ledger");
    cfg.use_http = j.value("use_http", false);
    cfg.router_http_url = j.value("router_http_url", "http://localhost:8089");
    return cfg;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    std::string command = argv[1];
    std::string config_path = "adapter_config.json";
    std::string input_path;
    std::string actor_id = "mrs-user";
    std::string request_id;

    for (int i = 2; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) config_path = argv[++i];
        else if (arg == "--scene" && i + 1 < argc) input_path = argv[++i];
        else if (arg == "--timeline" && i + 1 < argc) input_path = argv[++i];
        else if (arg == "--world" && i + 1 < argc) input_path = argv[++i];
        else if (arg == "--request" && i + 1 < argc) input_path = argv[++i];
        else if (arg == "--actor" && i + 1 < argc) actor_id = argv[++i];
        else if (arg == "--request-id" && i + 1 < argc) request_id = argv[++i];
    }

    try {
auto config = load_config(config_path);
    MRS_LRC_Adapter adapter(config);

    if (command == "scene") {
        if (input_path.empty()) {
            std::cerr << "--scene requires a path\n";
            return 1;
        }
        json scene_json = load_json_file(input_path);
        MRS_Scene4D scene;
        scene.scene_id = scene_json.value("scene_id", "");
        scene.world_id = scene_json.value("world_id", "");
        scene.hypersurface = scene_json.value("hypersurface", json::object());
        scene.materials = scene_json.value("materials", json::object());
        scene.lights = scene_json.value("lights", json::object());
        scene.camera = scene_json.value("camera", json::object());
        scene.timeline = scene_json.value("timeline", json::object());

        auto request = adapter.convert_scene_to_request(scene, actor_id);
            json out;
            out["request_id"] = request.request_id;
            out["intent"]["goal"] = request.intent.goal;
            out["intent"]["modality"] = request.intent.modality;
            out["intent"]["constraints"]["max_latency_ms"] = request.intent.constraints.max_latency_ms;
            out["intent"]["constraints"]["max_cost_usd"] = request.intent.constraints.max_cost_usd;
            out["intent"]["constraints"]["privacy"] = request.intent.constraints.privacy;
            out["intent"]["constraints"]["deterministic"] = request.intent.constraints.deterministic;
            out["intent"]["constraints"]["evidence_level"] = request.intent.constraints.evidence_level;
            out["payload"] = request.payload;
            out["actor_id"] = request.actor_id;
            out["authority_chain"] = request.authority_chain;
            out["lawbook_chain"] = request.lawbook_chain;
            std::cout << out.dump(2) << "\n";

        } else if (command == "timeline") {
            if (input_path.empty()) {
                std::cerr << "--timeline requires a path\n";
                return 1;
            }
            json timeline_json = load_json_file(input_path);
            MRS_Timeline timeline;
            timeline.timeline_id = timeline_json.value("timeline_id", "");
            timeline.world_id = timeline_json.value("world_id", "");
            timeline.start_time = timeline_json.value("start_time", 0.0);
            timeline.end_time = timeline_json.value("end_time", 10.0);
            timeline.frame_rate = timeline_json.value("frame_rate", 30);
            timeline.clips = timeline_json.value("clips", json::object());

            auto request = adapter.convert_timeline_to_request(timeline, actor_id);
            json out;
            out["request_id"] = request.request_id;
            out["intent"]["goal"] = request.intent.goal;
            out["intent"]["modality"] = request.intent.modality;
            out["intent"]["constraints"]["max_latency_ms"] = request.intent.constraints.max_latency_ms;
            out["intent"]["constraints"]["max_cost_usd"] = request.intent.constraints.max_cost_usd;
            out["intent"]["constraints"]["privacy"] = request.intent.constraints.privacy;
            out["intent"]["constraints"]["deterministic"] = request.intent.constraints.deterministic;
            out["intent"]["constraints"]["evidence_level"] = request.intent.constraints.evidence_level;
            out["payload"] = request.payload;
            out["actor_id"] = request.actor_id;
            out["authority_chain"] = request.authority_chain;
            out["lawbook_chain"] = request.lawbook_chain;
            std::cout << out.dump(2) << "\n";

        } else if (command == "world") {
            if (input_path.empty()) {
                std::cerr << "--world requires a path\n";
                return 1;
            }
            json world_json = load_json_file(input_path);
            MRS_World world;
            world.world_id = world_json.value("world_id", "");
            world.metadata = world_json.value("metadata", json::object());
            // Parse scenes and timelines if present
            for (const auto& s : world_json.value("scenes", json::array())) {
                MRS_Scene4D scene;
                scene.scene_id = s.value("scene_id", "");
                scene.world_id = s.value("world_id", "");
                scene.hypersurface = s.value("hypersurface", json::object());
                scene.materials = s.value("materials", json::object());
                scene.lights = s.value("lights", json::object());
                scene.camera = s.value("camera", json::object());
                scene.timeline = s.value("timeline", json::object());
                world.scenes.push_back(scene);
            }
            
            json timelines_json = world_json.value("timelines", json::array());
            for (const auto& tl : timelines_json) {
                MRS_Timeline tl_obj;
                tl_obj.timeline_id = tl.value("timeline_id", "");
                tl_obj.world_id = tl.value("world_id", "");
                tl_obj.start_time = tl.value("start_time", 0.0);
                tl_obj.end_time = tl.value("end_time", 10.0);
                tl_obj.frame_rate = tl.value("frame_rate", 30);
                tl_obj.clips = tl.value("clips", json::object());
                world.timelines.push_back(tl_obj);
            }

            auto request = adapter.convert_world_to_request(world, actor_id);
            json out;
            out["request_id"] = request.request_id;
            out["intent"]["goal"] = request.intent.goal;
            out["intent"]["modality"] = request.intent.modality;
            out["intent"]["constraints"]["max_latency_ms"] = request.intent.constraints.max_latency_ms;
            out["intent"]["constraints"]["max_cost_usd"] = request.intent.constraints.max_cost_usd;
            out["intent"]["constraints"]["privacy"] = request.intent.constraints.privacy;
            out["intent"]["constraints"]["deterministic"] = request.intent.constraints.deterministic;
            out["intent"]["constraints"]["evidence_level"] = request.intent.constraints.evidence_level;
            out["payload"] = request.payload;
            out["actor_id"] = request.actor_id;
            out["authority_chain"] = request.authority_chain;
            out["lawbook_chain"] = request.lawbook_chain;
            std::cout << out.dump(2) << "\n";

        } else if (command == "route") {
            if (input_path.empty()) {
                std::cerr << "--request requires a path\n";
                return 1;
            }
            json request_json = load_json_file(input_path);
            RoutingRequest request;
            request.request_id = request_json.value("request_id", "");
            request.intent.goal = request_json["intent"].value("goal", "");
            request.intent.modality = request_json["intent"].value("modality", std::vector<std::string>{});
            request.intent.constraints.max_latency_ms = request_json["intent"]["constraints"].value("max_latency_ms", 5000);
            request.intent.constraints.max_cost_usd = request_json["intent"]["constraints"].value("max_cost_usd", 0.01);
            request.intent.constraints.privacy = request_json["intent"]["constraints"].value("privacy", "local");
            request.intent.constraints.deterministic = request_json["intent"]["constraints"].value("deterministic", true);
            request.intent.constraints.evidence_level = request_json["intent"]["constraints"].value("evidence_level", "full");
            request.payload = request_json.value("payload", json::object());
            request.actor_id = request_json.value("actor_id", "");
            request.authority_chain = request_json.value("authority_chain", std::vector<std::string>{});
            request.lawbook_chain = request_json.value("lawbook_chain", std::vector<std::string>{"authority", "validation", "decision", "evidence", "verification", "replay", "audit"});

            auto plan = adapter.route_and_execute(request);
            
            json out;
            out["plan_id"] = plan.plan_id;
            out["request_id"] = plan.request_id;
            out["execution_mode"] = plan.capability_plan.execution_mode;
            out["selected_backends"] = plan.capability_plan.selected_backends;
            out["lrc_envelopes"] = plan.lrc_envelopes;
            out["constitutional_trace"] = plan.constitutional_trace;
            std::cout << out.dump(2) << "\n";

        } else if (command == "replay") {
            if (request_id.empty()) {
                std::cerr << "--request-id required for replay\n";
                return 1;
            }
            auto bundle = adapter.replay(request_id);
            json out;
            out["bundle_id"] = bundle.bundle_id;
            out["intent_id"] = bundle.intent_id;
            out["world_id"] = bundle.world_id;
            out["timeline_id"] = bundle.timeline_id;
            out["artifacts"] = bundle.artifacts;
            out["frames"] = bundle.frames;
            out["merkle_root"] = bundle.merkle_root;
            out["created_at"] = bundle.created_at;
            std::cout << out.dump(2) << "\n";

        } else if (command == "verify") {
            if (request_id.empty()) {
                std::cerr << "--request-id required for verify\n";
                return 1;
            }
            bool verified = adapter.verify_replay(request_id);
            json out;
            out["request_id"] = request_id;
            out["verified"] = verified;
            std::cout << out.dump(2) << "\n";

        } else {
            std::cerr << "Unknown command: " << command << "\n";
            print_usage(argv[0]);
            return 1;
        }

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }

    return 0;
}