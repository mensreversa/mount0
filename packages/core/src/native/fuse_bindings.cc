#include <node_api.h>
#define FUSE_USE_VERSION 35
#include <fuse3/fuse.h>
#include <string>
#include "fuse_operations.h"

static napi_ref g_fs_callback_ref = nullptr;
static fuse_operations_wrapper* g_ops = nullptr;

napi_value InitFuse(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 3) {
    napi_throw_error(env, nullptr, "Expected 3 arguments: mountpoint, options, callback");
    return nullptr;
  }

  char mountpoint[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[0], mountpoint, sizeof(mountpoint), &len);

  napi_create_reference(env, args[2], 1, &g_fs_callback_ref);
  if (g_ops) delete g_ops;
  g_ops = new fuse_operations_wrapper(env, g_fs_callback_ref);

  struct fuse_args fargs = FUSE_ARGS_INIT(0, nullptr);
  
  napi_valuetype value_type;
  if (napi_typeof(env, args[1], &value_type) == napi_ok && value_type == napi_object) {
    napi_value property_names;
    if (napi_get_property_names(env, args[1], &property_names) == napi_ok) {
      uint32_t key_count;
      napi_get_array_length(env, property_names, &key_count);
      
      for (uint32_t i = 0; i < key_count; i++) {
        napi_value key, value;
        napi_get_element(env, property_names, i, &key);
        
        char key_str[256], value_str[256];
        size_t key_len, value_len;
        napi_get_value_string_utf8(env, key, key_str, sizeof(key_str), &key_len);
        napi_get_property(env, args[1], key, &value);
        napi_get_value_string_utf8(env, value, value_str, sizeof(value_str), &value_len);
        
        std::string opt = std::string(key_str) + "=" + std::string(value_str);
        fuse_opt_add_arg(&fargs, opt.c_str());
      }
    }
  }

  fuse_opt_add_arg(&fargs, mountpoint);
  struct fuse* fuse_instance = fuse_new(&fargs, g_ops->get_operations(), 
                                        sizeof(struct fuse_operations), nullptr);
  
  if (!fuse_instance) {
    napi_throw_error(env, nullptr, "Failed to create fuse instance");
    fuse_opt_free_args(&fargs);
    return nullptr;
  }

  if (fuse_mount(fuse_instance, mountpoint) != 0) {
    napi_throw_error(env, nullptr, "Failed to mount fuse filesystem");
    fuse_destroy(fuse_instance);
    fuse_opt_free_args(&fargs);
    return nullptr;
  }

  napi_value result, fuse_handle;
  napi_create_object(env, &result);
  napi_create_int64(env, reinterpret_cast<int64_t>(fuse_instance), &fuse_handle);
  napi_set_named_property(env, result, "handle", fuse_handle);
  fuse_opt_free_args(&fargs);
  return result;
}

napi_value LoopFuse(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1], handle_prop;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 1 || napi_get_named_property(env, args[0], "handle", &handle_prop) != napi_ok) {
    napi_throw_error(env, nullptr, "Expected fuse handle");
    return nullptr;
  }

  int64_t handle_val;
  napi_get_value_int64(env, handle_prop, &handle_val);
  int ret = fuse_loop(reinterpret_cast<struct fuse*>(handle_val));
  
  napi_value result;
  napi_create_int32(env, ret, &result);
  return result;
}

napi_value UnmountFuse(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1], handle_prop;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 1 || napi_get_named_property(env, args[0], "handle", &handle_prop) != napi_ok) {
    napi_throw_error(env, nullptr, "Expected fuse handle");
    return nullptr;
  }

  int64_t handle_val;
  napi_get_value_int64(env, handle_prop, &handle_val);
  fuse_unmount(reinterpret_cast<struct fuse*>(handle_val));
  fuse_destroy(reinterpret_cast<struct fuse*>(handle_val));
  
  if (g_fs_callback_ref) {
    napi_delete_reference(env, g_fs_callback_ref);
    g_fs_callback_ref = nullptr;
  }
  if (g_ops) {
    delete g_ops;
    g_ops = nullptr;
  }
  
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    {"init", nullptr, InitFuse, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"loop", nullptr, LoopFuse, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"unmount", nullptr, UnmountFuse, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 3, desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
