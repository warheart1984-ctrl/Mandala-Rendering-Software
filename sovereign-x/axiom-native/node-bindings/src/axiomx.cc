#include <winsock2.h>
#include <windows.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include <nan.h>

typedef int32_t uals_status;
typedef struct uals_device {
  uint32_t vendor_id;
  uint32_t device_id;
  int32_t backend_kind;
  char name[64];
  uint64_t global_mem_bytes;
  uint32_t max_workgroup_size;
  uint32_t flags;
} uals_device;
typedef struct uals_kernel_meta {
  uint64_t rng_seed;
  uint32_t samples_per_pixel;
  uint32_t width;
  uint32_t height;
  uint64_t intent_id;
  uint64_t world_id;
  uint64_t timeline_id;
  uint32_t time_seconds;
} uals_kernel_meta;
typedef struct uals_axiom_x_args {
  uint32_t seed;
  uint32_t spp;
  uint32_t width;
  uint32_t height;
} uals_axiom_x_args;

typedef uals_status (*fn_uals_probe)(int32_t, const uals_device **, uint32_t *);
typedef uals_status (*fn_uals_create)(const uals_device *, const uals_kernel_meta *, void **);
typedef uals_status (*fn_uals_enqueue)(void *, const char *, const uals_kernel_meta *, const void *, size_t);
typedef uals_status (*fn_uals_map)(void *, void **, void **, size_t *);
typedef uals_status (*fn_uals_unmap)(void *, void *);
typedef uals_status (*fn_uals_sync)(void *);
typedef void (*fn_uals_destroy)(void *);
typedef const char *(*fn_uals_status_str)(uals_status);

static HMODULE g_dll = NULL;
static fn_uals_probe p_probe = NULL;
static fn_uals_create p_create = NULL;
static fn_uals_enqueue p_enqueue = NULL;
static fn_uals_map p_map = NULL;
static fn_uals_unmap p_unmap = NULL;
static fn_uals_sync p_sync = NULL;
static fn_uals_destroy p_destroy = NULL;
static fn_uals_status_str p_status_str = NULL;

static std::string dll_dir() {
  HMODULE self = NULL;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                         GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                     reinterpret_cast<LPCWSTR>(&dll_dir), &self);
  wchar_t buf[2048];
  DWORD n = GetModuleFileNameW(self, buf, 2048);
  std::wstring ws(buf, n);
  size_t slash = ws.find_last_of(L"\\/");
  std::wstring dir = (slash == std::wstring::npos) ? L"." : ws.substr(0, slash);
  std::string out;
  for (wchar_t c : dir) out.push_back(static_cast<char>(c));
  return out;
}

static int ensure_dll() {
  if (g_dll) return 0;
  std::string path = dll_dir() + "\\uals.dll";
  g_dll = LoadLibraryA(path.c_str());
  if (!g_dll) g_dll = LoadLibraryA("uals.dll");
  if (!g_dll) return -1;
  p_probe = reinterpret_cast<fn_uals_probe>(GetProcAddress(g_dll, "uals_probe"));
  p_create = reinterpret_cast<fn_uals_create>(GetProcAddress(g_dll, "uals_create"));
  p_enqueue = reinterpret_cast<fn_uals_enqueue>(GetProcAddress(g_dll, "uals_enqueue"));
  p_map = reinterpret_cast<fn_uals_map>(GetProcAddress(g_dll, "uals_map"));
  p_unmap = reinterpret_cast<fn_uals_unmap>(GetProcAddress(g_dll, "uals_unmap"));
  p_sync = reinterpret_cast<fn_uals_sync>(GetProcAddress(g_dll, "uals_sync"));
  p_destroy = reinterpret_cast<fn_uals_destroy>(GetProcAddress(g_dll, "uals_destroy"));
  p_status_str = reinterpret_cast<fn_uals_status_str>(GetProcAddress(g_dll, "uals_status_str"));
  if (!p_probe || !p_create || !p_enqueue || !p_map || !p_unmap || !p_sync ||
      !p_destroy || !p_status_str) {
    FreeLibrary(g_dll);
    g_dll = NULL;
    return -2;
  }
  return 0;
}

static std::string status_msg(uals_status s) {
  return p_status_str ? std::string(p_status_str(s)) : std::string("?");
}

NAN_METHOD(probe) {
  if (ensure_dll() != 0) {
    return Nan::ThrowError("uals.dll not found (run sovereign-x/axiom-native/build_vs.bat first)");
  }
  const uals_device *devices = NULL;
  uint32_t count = 0;
  uals_status st = p_probe(1, &devices, &count);
  if (st != 0) {
    std::string msg = "probe failed: " + status_msg(st);
    return Nan::ThrowError(msg.c_str());
  }
  v8::Local<v8::Array> arr = Nan::New<v8::Array>(count);
  for (uint32_t i = 0; i < count; i++) {
    v8::Local<v8::Object> o = Nan::New<v8::Object>();
    Nan::Set(o, Nan::New("name").ToLocalChecked(), Nan::New(devices[i].name).ToLocalChecked());
    Nan::Set(o, Nan::New("vendorId").ToLocalChecked(), Nan::New<v8::Uint32>(devices[i].vendor_id));
    Nan::Set(o, Nan::New("globalMemBytes").ToLocalChecked(), Nan::New<v8::Number>((double)devices[i].global_mem_bytes));
    Nan::Set(o, Nan::New("maxWorkgroupSize").ToLocalChecked(), Nan::New<v8::Uint32>(devices[i].max_workgroup_size));
    Nan::Set(o, Nan::New("flags").ToLocalChecked(), Nan::New<v8::Uint32>(devices[i].flags));
    Nan::Set(arr, i, o);
  }
  info.GetReturnValue().Set(arr);
}

NAN_METHOD(renderAxiomX) {
  if (ensure_dll() != 0) {
    return Nan::ThrowError("uals.dll not found (run sovereign-x/axiom-native/build_vs.bat first)");
  }
  if (!info[0]->IsObject()) return Nan::ThrowTypeError("options object required");
  v8::Local<v8::Object> o = info[0]->ToObject(Nan::GetCurrentContext()).ToLocalChecked();

  auto getU32 = [&](const char *key, uint32_t &out) -> bool {
    v8::Local<v8::String> k = Nan::New(key).ToLocalChecked();
    if (!Nan::HasOwnProperty(o, k).FromJust()) return false;
    v8::Local<v8::Value> v = Nan::Get(o, k).ToLocalChecked();
    if (!v->IsNumber()) return false;
    out = static_cast<uint32_t>(v->Uint32Value(Nan::GetCurrentContext()).FromJust());
    return true;
  };
  auto getU64 = [&](const char *key, uint64_t &out) -> bool {
    v8::Local<v8::String> k = Nan::New(key).ToLocalChecked();
    if (!Nan::HasOwnProperty(o, k).FromJust()) return false;
    v8::Local<v8::Value> v = Nan::Get(o, k).ToLocalChecked();
    if (!v->IsNumber()) return false;
    out = static_cast<uint64_t>(v->IntegerValue(Nan::GetCurrentContext()).FromJust());
    return true;
  };

  uals_kernel_meta meta;
  std::memset(&meta, 0, sizeof(meta));
  if (!getU64("seed", meta.rng_seed)) return Nan::ThrowTypeError("seed (number) required");
  if (!getU32("spp", meta.samples_per_pixel)) return Nan::ThrowTypeError("spp (number) required");
  if (!getU32("width", meta.width)) return Nan::ThrowTypeError("width (number) required");
  if (!getU32("height", meta.height)) return Nan::ThrowTypeError("height (number) required");
  getU64("intentId", meta.intent_id);
  getU64("worldId", meta.world_id);
  getU64("timelineId", meta.timeline_id);
  getU32("timeSeconds", meta.time_seconds);

  const uals_device *devices = NULL;
  uint32_t count = 0;
  uals_status st = p_probe(1, &devices, &count);
  if (st != 0 || count == 0) {
    std::string msg = "no OpenCL device: " + status_msg(st);
    return Nan::ThrowError(msg.c_str());
  }

  void *ctx = NULL;
  st = p_create(&devices[0], &meta, &ctx);
  if (st != 0) {
    std::string msg = "create failed: " + status_msg(st);
    return Nan::ThrowError(msg.c_str());
  }

  uals_axiom_x_args args;
  args.seed = static_cast<uint32_t>(meta.rng_seed);
  args.spp = meta.samples_per_pixel;
  args.width = meta.width;
  args.height = meta.height;

  st = p_enqueue(ctx, "sx.kernel.axiom.x.sample", &meta, &args, sizeof(args));
  if (st != 0) {
    p_destroy(ctx);
    std::string msg = "enqueue failed: " + status_msg(st);
    return Nan::ThrowError(msg.c_str());
  }

  void *buf = NULL, *ptr = NULL;
  size_t nbytes = 0;
  st = p_map(ctx, &buf, &ptr, &nbytes);
  if (st != 0) {
    p_destroy(ctx);
    std::string msg = "map failed: " + status_msg(st);
    return Nan::ThrowError(msg.c_str());
  }

  v8::Local<v8::Object> out = Nan::CopyBuffer(static_cast<char *>(ptr), nbytes).ToLocalChecked();
  p_unmap(ctx, buf);
  p_destroy(ctx);
  info.GetReturnValue().Set(out);
}

NAN_MODULE_INIT(Init) {
  Nan::SetMethod(target, "probe", probe);
  Nan::SetMethod(target, "renderAxiomX", renderAxiomX);
}

NODE_MODULE(axiomx, Init)