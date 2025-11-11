#include "fuse_operations.h"
#include <sys/stat.h>
#include <errno.h>
#include <cstring>

fuse_operations_wrapper::fuse_operations_wrapper(napi_env env, napi_ref callback_ref)
  : env_(env), callback_ref_(callback_ref) {
  memset(&ops, 0, sizeof(ops));
  ops.getattr = GetAttr;
  ops.readdir = ReadDir;
  ops.open = Open;
  ops.read = Read;
  ops.write = Write;
  ops.create = Create;
  ops.unlink = Unlink;
  ops.mkdir = MkDir;
  ops.rmdir = RmDir;
  ops.rename = Rename;
  ops.truncate = Truncate;
  g_instance = this;
}

fuse_operations_wrapper::~fuse_operations_wrapper() {
  if (g_instance == this) g_instance = nullptr;
}

fuse_operations_wrapper* fuse_operations_wrapper::GetInstance() {
  return g_instance;
}

napi_value fuse_operations_wrapper::CallJS(const char* op, napi_value* args, size_t argc) {
  napi_value callback, op_name, result;
  napi_get_reference_value(env_, callback_ref_, &callback);
  napi_create_string_utf8(env_, op, NAPI_AUTO_LENGTH, &op_name);
  
  napi_value argv[10];
  argv[0] = op_name;
  for (size_t i = 0; i < argc && i < 9; i++) argv[i + 1] = args[i];
  
  if (napi_call_function(env_, nullptr, callback, argc + 1, argv, &result) != napi_ok) {
    napi_get_undefined(env_, &result);
  }
  return result;
  }
  
int fuse_operations_wrapper::GetIntResult(napi_value result, int default_err) {
  napi_valuetype type;
  napi_typeof(env_, result, &type);
  if (type == napi_number) {
    int32_t num;
    napi_get_value_int32(env_, result, &num);
    return num;
  }
  return default_err;
}

#ifdef __APPLE__
int fuse_operations_wrapper::GetAttr(const char* path, struct fuse_darwin_attr* attr, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w || !attr) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  napi_value result = w->CallJS("getattr", args, 1);
  
  napi_value stat_arr;
  bool is_array = false;
  if (napi_get_named_property(w->env_, result, "stat", &stat_arr) == napi_ok && 
      napi_is_array(w->env_, stat_arr, &is_array) == napi_ok && is_array) {
      uint32_t len;
    napi_get_array_length(w->env_, stat_arr, &len);
    if (len >= 13) {
      int64_t vals[13];
      for (uint32_t i = 0; i < 13; i++) {
        napi_value elem;
        napi_get_element(w->env_, stat_arr, i, &elem);
        napi_get_value_int64(w->env_, elem, &vals[i]);
      }
      memset(attr, 0, sizeof(struct fuse_darwin_attr));
      // Map to fuse_darwin_attr structure
      // vals[0] = mode, vals[1] = ino, vals[2] = dev, vals[3] = nlink
      // vals[4] = uid, vals[5] = gid, vals[6] = rdev, vals[7] = size
      // vals[8] = atime, vals[9] = mtime, vals[10] = ctime
      // vals[11] = blksize, vals[12] = blocks
      attr->mode = vals[0];
      attr->ino = vals[1];
      attr->nlink = vals[3];
      attr->uid = vals[4];
      attr->gid = vals[5];
      attr->rdev = vals[6];
      attr->size = vals[7];
      attr->blksize = vals[11];
      attr->blocks = vals[12];
      // Map timespec structures
      attr->atimespec.tv_sec = vals[8];
      attr->atimespec.tv_nsec = 0;
      attr->mtimespec.tv_sec = vals[9];
      attr->mtimespec.tv_nsec = 0;
      attr->ctimespec.tv_sec = vals[10];
      attr->ctimespec.tv_nsec = 0;
      return 0;
    }
  }
  return -ENOENT;
}
#else
int fuse_operations_wrapper::GetAttr(const char* path, struct stat* stbuf, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w || !stbuf) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  napi_value result = w->CallJS("getattr", args, 1);
  
  napi_value stat_arr;
  bool is_array = false;
  if (napi_get_named_property(w->env_, result, "stat", &stat_arr) == napi_ok && 
      napi_is_array(w->env_, stat_arr, &is_array) == napi_ok && is_array) {
      uint32_t len;
    napi_get_array_length(w->env_, stat_arr, &len);
    if (len >= 13) {
      int64_t vals[13];
      for (uint32_t i = 0; i < 13; i++) {
        napi_value elem;
        napi_get_element(w->env_, stat_arr, i, &elem);
        napi_get_value_int64(w->env_, elem, &vals[i]);
      }
      memset(stbuf, 0, sizeof(struct stat));
      stbuf->st_mode = vals[0]; stbuf->st_ino = vals[1]; stbuf->st_dev = vals[2];
      stbuf->st_nlink = vals[3]; stbuf->st_uid = vals[4]; stbuf->st_gid = vals[5];
      stbuf->st_rdev = vals[6]; stbuf->st_size = vals[7]; stbuf->st_atime = vals[8];
      stbuf->st_mtime = vals[9]; stbuf->st_ctime = vals[10];
      stbuf->st_blksize = vals[11]; stbuf->st_blocks = vals[12];
      return 0;
    }
  }
  return -ENOENT;
}
#endif

#ifdef __APPLE__
int fuse_operations_wrapper::ReadDir(const char* path, void* buf, fuse_darwin_fill_dir_t filler,
                                     off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  napi_value result = w->CallJS("readdir", args, 1);
  
  bool is_array = false;
  if (napi_is_array(w->env_, result, &is_array) == napi_ok && is_array) {
    uint32_t len;
    napi_get_array_length(w->env_, result, &len);
    for (uint32_t i = 0; i < len; i++) {
      napi_value entry, name_val;
      napi_get_element(w->env_, result, i, &entry);
      if (napi_get_named_property(w->env_, entry, "name", &name_val) == napi_ok) {
      char name[256];
      size_t name_len;
        napi_get_value_string_utf8(w->env_, name_val, name, sizeof(name), &name_len);
      filler(buf, name, nullptr, 0, (fuse_fill_dir_flags)0);
      }
    }
    return 0;
  }
  return -ENOENT;
}
#else
int fuse_operations_wrapper::ReadDir(const char* path, void* buf, fuse_fill_dir_t filler,
                                     off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  napi_value result = w->CallJS("readdir", args, 1);
  
  bool is_array = false;
  if (napi_is_array(w->env_, result, &is_array) == napi_ok && is_array) {
    uint32_t len;
    napi_get_array_length(w->env_, result, &len);
    for (uint32_t i = 0; i < len; i++) {
      napi_value entry, name_val;
      napi_get_element(w->env_, result, i, &entry);
      if (napi_get_named_property(w->env_, entry, "name", &name_val) == napi_ok) {
      char name[256];
      size_t name_len;
        napi_get_value_string_utf8(w->env_, name_val, name, sizeof(name), &name_len);
      filler(buf, name, nullptr, 0, (fuse_fill_dir_flags)0);
      }
    }
    return 0;
  }
  return -ENOENT;
}
#endif

int fuse_operations_wrapper::Open(const char* path, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, flags_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_int32(w->env_, fi->flags, &flags_val);
  napi_value args[] = { path_val, flags_val };
  return w->GetIntResult(w->CallJS("open", args, 2));
}

int fuse_operations_wrapper::Read(const char* path, char* buf, size_t size, off_t offset, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, size_val, offset_val, buffer;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(w->env_, size, &size_val);
  napi_create_int64(w->env_, offset, &offset_val);
  napi_create_buffer(w->env_, size, nullptr, &buffer);
  
  napi_value args[] = { path_val, buffer, offset_val, size_val };
  napi_value result = w->CallJS("read", args, 4);
  
  void* data;
  size_t data_len;
  if (napi_get_buffer_info(w->env_, result, &data, &data_len) == napi_ok) {
    size_t copy_len = data_len < size ? data_len : size;
    memcpy(buf, data, copy_len);
    return copy_len;
  }
  return -EIO;
}

int fuse_operations_wrapper::Write(const char* path, const char* buf, size_t size, off_t offset, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, size_val, offset_val, buffer;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(w->env_, size, &size_val);
  napi_create_int64(w->env_, offset, &offset_val);
  napi_create_buffer_copy(w->env_, size, buf, nullptr, &buffer);
  
  napi_value args[] = { path_val, buffer, offset_val, size_val };
  int32_t bytes_written;
  napi_value result = w->CallJS("write", args, 4);
  if (napi_get_value_int32(w->env_, result, &bytes_written) == napi_ok && bytes_written > 0) {
    return bytes_written;
  }
  return -EIO;
}

int fuse_operations_wrapper::Create(const char* path, mode_t mode, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, mode_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(w->env_, mode, &mode_val);
  napi_value args[] = { path_val, mode_val };
  return w->GetIntResult(w->CallJS("create", args, 2));
}

int fuse_operations_wrapper::Unlink(const char* path) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  return w->GetIntResult(w->CallJS("unlink", args, 1));
}

int fuse_operations_wrapper::MkDir(const char* path, mode_t mode) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, mode_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(w->env_, mode, &mode_val);
  napi_value args[] = { path_val, mode_val };
  return w->GetIntResult(w->CallJS("mkdir", args, 2));
}

int fuse_operations_wrapper::RmDir(const char* path) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_value args[] = { path_val };
  return w->GetIntResult(w->CallJS("rmdir", args, 1));
}

int fuse_operations_wrapper::Rename(const char* oldpath, const char* newpath, unsigned int flags) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value oldpath_val, newpath_val;
  napi_create_string_utf8(w->env_, oldpath, NAPI_AUTO_LENGTH, &oldpath_val);
  napi_create_string_utf8(w->env_, newpath, NAPI_AUTO_LENGTH, &newpath_val);
  napi_value args[] = { oldpath_val, newpath_val };
  return w->GetIntResult(w->CallJS("rename", args, 2));
}

int fuse_operations_wrapper::Truncate(const char* path, off_t length, struct fuse_file_info* fi) {
  auto* w = GetInstance();
  if (!w) return -EIO;
  
  napi_value path_val, length_val;
  napi_create_string_utf8(w->env_, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_int64(w->env_, length, &length_val);
  napi_value args[] = { path_val, length_val };
  return w->GetIntResult(w->CallJS("truncate", args, 2));
}
