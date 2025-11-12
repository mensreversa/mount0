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

static napi_threadsafe_function tsfn = NULL;
static napi_env g_env = NULL;
static struct fuse_session *g_session = NULL;
static pthread_t fuse_thread;
static int fuse_running = 0;

struct pending_req {
  fuse_req_t req;
  char op[32];
  uint64_t id;
  struct pending_req *next;
};

static struct pending_req *pending_reqs = NULL;
static pthread_mutex_t req_mutex = PTHREAD_MUTEX_INITIALIZER;
static uint64_t next_id = 1;

struct req_data {
  uint64_t id;
  char op[32];
  napi_ref params_ref;
};

static void call_js(napi_env env, napi_value js_cb, void *context, void *data) {
  struct req_data *rd = (struct req_data *)data;
  if (env == NULL || js_cb == NULL || rd == NULL) return;
  
  napi_value id, op, params;
  napi_create_double(env, (double)rd->id, &id);
  napi_create_string_utf8(env, rd->op, NAPI_AUTO_LENGTH, &op);
  
  // Get params from reference
  napi_get_reference_value(env, rd->params_ref, &params);
  
  napi_value argv[] = {id, op, params};
  napi_call_function(env, js_cb, js_cb, 3, argv, NULL);
  
  // Delete reference and free
  napi_delete_reference(env, rd->params_ref);
  free(rd);
}

static void add_pending_req(fuse_req_t req, const char *op, uint64_t id) {
  struct pending_req *preq = malloc(sizeof(struct pending_req));
  preq->req = req;
  preq->id = id;
  strncpy(preq->op, op, sizeof(preq->op) - 1);
  preq->op[sizeof(preq->op) - 1] = '\0';
  
  pthread_mutex_lock(&req_mutex);
  preq->next = pending_reqs;
  pending_reqs = preq;
  pthread_mutex_unlock(&req_mutex);
}

static struct pending_req *remove_pending_req(uint64_t id) {
  pthread_mutex_lock(&req_mutex);
  struct pending_req *preq = pending_reqs;
  struct pending_req *prev = NULL;
  
  while (preq) {
    if (preq->id == id) {
      if (prev) prev->next = preq->next;
      else pending_reqs = preq->next;
      pthread_mutex_unlock(&req_mutex);
      return preq;
    }
    prev = preq;
    preq = preq->next;
  }
  pthread_mutex_unlock(&req_mutex);
  return NULL;
}

static void send_to_js(fuse_req_t req, const char *op, napi_value params) {
  uint64_t id = __sync_fetch_and_add(&next_id, 1);
  add_pending_req(req, op, id);
  
  struct req_data *rd = malloc(sizeof(struct req_data));
  rd->id = id;
  strncpy(rd->op, op, sizeof(rd->op) - 1);
  rd->op[sizeof(rd->op) - 1] = '\0';
  
  // Create reference to params object
  napi_create_reference(g_env, params, 1, &rd->params_ref);
  
  napi_status status = napi_call_threadsafe_function(tsfn, rd, napi_tsfn_nonblocking);
  if (status != napi_ok) {
    fuse_reply_err(req, EIO);
    remove_pending_req(id);
    napi_delete_reference(g_env, rd->params_ref);
    free(rd);
  }
}

static void fuse_lookup(fuse_req_t req, fuse_ino_t parent, const char *name) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val;
  char path[1024];
  if (parent == FUSE_ROOT_ID) {
    snprintf(path, sizeof(path), "/%s", name);
  } else {
    snprintf(path, sizeof(path), "/%s", name); // Simplified - would need ino->path mapping
  }
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "path", path_val);
  
  send_to_js(req, "lookup", params);
}

static void fuse_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val;
  // For now, treat all inodes as root - would need ino->path mapping for full support
  if (ino == FUSE_ROOT_ID || ino == 1) {
    napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  } else {
    napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  }
  napi_set_named_property(g_env, params, "path", path_val);
  
  send_to_js(req, "getattr", params);
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
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val;
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "path", path_val);
  
  send_to_js(req, "readdir", params);
}

static void fuse_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, flags_val;
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, fi->flags, &flags_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "flags", flags_val);
  
  send_to_js(req, "open", params);
}

static void fuse_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, size_val, offset_val;
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_double(g_env, (double)size, &size_val);
  napi_create_double(g_env, (double)off, &offset_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "size", size_val);
  napi_set_named_property(g_env, params, "offset", offset_val);
  
  send_to_js(req, "read", params);
}

static void fuse_write(fuse_req_t req, fuse_ino_t ino, const char *buf, size_t size, off_t off, struct fuse_file_info *fi) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, data_val, size_val, offset_val;
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
  napi_create_string_utf8(g_env, buf, size, &data_val);
  napi_create_double(g_env, (double)size, &size_val);
  napi_create_double(g_env, (double)off, &offset_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "data", data_val);
  napi_set_named_property(g_env, params, "size", size_val);
  napi_set_named_property(g_env, params, "offset", offset_val);
  
  send_to_js(req, "write", params);
}

static void fuse_create(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, struct fuse_file_info *fi) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, mode_val;
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, mode, &mode_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "mode", mode_val);
  
  send_to_js(req, "create", params);
}

static void fuse_unlink(fuse_req_t req, fuse_ino_t parent, const char *name) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val;
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "path", path_val);
  
  send_to_js(req, "unlink", params);
}

static void fuse_mkdir(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, mode_val;
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_create_uint32(g_env, mode, &mode_val);
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "mode", mode_val);
  
  send_to_js(req, "mkdir", params);
}

static void fuse_rmdir(fuse_req_t req, fuse_ino_t parent, const char *name) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val;
  char path[1024];
  snprintf(path, sizeof(path), "/%s", name);
  napi_create_string_utf8(g_env, path, NAPI_AUTO_LENGTH, &path_val);
  napi_set_named_property(g_env, params, "path", path_val);
  
  send_to_js(req, "rmdir", params);
}

static void fuse_rename(fuse_req_t req, fuse_ino_t parent, const char *name, fuse_ino_t newparent, const char *newname, unsigned int flags) {
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value oldpath_val, newpath_val;
  char oldpath[1024], newpath[1024];
  snprintf(oldpath, sizeof(oldpath), "/%s", name);
  snprintf(newpath, sizeof(newpath), "/%s", newname);
  napi_create_string_utf8(g_env, oldpath, NAPI_AUTO_LENGTH, &oldpath_val);
  napi_create_string_utf8(g_env, newpath, NAPI_AUTO_LENGTH, &newpath_val);
  napi_set_named_property(g_env, params, "oldpath", oldpath_val);
  napi_set_named_property(g_env, params, "newpath", newpath_val);
  
  send_to_js(req, "rename", params);
}

#ifdef __APPLE__
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct fuse_darwin_attr *attr, int to_set, struct fuse_file_info *fi) {
#else
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct stat *attr, int to_set, struct fuse_file_info *fi) {
#endif
  napi_value params;
  napi_create_object(g_env, &params);
  
  napi_value path_val, length_val;
  napi_create_string_utf8(g_env, "/", NAPI_AUTO_LENGTH, &path_val);
#ifdef __APPLE__
  napi_create_double(g_env, (double)attr->size, &length_val);
#else
  napi_create_double(g_env, (double)attr->st_size, &length_val);
#endif
  napi_set_named_property(g_env, params, "path", path_val);
  napi_set_named_property(g_env, params, "length", length_val);
  
  send_to_js(req, "truncate", params);
}

static void *fuse_loop_thread(void *arg) {
  struct fuse_session *se = (struct fuse_session *)arg;
  fuse_session_loop(se);
  return NULL;
}

static napi_value Mount(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  char mountpoint[256];
  size_t len;
  napi_get_value_string_utf8(env, args[0], mountpoint, sizeof(mountpoint), &len);
  
  g_env = env;
  napi_value handler = args[2];
  napi_value resource_name;
  napi_create_string_utf8(env, "fuse", NAPI_AUTO_LENGTH, &resource_name);
  napi_create_threadsafe_function(env, handler, NULL, resource_name, 0, 1, NULL, NULL, NULL, call_js, &tsfn);
  
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
    fuse_opt_free_args(&fargs);
    napi_throw_error(env, NULL, "Failed to create fuse session");
    return NULL;
  }
  
  if (fuse_session_mount(g_session, mountpoint) != 0) {
    fuse_session_destroy(g_session);
    g_session = NULL;
    fuse_opt_free_args(&fargs);
    napi_throw_error(env, NULL, "Failed to mount fuse filesystem");
    return NULL;
  }
  
  fuse_opt_free_args(&fargs);
  
  fuse_running = 1;
  pthread_create(&fuse_thread, NULL, fuse_loop_thread, g_session);
  
  napi_value result;
  napi_create_string_utf8(env, "mounted", NAPI_AUTO_LENGTH, &result);
  return result;
}

static napi_value Resolve(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  int64_t id_int;
  napi_get_value_int64(env, args[0], &id_int);
  uint64_t id = (uint64_t)id_int;
  
  char result[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[1], result, sizeof(result), &len);
  
  struct pending_req *preq = remove_pending_req(id);
  if (!preq) return NULL;
  
  fuse_req_t req = preq->req;
  const char *op = preq->op;
  
  if (result[0] == '-') {
    int errno_val = atoi(result + 1);
    fuse_reply_err(req, errno_val);
  } else if (strcmp(op, "lookup") == 0) {
    if (strcmp(result, "ENOENT") == 0) {
      fuse_reply_err(req, ENOENT);
    } else {
      struct stat st = {0};
      char *p = result;
      st.st_mode = (mode_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_ino = (ino_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_dev = (dev_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_nlink = (nlink_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_uid = (uid_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_gid = (gid_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_rdev = (dev_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_size = (off_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_atime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_mtime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_ctime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_blksize = (blksize_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_blocks = (blkcnt_t)strtoull(p, &p, 10);
      
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
      fuse_reply_entry(req, &e);
#else
      struct fuse_entry_param e = {0};
      e.ino = st.st_ino;
      e.attr = st;
      e.attr_timeout = 1.0;
      e.entry_timeout = 1.0;
      fuse_reply_entry(req, &e);
#endif
    }
  } else if (strcmp(op, "getattr") == 0) {
    if (strcmp(result, "ENOENT") == 0) {
      fuse_reply_err(req, ENOENT);
    } else {
      struct stat st = {0};
      char *p = result;
      st.st_mode = (mode_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_ino = (ino_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_dev = (dev_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_nlink = (nlink_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_uid = (uid_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_gid = (gid_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_rdev = (dev_t)strtoull(p, &p, 10); if (*p) p++;
      st.st_size = (off_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_atime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_mtime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_ctime = (time_t)strtoll(p, &p, 10); if (*p) p++;
      st.st_blksize = (blksize_t)strtoul(p, &p, 10); if (*p) p++;
      st.st_blocks = (blkcnt_t)strtoull(p, &p, 10);
      
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
      fuse_reply_attr(req, &attr, 1.0);
#else
      fuse_reply_attr(req, &st, 1.0);
#endif
    }
  } else if (strcmp(op, "readdir") == 0) {
    dirbuf_used = 0;
    
    char *p = result;
    while (*p) {
      char *end = strchr(p, ',');
      if (!end) end = p + strlen(p);
      size_t name_len = end - p;
      if (name_len > 0) {
        char name[256];
        strncpy(name, p, name_len);
        name[name_len] = '\0';
        dirbuf_add(req, name);
      }
      if (*end) p = end + 1;
      else break;
    }
    
    fuse_reply_buf(req, dirbuf, dirbuf_used);
  } else if (strcmp(op, "read") == 0) {
    fuse_reply_buf(req, result, len);
  } else if (strcmp(op, "write") == 0) {
    int bytes = atoi(result);
    fuse_reply_write(req, bytes);
  } else {
    int val = atoi(result);
    if (val == 0) {
      fuse_reply_err(req, 0);
    } else {
      fuse_reply_err(req, -val);
    }
  }
  
  free(preq);
  return NULL;
}

static napi_value Unmount(napi_env env, napi_callback_info info) {
  if (g_session) {
    fuse_running = 0;
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
    {"mount", NULL, Mount, NULL, NULL, NULL, napi_default, NULL},
    {"resolve", NULL, Resolve, NULL, NULL, NULL, napi_default, NULL},
    {"unmount", NULL, Unmount, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, 3, desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
