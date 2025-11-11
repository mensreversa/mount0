#ifndef FUSE_OPERATIONS_H
#define FUSE_OPERATIONS_H

#include <node_api.h>
#include <errno.h>
#define FUSE_USE_VERSION 35
#include <fuse3/fuse.h>

class fuse_operations_wrapper {
public:
  fuse_operations_wrapper(napi_env env, napi_ref callback_ref);
  ~fuse_operations_wrapper();
  
  struct fuse_operations* get_operations() { return &ops; }
  
  static fuse_operations_wrapper* GetInstance();
  
#ifdef __APPLE__
  static int GetAttr(const char* path, struct fuse_darwin_attr* attr, struct fuse_file_info* fi);
  static int ReadDir(const char* path, void* buf, fuse_darwin_fill_dir_t filler,
                     off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags);
#else
  static int GetAttr(const char* path, struct stat* stbuf, struct fuse_file_info* fi);
  static int ReadDir(const char* path, void* buf, fuse_fill_dir_t filler,
                     off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags);
#endif
  static int Open(const char* path, struct fuse_file_info* fi);
  static int Read(const char* path, char* buf, size_t size, off_t offset, struct fuse_file_info* fi);
  static int Write(const char* path, const char* buf, size_t size, off_t offset, struct fuse_file_info* fi);
  static int Create(const char* path, mode_t mode, struct fuse_file_info* fi);
  static int Unlink(const char* path);
  static int MkDir(const char* path, mode_t mode);
  static int RmDir(const char* path);
  static int Rename(const char* oldpath, const char* newpath, unsigned int flags);
  static int Truncate(const char* path, off_t length, struct fuse_file_info* fi);

private:
  napi_env env_;
  napi_ref callback_ref_;
  struct fuse_operations ops;
  
  napi_value CallJS(const char* op, napi_value* args, size_t argc);
  int GetIntResult(napi_value result, int default_err = -EIO);
};

static fuse_operations_wrapper* g_instance = nullptr;

#endif
