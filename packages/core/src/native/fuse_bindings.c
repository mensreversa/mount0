#include <node_api.h>
#ifndef FUSE_USE_VERSION
#define FUSE_USE_VERSION 35
#endif
#include <fuse3/fuse_lowlevel.h>
#include <fuse3/fuse_opt.h>
#include <string.h>
#include <stdlib.h>
#include <pthread.h>
#include <sys/stat.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>

static napi_threadsafe_function tsfn = NULL;
static napi_env g_env = NULL;
static struct fuse_session *g_session = NULL;
static pthread_t fuse_thread;

struct req {
  fuse_req_t req;
  uint64_t id;
  napi_ref params_ref;
  struct req *next;
};

static struct req *reqs = NULL;
static pthread_mutex_t req_mutex = PTHREAD_MUTEX_INITIALIZER;
static uint64_t next_id = 1;

static int is_debug_enabled(void) {
  const char *debug = getenv("MOUNT0_DEBUG");
  return debug && debug[0] == '1' && debug[1] == '\0';
}

static void debug_log(const char *op, const char *fmt, ...) {
  if (!is_debug_enabled()) return;
  fprintf(stderr, "[FUSE:%s] ", op);
  va_list args;
  va_start(args, fmt);
  vfprintf(stderr, fmt, args);
  va_end(args);
  fprintf(stderr, "\n");
}

static void call_js(napi_env env, napi_value js_cb, void *context, void *data) {
  struct req *r = (struct req *)data;
  if (!env || !js_cb || !r) return;
  
  napi_value id, params;
  napi_create_double(env, (double)r->id, &id);
  napi_get_reference_value(env, r->params_ref, &params);
  
  napi_value argv[] = {id, params};
  napi_call_function(env, js_cb, js_cb, 2, argv, NULL);
}

static void send_to_js(fuse_req_t req, napi_value params) {
  struct req *r = malloc(sizeof(struct req));
  r->req = req;
  r->id = __sync_fetch_and_add(&next_id, 1);
  napi_create_reference(g_env, params, 1, &r->params_ref);
  
  pthread_mutex_lock(&req_mutex);
  r->next = reqs;
  reqs = r;
  pthread_mutex_unlock(&req_mutex);
  
  if (napi_call_threadsafe_function(tsfn, r, napi_tsfn_nonblocking) != napi_ok) {
    debug_log("send_to_js", "ERROR: Failed to call threadsafe function for req id=%lu", (unsigned long)r->id);
    pthread_mutex_lock(&req_mutex);
    reqs = r->next;
    pthread_mutex_unlock(&req_mutex);
    napi_delete_reference(g_env, r->params_ref);
    free(r);
    fuse_reply_err(req, EIO);
  } else {
    debug_log("send_to_js", "Sent request id=%lu to JS", (unsigned long)r->id);
  }
}

static struct req *find_and_remove_req(uint64_t id) {
  pthread_mutex_lock(&req_mutex);
  struct req *r = reqs, *prev = NULL;
  while (r) {
    if (r->id == id) {
      if (prev) prev->next = r->next;
      else reqs = r->next;
      pthread_mutex_unlock(&req_mutex);
      return r;
    }
    prev = r;
    r = r->next;
  }
  pthread_mutex_unlock(&req_mutex);
  return NULL;
}

static void fuse_lookup(fuse_req_t req, fuse_ino_t parent, const char *name) {
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  debug_log("lookup", "parent=%lu name=%s path=%s", (unsigned long)parent, name, path);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val;
  napi_create_string_utf8(g_env, "lookup", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  send_to_js(req, params);
}

static void fuse_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  debug_log("getattr", "ino=%lu", (unsigned long)ino);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val;
  napi_create_string_utf8(g_env, "getattr", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  send_to_js(req, params);
}

static char *dirbuf = NULL;
static size_t dirbuf_size = 0;
static size_t dirbuf_used = 0;

static int dirbuf_add(fuse_req_t req, const char *name) {
#ifdef __APPLE__
  struct fuse_darwin_attr attr = {0};
  attr.ino = 1;
  attr.mode = S_IFDIR | 0755;
  const struct fuse_darwin_attr *attr_ptr = &attr;
#else
  struct stat st = {0};
  st.st_ino = 1;
  st.st_mode = S_IFDIR | 0755;
  const struct stat *attr_ptr = &st;
#endif
  
  size_t addsize = fuse_add_direntry(req, NULL, 0, name, NULL, 0);
  if (dirbuf_used + addsize > dirbuf_size) {
    dirbuf_size = dirbuf_used + addsize + 4096;
    dirbuf = realloc(dirbuf, dirbuf_size);
  }
  
  fuse_add_direntry(req, dirbuf + dirbuf_used, addsize, name, attr_ptr, dirbuf_used + addsize);
  dirbuf_used += addsize;
  return 0;
}

static void fuse_readdir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
  debug_log("readdir", "ino=%lu size=%zu offset=%ld", (unsigned long)ino, size, (long)off);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val;
  napi_create_string_utf8(g_env, "readdir", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  send_to_js(req, params);
}

static void fuse_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  debug_log("open", "ino=%lu flags=0x%x", (unsigned long)ino, fi->flags);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, flags_val;
  napi_create_string_utf8(g_env, "open", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, fi->flags, &flags_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "flags", flags_val);
  send_to_js(req, params);
}

static void fuse_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
  debug_log("read", "ino=%lu size=%zu offset=%ld", (unsigned long)ino, size, (long)off);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, size_val, offset_val;
  napi_create_string_utf8(g_env, "read", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_double(g_env, (double)size, &size_val);
  napi_create_double(g_env, (double)off, &offset_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "size", size_val);
  napi_set_named_property(g_env, params, "offset", offset_val);
  send_to_js(req, params);
}

static void fuse_write(fuse_req_t req, fuse_ino_t ino, const char *buf, size_t size, off_t off, struct fuse_file_info *fi) {
  debug_log("write", "ino=%lu size=%zu offset=%ld", (unsigned long)ino, size, (long)off);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, data_val, size_val, offset_val;
  napi_create_string_utf8(g_env, "write", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_string_utf8(g_env, buf, size, &data_val);
  napi_create_double(g_env, (double)size, &size_val);
  napi_create_double(g_env, (double)off, &offset_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "data", data_val);
  napi_set_named_property(g_env, params, "size", size_val);
  napi_set_named_property(g_env, params, "offset", offset_val);
  send_to_js(req, params);
}

static void fuse_create(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, struct fuse_file_info *fi) {
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  debug_log("create", "parent=%lu name=%s path=%s mode=0%o", (unsigned long)parent, name, path, mode);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, mode_val;
  napi_create_string_utf8(g_env, "create", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, mode, &mode_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "mode", mode_val);
  send_to_js(req, params);
}

static void fuse_unlink(fuse_req_t req, fuse_ino_t parent, const char *name) {
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  debug_log("unlink", "parent=%lu name=%s path=%s", (unsigned long)parent, name, path);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val;
  napi_create_string_utf8(g_env, "unlink", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  send_to_js(req, params);
}

static void fuse_mkdir(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode) {
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  debug_log("mkdir", "parent=%lu name=%s path=%s mode=0%o", (unsigned long)parent, name, path, mode);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, mode_val;
  napi_create_string_utf8(g_env, "mkdir", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, mode, &mode_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "mode", mode_val);
  send_to_js(req, params);
}

static void fuse_rmdir(fuse_req_t req, fuse_ino_t parent, const char *name) {
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  debug_log("rmdir", "parent=%lu name=%s path=%s", (unsigned long)parent, name, path);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val;
  napi_create_string_utf8(g_env, "rmdir", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  send_to_js(req, params);
}

static void fuse_rename(fuse_req_t req, fuse_ino_t parent, const char *name, fuse_ino_t newparent, const char *newname, unsigned int flags) {
  char oldpath[1024], newpath[1024];
  snprintf(oldpath, sizeof(oldpath), "/%s", name);
  snprintf(newpath, sizeof(newpath), "/%s", newname);
  debug_log("rename", "parent=%lu name=%s newparent=%lu newname=%s oldpath=%s newpath=%s flags=0x%x", 
            (unsigned long)parent, name, (unsigned long)newparent, newname, oldpath, newpath, flags);
  
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, oldpath_val, newpath_val;
  napi_create_string_utf8(g_env, "rename", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, oldpath, NAPI_AUTO_LENGTH, &oldpath_val);
  napi_create_string_utf8(g_env, newpath, NAPI_AUTO_LENGTH, &newpath_val);
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "oldpath", oldpath_val);
  napi_set_named_property(g_env, params, "newpath", newpath_val);
  send_to_js(req, params);
}

#ifdef __APPLE__
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct fuse_darwin_attr *attr, int to_set, struct fuse_file_info *fi) {
  debug_log("truncate", "ino=%lu size=%llu to_set=0x%x", (unsigned long)ino, (unsigned long long)attr->size, to_set);
#else
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct stat *attr, int to_set, struct fuse_file_info *fi) {
  debug_log("truncate", "ino=%lu size=%ld to_set=0x%x", (unsigned long)ino, (long)attr->st_size, to_set);
#endif
  napi_value params;
  napi_create_object(g_env, &params);
  napi_value op_val, path_val, length_val;
  napi_create_string_utf8(g_env, "truncate", NAPI_AUTO_LENGTH, &op_val);
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
#ifdef __APPLE__
  napi_create_double(g_env, (double)attr->size, &length_val);
#else
  napi_create_double(g_env, (double)attr->st_size, &length_val);
#endif
  napi_set_named_property(g_env, params, "op", op_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "length", length_val);
  send_to_js(req, params);
}

static void *fuse_loop_thread(void *arg) {
  struct fuse_session *se = (struct fuse_session *)arg;
  fuse_session_loop(se);
  return NULL;
}

static napi_value fuse_napi_mount(napi_env env, napi_callback_info info) {
  napi_value args[3];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  char mountpoint[256];
  napi_get_value_string_utf8(env, args[0], mountpoint, sizeof(mountpoint), NULL);
  
  if (is_debug_enabled()) {
    fprintf(stderr, "[FUSE:mount] Mounting filesystem at %s\n", mountpoint);
  }
  
  g_env = env;
  napi_value resource_name;
  napi_create_string_utf8(env, "fuse", NAPI_AUTO_LENGTH, &resource_name);
  napi_create_threadsafe_function(env, args[2], NULL, resource_name, 0, 1, NULL, NULL, NULL, call_js, &tsfn);
  
  struct fuse_lowlevel_ops ops = {0};
  ops.lookup = fuse_lookup;
  ops.getattr = fuse_getattr;
  ops.readdir = fuse_readdir;
  ops.open = fuse_open;
  ops.read = fuse_read;
  ops.write = fuse_write;
  ops.create = fuse_create;
  ops.unlink = fuse_unlink;
  ops.mkdir = fuse_mkdir;
  ops.rmdir = fuse_rmdir;
  ops.rename = fuse_rename;
  ops.setattr = fuse_setattr;
  
  // Initialize fuse_args with program name only
  // Low-level API doesn't use mount options in the same way
  struct fuse_args fargs = FUSE_ARGS_INIT(0, NULL);
  fuse_opt_add_arg(&fargs, "mount0");
  
  g_session = fuse_session_new(&fargs, &ops, sizeof(ops), NULL);
  if (!g_session) {
    debug_log("mount", "ERROR: Failed to create fuse session");
    fuse_opt_free_args(&fargs);
    napi_throw_error(env, NULL, "Failed to create fuse session");
    return NULL;
  }
  
  if (fuse_session_mount(g_session, mountpoint) != 0) {
    debug_log("mount", "ERROR: Failed to mount fuse filesystem at %s", mountpoint);
    fuse_session_destroy(g_session);
    g_session = NULL;
    fuse_opt_free_args(&fargs);
    napi_throw_error(env, NULL, "Failed to mount fuse filesystem");
    return NULL;
  }
  
  fuse_opt_free_args(&fargs);
  pthread_create(&fuse_thread, NULL, fuse_loop_thread, g_session);
  
  debug_log("mount", "Successfully mounted at %s", mountpoint);
  
  napi_value result;
  napi_create_string_utf8(env, "mounted", NAPI_AUTO_LENGTH, &result);
  return result;
}

static void fuse_parse_stat(napi_env env, napi_value stat_obj, struct stat *st) {
  napi_value val;
  int64_t num_val;
  
  napi_get_named_property(env, stat_obj, "mode", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_mode = (mode_t)num_val;
  
  napi_get_named_property(env, stat_obj, "ino", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_ino = (ino_t)num_val;
  
  napi_get_named_property(env, stat_obj, "dev", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_dev = (dev_t)num_val;
  
  napi_get_named_property(env, stat_obj, "nlink", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_nlink = (nlink_t)num_val;
  
  napi_get_named_property(env, stat_obj, "uid", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_uid = (uid_t)num_val;
  
  napi_get_named_property(env, stat_obj, "gid", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_gid = (gid_t)num_val;
  
  napi_get_named_property(env, stat_obj, "rdev", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_rdev = (dev_t)num_val;
  
  napi_get_named_property(env, stat_obj, "size", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_size = (off_t)num_val;
  
  napi_get_named_property(env, stat_obj, "atime", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_atime = (time_t)num_val;
  
  napi_get_named_property(env, stat_obj, "mtime", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_mtime = (time_t)num_val;
  
  napi_get_named_property(env, stat_obj, "ctime", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_ctime = (time_t)num_val;
  
  napi_get_named_property(env, stat_obj, "blksize", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_blksize = (blksize_t)num_val;
  
  napi_get_named_property(env, stat_obj, "blocks", &val);
  napi_get_value_int64(env, val, &num_val);
  st->st_blocks = (blkcnt_t)num_val;
}

static napi_value fuse_napi_reply_err(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int, errno_val;
  napi_get_value_int64(env, args[0], &id_int);
  napi_get_value_int64(env, args[1], &errno_val);
  
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_err", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  debug_log("reply_err", "id=%ld errno=%ld", (long)id_int, (long)errno_val);
  fuse_reply_err(r->req, (int)errno_val);
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_lookup(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int;
  napi_get_value_int64(env, args[0], &id_int);
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_lookup", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  debug_log("reply_lookup", "id=%ld", (long)id_int);
  
  struct stat st = {0};
  fuse_parse_stat(env, args[1], &st);
#ifdef __APPLE__
  struct fuse_darwin_entry_param e = {0};
  e.ino = st.st_ino;
  e.attr.mode = st.st_mode;
  e.attr.ino = st.st_ino;
  e.attr.nlink = st.st_nlink;
  e.attr.uid = st.st_uid;
  e.attr.gid = st.st_gid;
  e.attr.rdev = st.st_rdev;
  e.attr.size = st.st_size;
  e.attr.blksize = st.st_blksize;
  e.attr.blocks = st.st_blocks;
  e.attr.atimespec.tv_sec = st.st_atime;
  e.attr.mtimespec.tv_sec = st.st_mtime;
  e.attr.ctimespec.tv_sec = st.st_ctime;
  e.attr_timeout = 1.0;
  e.entry_timeout = 1.0;
  fuse_reply_entry(r->req, &e);
#else
  struct fuse_entry_param e = {0};
  e.ino = st.st_ino;
  e.attr = st;
  e.attr_timeout = 1.0;
  e.entry_timeout = 1.0;
  fuse_reply_entry(r->req, &e);
#endif
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_getattr(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int;
  napi_get_value_int64(env, args[0], &id_int);
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_getattr", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  debug_log("reply_getattr", "id=%ld", (long)id_int);
  
  struct stat st = {0};
  fuse_parse_stat(env, args[1], &st);
#ifdef __APPLE__
  struct fuse_darwin_attr attr = {0};
  attr.mode = st.st_mode;
  attr.ino = st.st_ino;
  attr.nlink = st.st_nlink;
  attr.uid = st.st_uid;
  attr.gid = st.st_gid;
  attr.rdev = st.st_rdev;
  attr.size = st.st_size;
  attr.blksize = st.st_blksize;
  attr.blocks = st.st_blocks;
  attr.atimespec.tv_sec = st.st_atime;
  attr.mtimespec.tv_sec = st.st_mtime;
  attr.ctimespec.tv_sec = st.st_ctime;
  fuse_reply_attr(r->req, &attr, 1.0);
#else
  fuse_reply_attr(r->req, &st, 1.0);
#endif
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_readdir(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int;
  napi_get_value_int64(env, args[0], &id_int);
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_readdir", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  uint32_t length;
  napi_get_array_length(env, args[1], &length);
  debug_log("reply_readdir", "id=%ld entries=%u", (long)id_int, length);
  
  dirbuf_used = 0;
  for (uint32_t i = 0; i < length; i++) {
    napi_value elem;
    napi_get_element(env, args[1], i, &elem);
    char name[256];
    size_t name_len;
    napi_get_value_string_utf8(env, elem, name, sizeof(name), &name_len);
    if (name_len > 0) {
      dirbuf_add(r->req, name);
    }
  }
  fuse_reply_buf(r->req, dirbuf, dirbuf_used);
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_read(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int;
  napi_get_value_int64(env, args[0], &id_int);
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_read", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  char result[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[1], result, sizeof(result), &len);
  
  debug_log("reply_read", "id=%ld bytes=%zu", (long)id_int, len);
  fuse_reply_buf(r->req, result, len);
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_write(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int, bytes;
  napi_get_value_int64(env, args[0], &id_int);
  napi_get_value_int64(env, args[1], &bytes);
  
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_write", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  debug_log("reply_write", "id=%ld bytes=%ld", (long)id_int, (long)bytes);
  fuse_reply_write(r->req, (size_t)bytes);
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_reply_int(napi_env env, napi_callback_info info) {
  napi_value args[2];
  napi_get_cb_info(env, info, NULL, args, NULL, NULL);
  
  int64_t id_int, val;
  napi_get_value_int64(env, args[0], &id_int);
  napi_get_value_int64(env, args[1], &val);
  
  struct req *r = find_and_remove_req((uint64_t)id_int);
  if (!r) {
    debug_log("reply_int", "WARNING: Request id=%ld not found", (long)id_int);
    return NULL;
  }
  
  debug_log("reply_int", "id=%ld val=%ld", (long)id_int, (long)val);
  fuse_reply_err(r->req, val == 0 ? 0 : (int)-val);
  napi_delete_reference(env, r->params_ref);
  free(r);
  return NULL;
}

static napi_value fuse_napi_unmount(napi_env env, napi_callback_info info) {
  debug_log("unmount", "Unmounting filesystem");
  if (g_session) {
    fuse_session_unmount(g_session);
    fuse_session_destroy(g_session);
    g_session = NULL;
  }
  if (tsfn) {
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    tsfn = NULL;
  }
  return NULL;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    {"mount", NULL, fuse_napi_mount, NULL, NULL, NULL, napi_default, NULL},
    {"reply_err", NULL, fuse_napi_reply_err, NULL, NULL, NULL, napi_default, NULL},
    {"reply_lookup", NULL, fuse_napi_reply_lookup, NULL, NULL, NULL, napi_default, NULL},
    {"reply_getattr", NULL, fuse_napi_reply_getattr, NULL, NULL, NULL, napi_default, NULL},
    {"reply_readdir", NULL, fuse_napi_reply_readdir, NULL, NULL, NULL, napi_default, NULL},
    {"reply_read", NULL, fuse_napi_reply_read, NULL, NULL, NULL, napi_default, NULL},
    {"reply_write", NULL, fuse_napi_reply_write, NULL, NULL, NULL, napi_default, NULL},
    {"reply_open", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_create", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_unlink", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_mkdir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_rmdir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_rename", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_truncate", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"unmount", NULL, fuse_napi_unmount, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, 15, desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
