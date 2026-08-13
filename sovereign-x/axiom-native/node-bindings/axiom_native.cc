/**
 * Axiom Native - Node.js N-API Bindings
 */

#include <napi.h>
#include <axiom/axiom_abi.h>
#include <cstring>
#include <memory>

using namespace Napi;

class AxiomContext : public ObjectWrap<AxiomContext> {
public:
    static FunctionReference constructor;
    
    static Object Init(Env env, Object exports) {
        Function func = DefineClass(env, "AxiomContext", {
            InstanceMethod("createScene", &AxiomContext::CreateScene),
            InstanceMethod("allocBuffer", &AxiomContext::AllocBuffer),
            InstanceMethod("renderTile", &AxiomContext::RenderTile),
            InstanceMethod("renderTileAsync", &AxiomContext::RenderTileAsync),
            InstanceMethod("getCaps", &AxiomContext::GetCaps),
            InstanceMethod("destroy", &AxiomContext::Destroy),
        });
        
        constructor = Persistent(func);
        constructor.SuppressDestruct();
        
        exports.Set("AxiomContext", func);
        return exports;
    }
    
    AxiomContext(const CallbackInfo& info) : ObjectWrap<AxiomContext>(info) {
        Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsString()) {
            throw TypeError::New(env, "backend_id required");
        }
        
        std::string backend_id = info[0].As<String>().Utf8Value();
        std::string config = info.Length() > 1 && info[1].IsString() 
            ? info[1].As<String>().Utf8Value() : "{}";
        
        axiom_context_t ctx;
        axiom_result_t res = axiom_context_create(backend_id.c_str(), config.c_str(), &ctx_);
        if (res != AXIOM_OK) {
            throw Error::New(env, "Failed to create context: " + std::to_string(res));
        }
    }
    
    ~AxiomContext() {
        if (ctx_) {
            axiom_context_destroy(ctx_);
            ctx_ = nullptr;
        }
    }
    
    Value GetCaps(const CallbackInfo& info) {
        char* caps_json = nullptr;
        axiom_result_t res = axiom_context_get_caps(ctx_, &caps_json);
        if (res != AXIOM_OK) {
            throw Error::New(info.Env(), "Failed to get caps");
        }
        
        Value result = String::New(info.Env(), caps_json ? caps_json : "");
        if (caps_json) free(caps_json);
        return result;
    }
    
    Value CreateScene(const CallbackInfo& info) {
        Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsObject()) {
            throw TypeError::New(env, "scene descriptor object required");
        }
        
        Object desc = info[0].As<Object>();
        
        axiom_scene_desc_t scene_desc = {};
        scene_desc.width = desc.Get("width").As<Number>().Uint32Value();
        scene_desc.height = desc.Get("height").As<Number>().Uint32Value();
        scene_desc.samples = desc.Get("samples").As<Number>().Uint32Value();
        scene_desc.max_depth = desc.Get("maxDepth").As<Number>().Uint32Value();
        scene_desc.seed = desc.Get("seed").As<Number>().Uint64Value();
        scene_desc.prompt_hash = desc.Get("promptHash").As<Number>().Uint32Value();
        
        Object camPos = desc.Get("cameraPosition").As<Object>();
        scene_desc.camera_position[0] = camPos.Get("x").As<Number>().FloatValue();
        scene_desc.camera_position[1] = camPos.Get("y").As<Number>().FloatValue();
        scene_desc.camera_position[2] = camPos.Get("z").As<Number>().FloatValue();
        scene_desc.camera_position[3] = camPos.Get("w").As<Number>().FloatValue();
        
        Object camLook = desc.Get("cameraLookAt").As<Object>();
        scene_desc.camera_look_at[0] = camLook.Get("x").As<Number>().FloatValue();
        scene_desc.camera_look_at[1] = camLook.Get("y").As<Number>().FloatValue();
        scene_desc.camera_look_at[2] = camLook.Get("z").As<Number>().FloatValue();
        scene_desc.camera_look_at[3] = camLook.Get("w").As<Number>().FloatValue();
        
        scene_desc.fov_x = desc.Get("fovX").As<Number>().FloatValue();
        scene_desc.fov_y = desc.Get("fovY").As<Number>().FloatValue();
        scene_desc.fov_w = desc.Get("fovW").As<Number>().FloatValue();
        
        axiom_scene_t scene;
        axiom_result_t res = axiom_scene_create(ctx_, &scene_desc, &scene_);
        if (res != AXIOM_OK) {
            throw Error::New(env, "Failed to create scene: " + std::to_string(res));
        }
        
        // Return scene object with methods
        Object sceneObj = Object::New(env);
        sceneObj.Set("renderTile", Function::New(env, [this](const CallbackInfo& info) {
            return this->RenderTile(info);
        }));
        sceneObj.Set("getHash", Function::New(env, [this](const CallbackInfo& info) {
            return this->GetSceneHash(info);
        }));
        sceneObj.Set("destroy", Function::New(env, [this](const CallbackInfo& info) {
            this->DestroyScene(info);
            return env.Undefined();
        }));
        
        return sceneObj;
    }
    
    Value GetSceneHash(const CallbackInfo& info) {
        char hash[65] = {};
        axiom_result_t res = axiom_scene_get_hash(scene_, hash, 65);
        if (res != AXIOM_OK) {
            throw Error::New(info.Env(), "Failed to get scene hash");
        }
        return String::New(info.Env(), hash);
    }
    
    void DestroyScene(const CallbackInfo& info) {
        if (scene_) {
            axiom_scene_destroy(scene_);
            scene_ = nullptr;
        }
    }
    
    Value AllocBuffer(const CallbackInfo& info) {
        Env env = info.Env();
        
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber()) {
            throw TypeError::New(env, "width, height, format required");
        }
        
        uint32_t width = info[0].As<Number>().Uint32Value();
        uint32_t height = info[1].As<Number>().Uint32Value();
        uint32_t format = info[2].As<Number>().Uint32Value();
        
        axiom_buffer_t buffer;
        axiom_result_t res = axiom_buffer_alloc(ctx_, width, height, (axiom_format_t)format, &buffer_);
        if (res != AXIOM_OK) {
            throw Error::New(env, "Failed to allocate buffer: " + std::to_string(res));
        }
        
        // Return Buffer object
        void* ptr = nullptr;
        size_t stride = 0;
        axiom_buffer_map(buffer_, &ptr, &stride);
        
        return Buffer<char>::Copy(env, (char*)ptr, width * height * 4);
    }
    
    Value RenderTile(const CallbackInfo& info) {
        Env env = info.Env();
        
        if (info.Length() < 3 || !info[0].IsObject() || !info[1].IsObject() || !info[2].IsNumber()) {
            throw TypeError::New(env, "tile, buffer, tile_seed required");
        }
        
        Object tileDesc = info[0].As<Object>();
        Object bufferObj = info[1].As<Object>();
        uint64_t tileSeed = info[2].As<Number>().Uint64Value();
        
        axiom_tile_desc_t tile = {};
        tile.x = tileDesc.Get("x").As<Number>().Uint32Value();
        tile.y = tileDesc.Get("y").As<Number>().Uint32Value();
        tile.width = tileDesc.Get("width").As<Number>().Uint32Value();
        tile.height = tileDesc.Get("height").As<Number>().Uint32Value();
        tile.tile_index = tileDesc.Get("tileIndex").As<Number>().Uint32Value();
        
        // Get buffer pointer
        Buffer<char> buffer = bufferObj.As<Buffer<char>>();
        void* ptr = buffer.Data();
        
        // We need a proper buffer handle - for now use the last allocated
        axiom_result_t res = axiom_render_tile(ctx_, scene_, &tile, buffer_, tileSeed);
        if (res != AXIOM_OK) {
            throw Error::New(env, "Render failed: " + std::to_string(res));
        }
        
        return env.Undefined();
    }
    
    Value RenderTileAsync(const CallbackInfo& info) {
        // For now, delegate to sync version
        return RenderTile(info);
    }
    
    void Destroy(const CallbackInfo& info) {
        if (ctx_) {
            axiom_context_destroy(ctx_);
            ctx_ = nullptr;
        }
    }
    
private:
    axiom_context_t ctx_ = nullptr;
    axiom_scene_t scene_ = nullptr;
    axiom_buffer_t buffer_ = nullptr;
};

FunctionReference AxiomContext::constructor;

Object Init(Env env, Object exports) {
    AxiomContext::Init(env, exports);
    
    // Constants
    exports.Set("AXIOM_FMT_RGBA8", Number::New(env, AXIOM_FMT_RGBA8));
    exports.Set("AXIOM_FMT_RGBA16F", Number::New(env, AXIOM_FMT_RGBA16F));
    exports.Set("AXIOM_FMT_RGBA32F", Number::New(env, AXIOM_FMT_RGBA32F));
    
    exports.Set("AXIOM_OK", Number::New(env, AXIOM_OK));
    exports.Set("AXIOM_ERR_INVALID_ARG", Number::New(env, AXIOM_ERR_INVALID_ARG));
    exports.Set("AXIOM_ERR_OOM", Number::New(env, AXIOM_ERR_OOM));
    exports.Set("AXIOM_ERR_DEVICE", Number::New(env, AXIOM_ERR_DEVICE));
    exports.Set("AXIOM_ERR_COMPILE", Number::New(env, AXIOM_ERR_COMPILE));
    exports.Set("AXIOM_ERR_DETERMINISM", Number::New(env, AXIOM_ERR_DETERMINISM));
    exports.Set("AXIOM_ERR_UNSUPPORTED", Number::New(env, AXIOM_ERR_UNSUPPORTED));
    
    return exports;
}

NODE_API_MODULE(axiom_native, Init)