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
#include <sys/statvfs.h>
#ifdef __APPLE__
#include <sys/mount.h>
#endif
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <unistd.h>

static napi_threadsafe_function tsfn = NULL;
static struct fuse_session *g_session = NULL;
static pthread_t fuse_thread;
static int fuse_running = 0;

struct req_data {
  fuse_req_t req;
  char op[16];
  union {
    struct { fuse_ino_t parent; char name[256]; } lookup;
    struct { fuse_ino_t ino; } getattr;
    struct { fuse_ino_t ino; size_t size; off_t off; } readdir;
    struct { fuse_ino_t ino; uint32_t flags; } open;
    struct { fuse_ino_t ino; uint64_t fh; size_t size; off_t off; } read;
    struct { fuse_ino_t ino; uint64_t fh; size_t size; off_t off; char data[4096]; size_t data_len; } write;
    struct { fuse_ino_t ino; uint64_t fh; off_t off; size_t bufv_count; char bufv_data[4096]; size_t bufv_size; } write_buf;
    struct { fuse_ino_t ino; uint64_t fh; } release;
    struct { fuse_ino_t parent; char name[256]; uint32_t mode; uint32_t flags; } create;
    struct { fuse_ino_t parent; char name[256]; } unlink;
    struct { fuse_ino_t parent; char name[256]; uint32_t mode; } mkdir;
    struct { fuse_ino_t parent; char name[256]; } rmdir;
    struct { fuse_ino_t parent; char name[256]; fuse_ino_t newparent; char newname[256]; uint32_t flags; } rename;
    struct { fuse_ino_t ino; int to_set; struct stat attr; } setattr;
    struct { fuse_ino_t ino; uint64_t fh; } flush;
    struct { fuse_ino_t ino; uint64_t fh; int datasync; } fsync;
    struct { fuse_ino_t ino; uint32_t flags; } opendir;
    struct { fuse_ino_t ino; uint64_t fh; } releasedir;
    struct { fuse_ino_t ino; uint64_t fh; int datasync; } fsyncdir;
    struct { fuse_ino_t ino; } readlink;
    struct { char link[4096]; fuse_ino_t parent; char name[256]; } symlink;
    struct { fuse_ino_t ino; fuse_ino_t newparent; char newname[256]; } link;
    struct { fuse_ino_t parent; char name[256]; uint32_t mode; dev_t rdev; } mknod;
    struct { fuse_ino_t ino; int mask; } access;
    struct { fuse_ino_t ino; } statfs;
    struct { fuse_ino_t ino; char name[256]; char value[4096]; size_t size; int flags; } setxattr;
    struct { fuse_ino_t ino; char name[256]; size_t size; } getxattr;
    struct { fuse_ino_t ino; size_t size; } listxattr;
    struct { fuse_ino_t ino; char name[256]; } removexattr;
    struct { fuse_ino_t ino; uint64_t fh; } getlk;
    struct { fuse_ino_t ino; uint64_t fh; int sleep; } setlk;
    struct { fuse_ino_t ino; uint64_t fh; int op; } flock;
    struct { fuse_ino_t ino; size_t blocksize; uint64_t idx; } bmap;
    struct { fuse_ino_t ino; unsigned int cmd; size_t in_bufsz; size_t out_bufsz; char in_buf[4096]; } ioctl;
    struct { fuse_ino_t ino; uint64_t fh; } poll;
    struct { fuse_ino_t ino; uint64_t fh; off_t offset; off_t length; int mode; } fallocate;
    struct { fuse_ino_t ino; size_t size; off_t off; } readdirplus;
    struct { fuse_ino_t ino; void *cookie; off_t offset; size_t bufv_count; char bufv_data[4096]; size_t bufv_size; } retrieve_reply;
    struct { fuse_ino_t ino_in; off_t off_in; fuse_ino_t ino_out; off_t off_out; size_t len; int flags; } copy_file_range;
    struct { fuse_ino_t ino; uint64_t fh; off_t off; int whence; } lseek;
    struct { fuse_ino_t parent; uint32_t mode; uint32_t flags; } tmpfile;
    struct { fuse_ino_t ino; int flags; int mask; } statx;
    struct { } init;
    struct { } destroy;
    struct { fuse_ino_t ino; uint64_t nlookup; } forget;
    struct { size_t count; fuse_ino_t inos[64]; uint64_t nlookups[64]; } forget_multi;
  } u;
};

static int is_debug_enabled(void) {
  const char *debug = getenv("MOUNT0_DEBUG");
  return debug && debug[0] == '1' && debug[1] == '\0';
}

static void __attribute__((unused)) debug_log(const char *op, const char *fmt, ...) {
  if (!is_debug_enabled()) return;
  fprintf(stderr, "[FUSE:%s] ", op);
  va_list args;
  va_start(args, fmt);
  vfprintf(stderr, fmt, args);
  va_end(args);
  fprintf(stderr, "\n");
}

static void fuse_serialize_stat(napi_env env, const struct stat *st, napi_value stat_obj);
static void fuse_parse_stat(napi_env env, napi_value stat_obj, struct stat *st);

static void call_js(napi_env env, napi_value js_cb, void *context, void *data) {
  struct req_data *d = (struct req_data *)data;
  if (!env || !js_cb || !d) return;
  
  napi_value req_ptr = NULL, params, val;
  if (d->req != NULL) {
    napi_create_double(env, (double)(uintptr_t)d->req, &req_ptr);
  }
  napi_create_object(env, &params);
  
  napi_create_string_utf8(env, d->op, NAPI_AUTO_LENGTH, &val);
  napi_set_named_property(env, params, "op", val);
  
  if (strcmp(d->op, "lookup") == 0) {
    napi_create_double(env, (double)d->u.lookup.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.lookup.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
  } else if (strcmp(d->op, "getattr") == 0) {
    napi_create_double(env, (double)d->u.getattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
  } else if (strcmp(d->op, "readdir") == 0) {
    napi_create_double(env, (double)d->u.readdir.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.readdir.size, &val);
    napi_set_named_property(env, params, "size", val);
    napi_create_double(env, (double)d->u.readdir.off, &val);
    napi_set_named_property(env, params, "off", val);
  } else if (strcmp(d->op, "open") == 0) {
    napi_create_double(env, (double)d->u.open.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_uint32(env, d->u.open.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "read") == 0) {
    napi_create_double(env, (double)d->u.read.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.read.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_double(env, (double)d->u.read.size, &val);
    napi_set_named_property(env, params, "size", val);
    napi_create_double(env, (double)d->u.read.off, &val);
    napi_set_named_property(env, params, "off", val);
  } else if (strcmp(d->op, "write") == 0) {
    napi_create_double(env, (double)d->u.write.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.write.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_double(env, (double)d->u.write.size, &val);
    napi_set_named_property(env, params, "size", val);
    napi_create_double(env, (double)d->u.write.off, &val);
    napi_set_named_property(env, params, "off", val);
    if (d->u.write.data_len > 0) {
      napi_create_string_utf8(env, d->u.write.data, d->u.write.data_len, &val);
      napi_set_named_property(env, params, "data", val);
    }
  } else if (strcmp(d->op, "release") == 0) {
    napi_create_double(env, (double)d->u.release.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.release.fh, &val);
    napi_set_named_property(env, params, "fh", val);
  } else if (strcmp(d->op, "create") == 0) {
    napi_create_double(env, (double)d->u.create.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.create.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_uint32(env, d->u.create.mode, &val);
    napi_set_named_property(env, params, "mode", val);
    napi_create_uint32(env, d->u.create.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "unlink") == 0 || strcmp(d->op, "rmdir") == 0) {
    napi_create_double(env, (double)d->u.unlink.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.unlink.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
  } else if (strcmp(d->op, "mkdir") == 0) {
    napi_create_double(env, (double)d->u.mkdir.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.mkdir.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_uint32(env, d->u.mkdir.mode, &val);
    napi_set_named_property(env, params, "mode", val);
  } else if (strcmp(d->op, "rename") == 0) {
    napi_create_double(env, (double)d->u.rename.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.rename.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_double(env, (double)d->u.rename.newparent, &val);
    napi_set_named_property(env, params, "newparent", val);
    napi_create_string_utf8(env, d->u.rename.newname, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "newname", val);
    napi_create_uint32(env, d->u.rename.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "setattr") == 0) {
    napi_create_double(env, (double)d->u.setattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_int32(env, d->u.setattr.to_set, &val);
    napi_set_named_property(env, params, "to_set", val);
    napi_value attr_obj;
    napi_create_object(env, &attr_obj);
    fuse_serialize_stat(env, &d->u.setattr.attr, attr_obj);
    napi_set_named_property(env, params, "attr", attr_obj);
  } else if (strcmp(d->op, "flush") == 0) {
    napi_create_double(env, (double)d->u.flush.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.flush.fh, &val);
    napi_set_named_property(env, params, "fh", val);
  } else if (strcmp(d->op, "fsync") == 0) {
    napi_create_double(env, (double)d->u.fsync.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.fsync.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_int32(env, d->u.fsync.datasync, &val);
    napi_set_named_property(env, params, "datasync", val);
  } else if (strcmp(d->op, "opendir") == 0) {
    napi_create_double(env, (double)d->u.opendir.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_uint32(env, d->u.opendir.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "releasedir") == 0) {
    napi_create_double(env, (double)d->u.releasedir.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.releasedir.fh, &val);
    napi_set_named_property(env, params, "fh", val);
  } else if (strcmp(d->op, "fsyncdir") == 0) {
    napi_create_double(env, (double)d->u.fsyncdir.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.fsyncdir.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_int32(env, d->u.fsyncdir.datasync, &val);
    napi_set_named_property(env, params, "datasync", val);
  } else if (strcmp(d->op, "readlink") == 0) {
    napi_create_double(env, (double)d->u.readlink.ino, &val);
    napi_set_named_property(env, params, "ino", val);
  } else if (strcmp(d->op, "symlink") == 0) {
    napi_create_string_utf8(env, d->u.symlink.link, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "link", val);
    napi_create_double(env, (double)d->u.symlink.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.symlink.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
  } else if (strcmp(d->op, "link") == 0) {
    napi_create_double(env, (double)d->u.link.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.link.newparent, &val);
    napi_set_named_property(env, params, "newparent", val);
    napi_create_string_utf8(env, d->u.link.newname, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "newname", val);
  } else if (strcmp(d->op, "mknod") == 0) {
    napi_create_double(env, (double)d->u.mknod.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_string_utf8(env, d->u.mknod.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_uint32(env, d->u.mknod.mode, &val);
    napi_set_named_property(env, params, "mode", val);
    napi_create_double(env, (double)d->u.mknod.rdev, &val);
    napi_set_named_property(env, params, "rdev", val);
  } else if (strcmp(d->op, "access") == 0) {
    napi_create_double(env, (double)d->u.access.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_int32(env, d->u.access.mask, &val);
    napi_set_named_property(env, params, "mask", val);
  } else if (strcmp(d->op, "statfs") == 0) {
    napi_create_double(env, (double)d->u.statfs.ino, &val);
    napi_set_named_property(env, params, "ino", val);
  } else if (strcmp(d->op, "setxattr") == 0) {
    napi_create_double(env, (double)d->u.setxattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_string_utf8(env, d->u.setxattr.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_string_utf8(env, d->u.setxattr.value, d->u.setxattr.size < sizeof(d->u.setxattr.value) ? d->u.setxattr.size : sizeof(d->u.setxattr.value) - 1, &val);
    napi_set_named_property(env, params, "value", val);
    napi_create_double(env, (double)d->u.setxattr.size, &val);
    napi_set_named_property(env, params, "size", val);
    napi_create_int32(env, d->u.setxattr.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "getxattr") == 0) {
    napi_create_double(env, (double)d->u.getxattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_string_utf8(env, d->u.getxattr.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
    napi_create_double(env, (double)d->u.getxattr.size, &val);
    napi_set_named_property(env, params, "size", val);
  } else if (strcmp(d->op, "listxattr") == 0) {
    napi_create_double(env, (double)d->u.listxattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.listxattr.size, &val);
    napi_set_named_property(env, params, "size", val);
  } else if (strcmp(d->op, "removexattr") == 0) {
    napi_create_double(env, (double)d->u.removexattr.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_string_utf8(env, d->u.removexattr.name, NAPI_AUTO_LENGTH, &val);
    napi_set_named_property(env, params, "name", val);
  } else if (strcmp(d->op, "getlk") == 0) {
    napi_create_double(env, (double)d->u.getlk.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.getlk.fh, &val);
    napi_set_named_property(env, params, "fh", val);
  } else if (strcmp(d->op, "setlk") == 0) {
    napi_create_double(env, (double)d->u.setlk.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.setlk.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_int32(env, d->u.setlk.sleep, &val);
    napi_set_named_property(env, params, "sleep", val);
  } else if (strcmp(d->op, "flock") == 0) {
    napi_create_double(env, (double)d->u.flock.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.flock.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_int32(env, d->u.flock.op, &val);
    napi_set_named_property(env, params, "op", val);
  } else if (strcmp(d->op, "bmap") == 0) {
    napi_create_double(env, (double)d->u.bmap.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.bmap.blocksize, &val);
    napi_set_named_property(env, params, "blocksize", val);
    napi_create_double(env, (double)d->u.bmap.idx, &val);
    napi_set_named_property(env, params, "idx", val);
  } else if (strcmp(d->op, "ioctl") == 0) {
    napi_create_double(env, (double)d->u.ioctl.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_uint32(env, d->u.ioctl.cmd, &val);
    napi_set_named_property(env, params, "cmd", val);
    napi_create_double(env, (double)d->u.ioctl.in_bufsz, &val);
    napi_set_named_property(env, params, "in_bufsz", val);
    napi_create_double(env, (double)d->u.ioctl.out_bufsz, &val);
    napi_set_named_property(env, params, "out_bufsz", val);
    if (d->u.ioctl.in_bufsz > 0) {
      napi_create_string_utf8(env, d->u.ioctl.in_buf, d->u.ioctl.in_bufsz < sizeof(d->u.ioctl.in_buf) ? d->u.ioctl.in_bufsz : sizeof(d->u.ioctl.in_buf) - 1, &val);
      napi_set_named_property(env, params, "in_buf", val);
    }
  } else if (strcmp(d->op, "poll") == 0) {
    napi_create_double(env, (double)d->u.poll.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.poll.fh, &val);
    napi_set_named_property(env, params, "fh", val);
  } else if (strcmp(d->op, "fallocate") == 0) {
    napi_create_double(env, (double)d->u.fallocate.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.fallocate.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_double(env, (double)d->u.fallocate.offset, &val);
    napi_set_named_property(env, params, "offset", val);
    napi_create_double(env, (double)d->u.fallocate.length, &val);
    napi_set_named_property(env, params, "length", val);
    napi_create_int32(env, d->u.fallocate.mode, &val);
    napi_set_named_property(env, params, "mode", val);
  } else if (strcmp(d->op, "readdirplus") == 0) {
    napi_create_double(env, (double)d->u.readdirplus.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.readdirplus.size, &val);
    napi_set_named_property(env, params, "size", val);
    napi_create_double(env, (double)d->u.readdirplus.off, &val);
    napi_set_named_property(env, params, "off", val);
  } else if (strcmp(d->op, "copy_file_range") == 0) {
    napi_create_double(env, (double)d->u.copy_file_range.ino_in, &val);
    napi_set_named_property(env, params, "ino_in", val);
    napi_create_double(env, (double)d->u.copy_file_range.off_in, &val);
    napi_set_named_property(env, params, "off_in", val);
    napi_create_double(env, (double)d->u.copy_file_range.ino_out, &val);
    napi_set_named_property(env, params, "ino_out", val);
    napi_create_double(env, (double)d->u.copy_file_range.off_out, &val);
    napi_set_named_property(env, params, "off_out", val);
    napi_create_double(env, (double)d->u.copy_file_range.len, &val);
    napi_set_named_property(env, params, "len", val);
    napi_create_int32(env, d->u.copy_file_range.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "lseek") == 0) {
    napi_create_double(env, (double)d->u.lseek.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.lseek.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_double(env, (double)d->u.lseek.off, &val);
    napi_set_named_property(env, params, "off", val);
    napi_create_int32(env, d->u.lseek.whence, &val);
    napi_set_named_property(env, params, "whence", val);
  } else if (strcmp(d->op, "tmpfile") == 0) {
    napi_create_double(env, (double)d->u.tmpfile.parent, &val);
    napi_set_named_property(env, params, "parent", val);
    napi_create_uint32(env, d->u.tmpfile.mode, &val);
    napi_set_named_property(env, params, "mode", val);
    napi_create_uint32(env, d->u.tmpfile.flags, &val);
    napi_set_named_property(env, params, "flags", val);
  } else if (strcmp(d->op, "statx") == 0) {
    napi_create_double(env, (double)d->u.statx.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_int32(env, d->u.statx.flags, &val);
    napi_set_named_property(env, params, "flags", val);
    napi_create_int32(env, d->u.statx.mask, &val);
    napi_set_named_property(env, params, "mask", val);
  } else if (strcmp(d->op, "init") == 0) {
    // init has no parameters
  } else if (strcmp(d->op, "destroy") == 0) {
    // destroy has no parameters
  } else if (strcmp(d->op, "forget") == 0) {
    napi_create_double(env, (double)d->u.forget.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.forget.nlookup, &val);
    napi_set_named_property(env, params, "nlookup", val);
  } else if (strcmp(d->op, "forget_multi") == 0) {
    napi_create_double(env, (double)d->u.forget_multi.count, &val);
    napi_set_named_property(env, params, "count", val);
    napi_value inos_array, nlookups_array;
    napi_create_array(env, &inos_array);
    napi_create_array(env, &nlookups_array);
    for (size_t i = 0; i < d->u.forget_multi.count; i++) {
      napi_create_double(env, (double)d->u.forget_multi.inos[i], &val);
      napi_set_element(env, inos_array, i, val);
      napi_create_double(env, (double)d->u.forget_multi.nlookups[i], &val);
      napi_set_element(env, nlookups_array, i, val);
    }
    napi_set_named_property(env, params, "inos", inos_array);
    napi_set_named_property(env, params, "nlookups", nlookups_array);
  } else if (strcmp(d->op, "write_buf") == 0) {
    napi_create_double(env, (double)d->u.write_buf.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)d->u.write_buf.fh, &val);
    napi_set_named_property(env, params, "fh", val);
    napi_create_double(env, (double)d->u.write_buf.off, &val);
    napi_set_named_property(env, params, "off", val);
    if (d->u.write_buf.bufv_size > 0) {
      napi_create_string_utf8(env, d->u.write_buf.bufv_data, d->u.write_buf.bufv_size, &val);
      napi_set_named_property(env, params, "data", val);
    }
    napi_create_double(env, (double)d->u.write_buf.bufv_size, &val);
    napi_set_named_property(env, params, "size", val);
  } else if (strcmp(d->op, "retrieve_reply") == 0) {
    napi_create_double(env, (double)d->u.retrieve_reply.ino, &val);
    napi_set_named_property(env, params, "ino", val);
    napi_create_double(env, (double)(uintptr_t)d->u.retrieve_reply.cookie, &val);
    napi_set_named_property(env, params, "cookie", val);
    napi_create_double(env, (double)d->u.retrieve_reply.offset, &val);
    napi_set_named_property(env, params, "offset", val);
    if (d->u.retrieve_reply.bufv_size > 0) {
      napi_create_string_utf8(env, d->u.retrieve_reply.bufv_data, d->u.retrieve_reply.bufv_size, &val);
      napi_set_named_property(env, params, "data", val);
    }
    napi_create_double(env, (double)d->u.retrieve_reply.bufv_size, &val);
    napi_set_named_property(env, params, "size", val);
  }
  
  // For init and destroy, req_ptr is NULL, so we need to handle that
  if (d->req == NULL) {
    napi_value argv[] = {params};
    napi_call_function(env, js_cb, js_cb, 1, argv, NULL);
  } else {
    napi_value argv[] = {req_ptr, params};
    napi_call_function(env, js_cb, js_cb, 2, argv, NULL);
  }
  free(d);
}

static void send_to_js(fuse_req_t req, struct req_data *d) {
  if (napi_call_threadsafe_function(tsfn, d, napi_tsfn_nonblocking) != napi_ok) {
    free(d);
    fuse_reply_err(req, EIO);
  }
}

static void fuse_lookup(fuse_req_t req, fuse_ino_t parent, const char *name) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "lookup", sizeof(d->op) - 1);
  d->u.lookup.parent = parent;
  strncpy(d->u.lookup.name, name, sizeof(d->u.lookup.name) - 1);
  send_to_js(req, d);
}

static void fuse_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "getattr", sizeof(d->op) - 1);
  d->u.getattr.ino = ino;
  send_to_js(req, d);
}

#ifdef __APPLE__
static void stat_to_darwin_attr(const struct stat *st, struct fuse_darwin_attr *attr) {
  attr->mode = st->st_mode;
  attr->ino = st->st_ino;
  attr->nlink = st->st_nlink;
  attr->uid = st->st_uid;
  attr->gid = st->st_gid;
  attr->rdev = st->st_rdev;
  attr->size = st->st_size;
  attr->blksize = st->st_blksize;
  attr->blocks = st->st_blocks;
  attr->atimespec.tv_sec = st->st_atime;
  attr->mtimespec.tv_sec = st->st_mtime;
  attr->ctimespec.tv_sec = st->st_ctime;
}

static void stat_to_darwin_entry_param(const struct stat *st, struct fuse_darwin_entry_param *e) {
  e->ino = st->st_ino;
  stat_to_darwin_attr(st, &e->attr);
  e->attr_timeout = 1.0;
  e->entry_timeout = 1.0;
}
#endif

static void __attribute__((unused)) stat_to_entry_param(const struct stat *st, struct fuse_entry_param *e) {
  e->ino = st->st_ino;
  e->attr = *st;
  e->attr_timeout = 1.0;
  e->entry_timeout = 1.0;
}

static char *dirbuf = NULL;
static size_t dirbuf_size = 0;
static size_t dirbuf_used = 0;

static int dirbuf_add(fuse_req_t req, const char *name) {
  struct stat st = {0};
  st.st_ino = 1;
  st.st_mode = S_IFDIR | 0755;
  
#ifdef __APPLE__
  struct fuse_darwin_attr attr = {0};
  stat_to_darwin_attr(&st, &attr);
  const void *attr_ptr = &attr;
#else
  const void *attr_ptr = &st;
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
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "readdir", sizeof(d->op) - 1);
  d->u.readdir.ino = ino;
  d->u.readdir.size = size;
  d->u.readdir.off = off;
  send_to_js(req, d);
}

static void fuse_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "open", sizeof(d->op) - 1);
  d->u.open.ino = ino;
  d->u.open.flags = fi ? fi->flags : 0;
  send_to_js(req, d);
}

static void fuse_release(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "release", sizeof(d->op) - 1);
  d->u.release.ino = ino;
  d->u.release.fh = fi ? fi->fh : 0;
  send_to_js(req, d);
}

static void fuse_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "read", sizeof(d->op) - 1);
  d->u.read.ino = ino;
  d->u.read.fh = fi ? fi->fh : 0;
  d->u.read.size = size;
  d->u.read.off = off;
  send_to_js(req, d);
}

static void fuse_write(fuse_req_t req, fuse_ino_t ino, const char *buf, size_t size, off_t off, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "write", sizeof(d->op) - 1);
  d->u.write.ino = ino;
  d->u.write.fh = fi ? fi->fh : 0;
  d->u.write.size = size;
  d->u.write.off = off;
  size_t copy_size = size < sizeof(d->u.write.data) ? size : sizeof(d->u.write.data) - 1;
  memcpy(d->u.write.data, buf, copy_size);
  d->u.write.data_len = copy_size;
  send_to_js(req, d);
}

static void fuse_create(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "create", sizeof(d->op) - 1);
  d->u.create.parent = parent;
  strncpy(d->u.create.name, name, sizeof(d->u.create.name) - 1);
  d->u.create.mode = mode;
  d->u.create.flags = fi ? fi->flags : 0;
  send_to_js(req, d);
}

static void fuse_unlink(fuse_req_t req, fuse_ino_t parent, const char *name) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "unlink", sizeof(d->op) - 1);
  d->u.unlink.parent = parent;
  strncpy(d->u.unlink.name, name, sizeof(d->u.unlink.name) - 1);
  send_to_js(req, d);
}

static void fuse_mkdir(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "mkdir", sizeof(d->op) - 1);
  d->u.mkdir.parent = parent;
  strncpy(d->u.mkdir.name, name, sizeof(d->u.mkdir.name) - 1);
  d->u.mkdir.mode = mode;
  send_to_js(req, d);
}

static void fuse_rmdir(fuse_req_t req, fuse_ino_t parent, const char *name) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "rmdir", sizeof(d->op) - 1);
  d->u.rmdir.parent = parent;
  strncpy(d->u.rmdir.name, name, sizeof(d->u.rmdir.name) - 1);
  send_to_js(req, d);
}

static void fuse_rename(fuse_req_t req, fuse_ino_t parent, const char *name, fuse_ino_t newparent, const char *newname, unsigned int flags) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "rename", sizeof(d->op) - 1);
  d->u.rename.parent = parent;
  strncpy(d->u.rename.name, name, sizeof(d->u.rename.name) - 1);
  d->u.rename.newparent = newparent;
  strncpy(d->u.rename.newname, newname, sizeof(d->u.rename.newname) - 1);
  d->u.rename.flags = flags;
  send_to_js(req, d);
}

#ifdef __APPLE__
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct fuse_darwin_attr *attr, int to_set, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "setattr", sizeof(d->op) - 1);
  d->u.setattr.ino = ino;
  d->u.setattr.to_set = to_set;
  // Convert darwin_attr to stat for serialization
  struct stat st = {0};
  st.st_mode = attr->mode;
  st.st_ino = attr->ino;
  st.st_nlink = attr->nlink;
  st.st_uid = attr->uid;
  st.st_gid = attr->gid;
  st.st_rdev = attr->rdev;
  st.st_size = attr->size;
  st.st_blksize = attr->blksize;
  st.st_blocks = attr->blocks;
  st.st_atime = attr->atimespec.tv_sec;
  st.st_mtime = attr->mtimespec.tv_sec;
  st.st_ctime = attr->ctimespec.tv_sec;
  d->u.setattr.attr = st;
  send_to_js(req, d);
}
#else
static void fuse_setattr(fuse_req_t req, fuse_ino_t ino, struct stat *attr, int to_set, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "setattr", sizeof(d->op) - 1);
  d->u.setattr.ino = ino;
  d->u.setattr.to_set = to_set;
  d->u.setattr.attr = *attr;
  send_to_js(req, d);
}
#endif

static void fuse_init(void *userdata, struct fuse_conn_info *conn) {
  (void)userdata;
  conn->no_interrupt = 1;
  
  // Forward to JavaScript
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = NULL; // init doesn't have a request
  strncpy(d->op, "init", sizeof(d->op) - 1);
  if (tsfn) {
    napi_call_threadsafe_function(tsfn, d, napi_tsfn_blocking);
  } else {
    free(d);
  }
}

static void fuse_destroy(void *userdata) {
  (void)userdata;
  
  // Forward to JavaScript
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = NULL; // destroy doesn't have a request
  strncpy(d->op, "destroy", sizeof(d->op) - 1);
  if (tsfn) {
    napi_call_threadsafe_function(tsfn, d, napi_tsfn_blocking);
  } else {
    free(d);
  }
}

static void fuse_forget(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup) {
  // Forward to JavaScript - no reply needed for forget
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "forget", sizeof(d->op) - 1);
  d->u.forget.ino = ino;
  d->u.forget.nlookup = nlookup;
  send_to_js(req, d);
}

static void fuse_forget_multi(fuse_req_t req, size_t count, struct fuse_forget_data *forgets) {
  // Forward to JavaScript - no reply needed for forget_multi
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "forget_multi", sizeof(d->op) - 1);
  d->u.forget_multi.count = count > 64 ? 64 : count;
  for (size_t i = 0; i < d->u.forget_multi.count; i++) {
    d->u.forget_multi.inos[i] = forgets[i].ino;
    d->u.forget_multi.nlookups[i] = forgets[i].nlookup;
  }
  send_to_js(req, d);
}

static void fuse_flush(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "flush", sizeof(d->op) - 1);
  d->u.flush.ino = ino;
  d->u.flush.fh = fi ? fi->fh : 0;
  send_to_js(req, d);
}

static void fuse_fsync(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "fsync", sizeof(d->op) - 1);
  d->u.fsync.ino = ino;
  d->u.fsync.fh = fi ? fi->fh : 0;
  d->u.fsync.datasync = datasync;
  send_to_js(req, d);
}

static void fuse_opendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "opendir", sizeof(d->op) - 1);
  d->u.opendir.ino = ino;
  d->u.opendir.flags = fi ? fi->flags : 0;
  send_to_js(req, d);
}

static void fuse_releasedir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "releasedir", sizeof(d->op) - 1);
  d->u.releasedir.ino = ino;
  d->u.releasedir.fh = fi ? fi->fh : 0;
  send_to_js(req, d);
}

static void fuse_fsyncdir(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "fsyncdir", sizeof(d->op) - 1);
  d->u.fsyncdir.ino = ino;
  d->u.fsyncdir.fh = fi ? fi->fh : 0;
  d->u.fsyncdir.datasync = datasync;
  send_to_js(req, d);
}

static void fuse_readlink(fuse_req_t req, fuse_ino_t ino) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "readlink", sizeof(d->op) - 1);
  d->u.readlink.ino = ino;
  send_to_js(req, d);
}

static void fuse_symlink(fuse_req_t req, const char *link, fuse_ino_t parent, const char *name) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "symlink", sizeof(d->op) - 1);
  strncpy(d->u.symlink.link, link, sizeof(d->u.symlink.link) - 1);
  d->u.symlink.parent = parent;
  strncpy(d->u.symlink.name, name, sizeof(d->u.symlink.name) - 1);
  send_to_js(req, d);
}

static void fuse_link(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char *newname) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "link", sizeof(d->op) - 1);
  d->u.link.ino = ino;
  d->u.link.newparent = newparent;
  strncpy(d->u.link.newname, newname, sizeof(d->u.link.newname) - 1);
  send_to_js(req, d);
}

static void fuse_mknod(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, dev_t rdev) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "mknod", sizeof(d->op) - 1);
  d->u.mknod.parent = parent;
  strncpy(d->u.mknod.name, name, sizeof(d->u.mknod.name) - 1);
  d->u.mknod.mode = mode;
  d->u.mknod.rdev = rdev;
  send_to_js(req, d);
}

static void fuse_access(fuse_req_t req, fuse_ino_t ino, int mask) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "access", sizeof(d->op) - 1);
  d->u.access.ino = ino;
  d->u.access.mask = mask;
  send_to_js(req, d);
}

static void fuse_statfs(fuse_req_t req, fuse_ino_t ino) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "statfs", sizeof(d->op) - 1);
  d->u.statfs.ino = ino;
  send_to_js(req, d);
}

static void fuse_setxattr(fuse_req_t req, fuse_ino_t ino, const char *name, const char *value, size_t size, int flags, uint32_t unused) {
  (void)unused;
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "setxattr", sizeof(d->op) - 1);
  d->u.setxattr.ino = ino;
  strncpy(d->u.setxattr.name, name, sizeof(d->u.setxattr.name) - 1);
  size_t copy_size = size < sizeof(d->u.setxattr.value) ? size : sizeof(d->u.setxattr.value) - 1;
  memcpy(d->u.setxattr.value, value, copy_size);
  d->u.setxattr.size = size;
  d->u.setxattr.flags = flags;
  send_to_js(req, d);
}

static void fuse_getxattr(fuse_req_t req, fuse_ino_t ino, const char *name, size_t size, uint32_t unused) {
  (void)unused;
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "getxattr", sizeof(d->op) - 1);
  d->u.getxattr.ino = ino;
  strncpy(d->u.getxattr.name, name, sizeof(d->u.getxattr.name) - 1);
  d->u.getxattr.size = size;
  send_to_js(req, d);
}

static void fuse_listxattr(fuse_req_t req, fuse_ino_t ino, size_t size) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "listxattr", sizeof(d->op) - 1);
  d->u.listxattr.ino = ino;
  d->u.listxattr.size = size;
  send_to_js(req, d);
}

static void fuse_removexattr(fuse_req_t req, fuse_ino_t ino, const char *name) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "removexattr", sizeof(d->op) - 1);
  d->u.removexattr.ino = ino;
  strncpy(d->u.removexattr.name, name, sizeof(d->u.removexattr.name) - 1);
  send_to_js(req, d);
}

static void fuse_getlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi, struct flock *lock) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "getlk", sizeof(d->op) - 1);
  d->u.getlk.ino = ino;
  d->u.getlk.fh = fi ? fi->fh : 0;
  send_to_js(req, d);
}

static void fuse_setlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi, struct flock *lock, int sleep) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "setlk", sizeof(d->op) - 1);
  d->u.setlk.ino = ino;
  d->u.setlk.fh = fi ? fi->fh : 0;
  d->u.setlk.sleep = sleep;
  send_to_js(req, d);
}

static void fuse_flock(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi, int op) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "flock", sizeof(d->op) - 1);
  d->u.flock.ino = ino;
  d->u.flock.fh = fi ? fi->fh : 0;
  d->u.flock.op = op;
  send_to_js(req, d);
}

static void fuse_bmap(fuse_req_t req, fuse_ino_t ino, size_t blocksize, uint64_t idx) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "bmap", sizeof(d->op) - 1);
  d->u.bmap.ino = ino;
  d->u.bmap.blocksize = blocksize;
  d->u.bmap.idx = idx;
  send_to_js(req, d);
}

#if FUSE_USE_VERSION >= 35
static void fuse_ioctl(fuse_req_t req, fuse_ino_t ino, unsigned int cmd, void *arg, struct fuse_file_info *fi, unsigned flags, const void *in_buf, size_t in_bufsz, size_t out_bufsz) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "ioctl", sizeof(d->op) - 1);
  d->u.ioctl.ino = ino;
  d->u.ioctl.cmd = cmd;
  d->u.ioctl.in_bufsz = in_bufsz;
  d->u.ioctl.out_bufsz = out_bufsz;
  if (in_buf && in_bufsz > 0) {
    size_t copy_size = in_bufsz < sizeof(d->u.ioctl.in_buf) ? in_bufsz : sizeof(d->u.ioctl.in_buf) - 1;
    memcpy(d->u.ioctl.in_buf, in_buf, copy_size);
  }
  send_to_js(req, d);
}
#endif

static void fuse_poll(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi, struct fuse_pollhandle *ph) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "poll", sizeof(d->op) - 1);
  d->u.poll.ino = ino;
  d->u.poll.fh = fi ? fi->fh : 0;
  send_to_js(req, d);
}

static void fuse_fallocate(fuse_req_t req, fuse_ino_t ino, int mode, off_t offset, off_t length, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "fallocate", sizeof(d->op) - 1);
  d->u.fallocate.ino = ino;
  d->u.fallocate.fh = fi ? fi->fh : 0;
  d->u.fallocate.offset = offset;
  d->u.fallocate.length = length;
  d->u.fallocate.mode = mode;
  send_to_js(req, d);
}

static void fuse_readdirplus(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "readdirplus", sizeof(d->op) - 1);
  d->u.readdirplus.ino = ino;
  d->u.readdirplus.size = size;
  d->u.readdirplus.off = off;
  send_to_js(req, d);
}

static void fuse_copy_file_range(fuse_req_t req, fuse_ino_t ino_in, off_t off_in, struct fuse_file_info *fi_in, fuse_ino_t ino_out, off_t off_out, struct fuse_file_info *fi_out, size_t len, int flags) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "copy_file_range", sizeof(d->op) - 1);
  d->u.copy_file_range.ino_in = ino_in;
  d->u.copy_file_range.off_in = off_in;
  d->u.copy_file_range.ino_out = ino_out;
  d->u.copy_file_range.off_out = off_out;
  d->u.copy_file_range.len = len;
  d->u.copy_file_range.flags = flags;
  send_to_js(req, d);
}

static void fuse_lseek(fuse_req_t req, fuse_ino_t ino, off_t off, int whence, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "lseek", sizeof(d->op) - 1);
  d->u.lseek.ino = ino;
  d->u.lseek.fh = fi ? fi->fh : 0;
  d->u.lseek.off = off;
  d->u.lseek.whence = whence;
  send_to_js(req, d);
}

static void fuse_tmpfile(fuse_req_t req, fuse_ino_t parent, mode_t mode, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "tmpfile", sizeof(d->op) - 1);
  d->u.tmpfile.parent = parent;
  d->u.tmpfile.mode = mode;
  d->u.tmpfile.flags = fi ? fi->flags : 0;
  send_to_js(req, d);
}

static void __attribute__((unused)) fuse_statx(fuse_req_t req, fuse_ino_t ino, int flags, int mask, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "statx", sizeof(d->op) - 1);
  d->u.statx.ino = ino;
  d->u.statx.flags = flags;
  d->u.statx.mask = mask;
  send_to_js(req, d);
}

static void fuse_write_buf(fuse_req_t req, fuse_ino_t ino, struct fuse_bufvec *bufv, off_t off, struct fuse_file_info *fi) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "write_buf", sizeof(d->op) - 1);
  d->u.write_buf.ino = ino;
  d->u.write_buf.fh = fi ? fi->fh : 0;
  d->u.write_buf.off = off;
  // Extract data from bufv (simplified - only handle first buffer)
  if (bufv && bufv->count > 0 && bufv->buf[0].mem) {
    size_t copy_size = bufv->buf[0].size < sizeof(d->u.write_buf.bufv_data) ? bufv->buf[0].size : sizeof(d->u.write_buf.bufv_data) - 1;
    memcpy(d->u.write_buf.bufv_data, bufv->buf[0].mem, copy_size);
    d->u.write_buf.bufv_size = copy_size;
    d->u.write_buf.bufv_count = 1;
  } else {
    d->u.write_buf.bufv_size = 0;
    d->u.write_buf.bufv_count = 0;
  }
  send_to_js(req, d);
}

static void fuse_retrieve_reply(fuse_req_t req, void *cookie, fuse_ino_t ino, off_t offset, struct fuse_bufvec *bufv) {
  struct req_data *d = calloc(1, sizeof(struct req_data));
  d->req = req;
  strncpy(d->op, "retrieve_reply", sizeof(d->op) - 1);
  d->u.retrieve_reply.ino = ino;
  d->u.retrieve_reply.cookie = cookie;
  d->u.retrieve_reply.offset = offset;
  // Extract data from bufv (simplified - only handle first buffer)
  if (bufv && bufv->count > 0 && bufv->buf[0].mem) {
    size_t copy_size = bufv->buf[0].size < sizeof(d->u.retrieve_reply.bufv_data) ? bufv->buf[0].size : sizeof(d->u.retrieve_reply.bufv_data) - 1;
    memcpy(d->u.retrieve_reply.bufv_data, bufv->buf[0].mem, copy_size);
    d->u.retrieve_reply.bufv_size = copy_size;
    d->u.retrieve_reply.bufv_count = 1;
  } else {
    d->u.retrieve_reply.bufv_size = 0;
    d->u.retrieve_reply.bufv_count = 0;
  }
  send_to_js(req, d);
}

static void *fuse_loop_thread(void *arg) {
  struct fuse_session *se = (struct fuse_session *)arg;
  fuse_running = 1;
  int res = fuse_session_loop(se);
  fuse_running = 0;
  if (is_debug_enabled()) {
    fprintf(stderr, "[FUSE:loop] Session loop exited with code %d\n", res);
  }
  return NULL;
}

static napi_value fuse_napi_mount(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  if (argc < 3) {
    napi_throw_error(env, NULL, "mount requires 3 arguments: mountpoint, options, handler");
    return NULL;
  }
  
  // Extract mountpoint string
  size_t mountpoint_len;
  napi_status status = napi_get_value_string_utf8(env, args[0], NULL, 0, &mountpoint_len);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "Failed to get mountpoint string length");
    return NULL;
  }
  
  char *mountpoint = malloc(mountpoint_len + 1);
  if (!mountpoint) {
    napi_throw_error(env, NULL, "Failed to allocate memory for mountpoint");
    return NULL;
  }
  
  status = napi_get_value_string_utf8(env, args[0], mountpoint, mountpoint_len + 1, NULL);
  if (status != napi_ok) {
    free(mountpoint);
    napi_throw_error(env, NULL, "Failed to get mountpoint string");
    return NULL;
  }
  
  if (is_debug_enabled()) {
    fprintf(stderr, "[FUSE:mount] Mounting filesystem at %s\n", mountpoint);
  }
  
  napi_value resource_name;
  napi_create_string_utf8(env, "fuse", NAPI_AUTO_LENGTH, &resource_name);
  // Create threadsafe function with proper queue size
  // max_queue_size = 0 means unlimited, initial_thread_count = 1
  status = napi_create_threadsafe_function(env, args[2], NULL, resource_name, 0, 1, NULL, NULL, NULL, call_js, &tsfn);
  if (status != napi_ok) {
    free(mountpoint);
    napi_throw_error(env, NULL, "Failed to create threadsafe function");
    return NULL;
  }
  
  // Acquire the threadsafe function to allow calls from other threads
  status = napi_acquire_threadsafe_function(tsfn);
  if (status != napi_ok) {
    free(mountpoint);
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    tsfn = NULL;
    napi_throw_error(env, NULL, "Failed to acquire threadsafe function");
    return NULL;
  }
  
  struct fuse_args fargs = FUSE_ARGS_INIT(0, NULL);
  fuse_opt_add_arg(&fargs, "mount0");
  
  struct fuse_lowlevel_ops ops = {0};
  ops.init = fuse_init;
  ops.destroy = fuse_destroy;
  ops.lookup = fuse_lookup;
  ops.forget = fuse_forget;
  ops.forget_multi = fuse_forget_multi;
  ops.getattr = fuse_getattr;
  ops.setattr = fuse_setattr;
  ops.readlink = fuse_readlink;
  ops.mknod = fuse_mknod;
  ops.mkdir = fuse_mkdir;
  ops.unlink = fuse_unlink;
  ops.rmdir = fuse_rmdir;
  ops.symlink = fuse_symlink;
  ops.rename = fuse_rename;
  ops.link = fuse_link;
  ops.open = fuse_open;
  ops.read = fuse_read;
  ops.write = fuse_write;
  ops.write_buf = fuse_write_buf;
  ops.flush = fuse_flush;
  ops.release = fuse_release;
  ops.fsync = fuse_fsync;
  ops.opendir = fuse_opendir;
  ops.readdir = fuse_readdir;
  ops.releasedir = fuse_releasedir;
  ops.fsyncdir = fuse_fsyncdir;
  ops.statfs = fuse_statfs;
  ops.setxattr = fuse_setxattr;
  ops.getxattr = fuse_getxattr;
  ops.listxattr = fuse_listxattr;
  ops.removexattr = fuse_removexattr;
  ops.access = fuse_access;
  ops.create = fuse_create;
  ops.getlk = fuse_getlk;
  ops.setlk = fuse_setlk;
  ops.bmap = fuse_bmap;
#if FUSE_USE_VERSION >= 35
  ops.ioctl = fuse_ioctl;
#endif
  ops.poll = fuse_poll;
  ops.flock = fuse_flock;
  ops.fallocate = fuse_fallocate;
  ops.readdirplus = fuse_readdirplus;
  ops.copy_file_range = fuse_copy_file_range;
  ops.lseek = fuse_lseek;
  ops.tmpfile = fuse_tmpfile;
#ifdef FUSE_STATX
  ops.statx = fuse_statx;
#endif
  ops.retrieve_reply = fuse_retrieve_reply;
  
  g_session = fuse_session_new(&fargs, &ops, sizeof(ops), NULL);
  if (!g_session) {
    fuse_opt_free_args(&fargs);
    free(mountpoint);
    napi_throw_error(env, NULL, "Failed to create fuse session");
    return NULL;
  }
  
  if (fuse_session_mount(g_session, mountpoint) != 0) {
    fuse_session_destroy(g_session);
    g_session = NULL;
    fuse_opt_free_args(&fargs);
    free(mountpoint);
    napi_throw_error(env, NULL, "Failed to mount fuse filesystem");
    return NULL;
  }
  
  if (pthread_create(&fuse_thread, NULL, fuse_loop_thread, g_session) != 0) {
    fuse_session_unmount(g_session);
    fuse_session_destroy(g_session);
    g_session = NULL;
    fuse_opt_free_args(&fargs);
    free(mountpoint);
    napi_throw_error(env, NULL, "Failed to create fuse thread");
    return NULL;
  }
  
  pthread_detach(fuse_thread);
  
  free(mountpoint);
  fuse_opt_free_args(&fargs);
  
  napi_value result;
  napi_create_string_utf8(env, "mounted", NAPI_AUTO_LENGTH, &result);
  return result;
}

static void fuse_serialize_stat(napi_env env, const struct stat *st, napi_value stat_obj) {
  napi_value val;
  napi_create_int64(env, (int64_t)st->st_mode, &val);
  napi_set_named_property(env, stat_obj, "mode", val);
  napi_create_int64(env, (int64_t)st->st_ino, &val);
  napi_set_named_property(env, stat_obj, "ino", val);
  napi_create_int64(env, (int64_t)st->st_dev, &val);
  napi_set_named_property(env, stat_obj, "dev", val);
  napi_create_int64(env, (int64_t)st->st_nlink, &val);
  napi_set_named_property(env, stat_obj, "nlink", val);
  napi_create_int64(env, (int64_t)st->st_uid, &val);
  napi_set_named_property(env, stat_obj, "uid", val);
  napi_create_int64(env, (int64_t)st->st_gid, &val);
  napi_set_named_property(env, stat_obj, "gid", val);
  napi_create_int64(env, (int64_t)st->st_rdev, &val);
  napi_set_named_property(env, stat_obj, "rdev", val);
  napi_create_int64(env, (int64_t)st->st_size, &val);
  napi_set_named_property(env, stat_obj, "size", val);
  napi_create_int64(env, (int64_t)st->st_blksize, &val);
  napi_set_named_property(env, stat_obj, "blksize", val);
  napi_create_int64(env, (int64_t)st->st_blocks, &val);
  napi_set_named_property(env, stat_obj, "blocks", val);
  napi_create_int64(env, (int64_t)st->st_atime, &val);
  napi_set_named_property(env, stat_obj, "atime", val);
  napi_create_int64(env, (int64_t)st->st_mtime, &val);
  napi_set_named_property(env, stat_obj, "mtime", val);
  napi_create_int64(env, (int64_t)st->st_ctime, &val);
  napi_set_named_property(env, stat_obj, "ctime", val);
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
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  double errno_double;
  napi_get_value_double(env, args[1], &errno_double);
  fuse_reply_err(req, (int)errno_double);
  return NULL;
}

static napi_value fuse_napi_reply_lookup(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  struct stat st = {0};
  fuse_parse_stat(env, args[1], &st);
  
#ifdef __APPLE__
  struct fuse_darwin_entry_param e = {0};
  stat_to_darwin_entry_param(&st, &e);
  fuse_reply_entry(req, &e);
#else
  struct fuse_entry_param e = {0};
  stat_to_entry_param(&st, &e);
  fuse_reply_entry(req, &e);
#endif
  return NULL;
}

static napi_value fuse_napi_reply_getattr(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  struct stat st = {0};
  fuse_parse_stat(env, args[1], &st);
  
#ifdef __APPLE__
  struct fuse_darwin_attr attr = {0};
  stat_to_darwin_attr(&st, &attr);
  fuse_reply_attr(req, &attr, 1.0);
#else
  fuse_reply_attr(req, &st, 1.0);
#endif
  return NULL;
}

static napi_value fuse_napi_reply_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  struct stat st = {0};
  fuse_parse_stat(env, args[1], &st);
  
  struct fuse_file_info fi = {0};
  fi.fh = 0;
  
#ifdef __APPLE__
  struct fuse_darwin_entry_param e = {0};
  stat_to_darwin_entry_param(&st, &e);
  fuse_reply_create(req, &e, &fi);
#else
  struct fuse_entry_param e = {0};
  stat_to_entry_param(&st, &e);
  fuse_reply_create(req, &e, &fi);
#endif
  return NULL;
}

static napi_value fuse_napi_reply_readdir(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  uint32_t length;
  napi_get_array_length(env, args[1], &length);
  
  dirbuf_used = 0;
  for (uint32_t i = 0; i < length; i++) {
    napi_value elem;
    napi_get_element(env, args[1], i, &elem);
    char name[256];
    size_t name_len;
    napi_get_value_string_utf8(env, elem, name, sizeof(name), &name_len);
    if (name_len > 0) {
      dirbuf_add(req, name);
    }
  }
  fuse_reply_buf(req, dirbuf, dirbuf_used);
  return NULL;
}

static napi_value fuse_napi_reply_read(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  char result[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[1], result, sizeof(result), &len);
  fuse_reply_buf(req, result, len);
  return NULL;
}

static napi_value fuse_napi_reply_write(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  int64_t bytes;
  napi_get_value_int64(env, args[1], &bytes);
  fuse_reply_write(req, (size_t)bytes);
  return NULL;
}

static napi_value fuse_napi_reply_open(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  double fh_double;
  napi_get_value_double(env, args[1], &fh_double);
  struct fuse_file_info fi = {0};
  fi.fh = (uint64_t)fh_double;
  fuse_reply_open(req, &fi);
  return NULL;
}

static napi_value fuse_napi_reply_release(napi_env env, napi_callback_info info) {
  napi_value args[1];
  size_t argc = 1;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  fuse_reply_err(req, 0);
  return NULL;
}

static napi_value fuse_napi_reply_readlink(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  char link[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[1], link, sizeof(link), &len);
  fuse_reply_readlink(req, link);
  return NULL;
}

static napi_value fuse_napi_reply_statfs(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
#ifdef __APPLE__
  struct statfs stbuf = {0};
#else
  struct statvfs stbuf = {0};
#endif
  napi_value val;
  napi_get_named_property(env, args[1], "bsize", &val);
  int64_t num_val;
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_bsize = (unsigned long)num_val;
  
  napi_get_named_property(env, args[1], "blocks", &val);
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_blocks = (fsblkcnt_t)num_val;
  
  napi_get_named_property(env, args[1], "bfree", &val);
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_bfree = (fsblkcnt_t)num_val;
  
  napi_get_named_property(env, args[1], "bavail", &val);
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_bavail = (fsblkcnt_t)num_val;
  
  napi_get_named_property(env, args[1], "files", &val);
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_files = (fsfilcnt_t)num_val;
  
  napi_get_named_property(env, args[1], "ffree", &val);
  napi_get_value_int64(env, val, &num_val);
  stbuf.f_ffree = (fsfilcnt_t)num_val;
  
  fuse_reply_statfs(req, &stbuf);
  return NULL;
}

static napi_value fuse_napi_reply_buf(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  char buf[4096];
  size_t len;
  napi_get_value_string_utf8(env, args[1], buf, sizeof(buf), &len);
  fuse_reply_buf(req, buf, len);
  return NULL;
}

static napi_value fuse_napi_reply_none(napi_env env, napi_callback_info info) {
  napi_value args[1];
  size_t argc = 1;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  fuse_reply_none(req);
  return NULL;
}

static napi_value fuse_napi_reply_xattr(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  double size_double;
  napi_get_value_double(env, args[1], &size_double);
  fuse_reply_xattr(req, (size_t)size_double);
  return NULL;
}

static napi_value fuse_napi_reply_lock(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  struct flock lock = {0};
  napi_value val;
  napi_get_named_property(env, args[1], "type", &val);
  int32_t type;
  napi_get_value_int32(env, val, &type);
  lock.l_type = type;
  
  napi_get_named_property(env, args[1], "whence", &val);
  int32_t whence;
  napi_get_value_int32(env, val, &whence);
  lock.l_whence = whence;
  
  napi_get_named_property(env, args[1], "start", &val);
  int64_t start;
  napi_get_value_int64(env, val, &start);
  lock.l_start = (off_t)start;
  
  napi_get_named_property(env, args[1], "len", &val);
  int64_t len;
  napi_get_value_int64(env, val, &len);
  lock.l_len = (off_t)len;
  
  napi_get_named_property(env, args[1], "pid", &val);
  int32_t pid;
  napi_get_value_int32(env, val, &pid);
  lock.l_pid = (pid_t)pid;
  
  fuse_reply_lock(req, &lock);
  return NULL;
}

static napi_value fuse_napi_reply_bmap(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  double idx_double;
  napi_get_value_double(env, args[1], &idx_double);
  fuse_reply_bmap(req, (uint64_t)idx_double);
  return NULL;
}

static napi_value fuse_napi_reply_ioctl(napi_env env, napi_callback_info info) {
  napi_value args[3];
  size_t argc = 3;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  int32_t result;
  napi_get_value_int32(env, args[1], &result);
  
  char buf[4096];
  size_t len = 0;
  if (argc > 2) {
    napi_get_value_string_utf8(env, args[2], buf, sizeof(buf), &len);
  }
  fuse_reply_ioctl(req, result, len > 0 ? buf : NULL, len);
  return NULL;
}

static napi_value fuse_napi_reply_poll(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  uint32_t revents;
  napi_get_value_uint32(env, args[1], &revents);
  fuse_reply_poll(req, revents);
  return NULL;
}

static napi_value fuse_napi_reply_lseek(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  double off_double;
  napi_get_value_double(env, args[1], &off_double);
  fuse_reply_lseek(req, (off_t)off_double);
  return NULL;
}

static napi_value fuse_napi_reply_int(napi_env env, napi_callback_info info) {
  napi_value args[2];
  size_t argc = 2;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  
  double req_ptr_double;
  napi_get_value_double(env, args[0], &req_ptr_double);
  fuse_req_t req = (fuse_req_t)(uintptr_t)req_ptr_double;
  
  int64_t val;
  napi_get_value_int64(env, args[1], &val);
  fuse_reply_err(req, val == 0 ? 0 : (int)-val);
  return NULL;
}

static napi_value fuse_napi_unmount(napi_env env, napi_callback_info info) {
  if (g_session) {
    fuse_session_exit(g_session);
    // Wait a bit for the loop to exit
    int count = 0;
    while (fuse_running && count < 100) {
      usleep(10000); // 10ms
      count++;
    }
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
    {"reply_none", NULL, fuse_napi_reply_none, NULL, NULL, NULL, napi_default, NULL},
    {"reply_lookup", NULL, fuse_napi_reply_lookup, NULL, NULL, NULL, napi_default, NULL},
    {"reply_getattr", NULL, fuse_napi_reply_getattr, NULL, NULL, NULL, napi_default, NULL},
    {"reply_readdir", NULL, fuse_napi_reply_readdir, NULL, NULL, NULL, napi_default, NULL},
    {"reply_read", NULL, fuse_napi_reply_read, NULL, NULL, NULL, napi_default, NULL},
    {"reply_write", NULL, fuse_napi_reply_write, NULL, NULL, NULL, napi_default, NULL},
    {"reply_open", NULL, fuse_napi_reply_open, NULL, NULL, NULL, napi_default, NULL},
    {"reply_release", NULL, fuse_napi_reply_release, NULL, NULL, NULL, napi_default, NULL},
    {"reply_create", NULL, fuse_napi_reply_create, NULL, NULL, NULL, napi_default, NULL},
    {"reply_unlink", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_mkdir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_rmdir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_rename", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_truncate", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_flush", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_fsync", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_opendir", NULL, fuse_napi_reply_open, NULL, NULL, NULL, napi_default, NULL},
    {"reply_releasedir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_fsyncdir", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_readlink", NULL, fuse_napi_reply_readlink, NULL, NULL, NULL, napi_default, NULL},
    {"reply_symlink", NULL, fuse_napi_reply_lookup, NULL, NULL, NULL, napi_default, NULL},
    {"reply_link", NULL, fuse_napi_reply_lookup, NULL, NULL, NULL, napi_default, NULL},
    {"reply_mknod", NULL, fuse_napi_reply_lookup, NULL, NULL, NULL, napi_default, NULL},
    {"reply_access", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_statfs", NULL, fuse_napi_reply_statfs, NULL, NULL, NULL, napi_default, NULL},
    {"reply_setxattr", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_getxattr", NULL, fuse_napi_reply_buf, NULL, NULL, NULL, napi_default, NULL},
    {"reply_xattr", NULL, fuse_napi_reply_xattr, NULL, NULL, NULL, napi_default, NULL},
    {"reply_listxattr", NULL, fuse_napi_reply_buf, NULL, NULL, NULL, napi_default, NULL},
    {"reply_removexattr", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_getlk", NULL, fuse_napi_reply_lock, NULL, NULL, NULL, napi_default, NULL},
    {"reply_setlk", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_flock", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_bmap", NULL, fuse_napi_reply_bmap, NULL, NULL, NULL, napi_default, NULL},
    {"reply_ioctl", NULL, fuse_napi_reply_ioctl, NULL, NULL, NULL, napi_default, NULL},
    {"reply_poll", NULL, fuse_napi_reply_poll, NULL, NULL, NULL, napi_default, NULL},
    {"reply_fallocate", NULL, fuse_napi_reply_int, NULL, NULL, NULL, napi_default, NULL},
    {"reply_readdirplus", NULL, fuse_napi_reply_readdir, NULL, NULL, NULL, napi_default, NULL},
    {"reply_copy_file_range", NULL, fuse_napi_reply_write, NULL, NULL, NULL, napi_default, NULL},
    {"reply_lseek", NULL, fuse_napi_reply_lseek, NULL, NULL, NULL, napi_default, NULL},
    {"reply_tmpfile", NULL, fuse_napi_reply_create, NULL, NULL, NULL, napi_default, NULL},
    {"unmount", NULL, fuse_napi_unmount, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, 43, desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
