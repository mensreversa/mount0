---
sidebar_position: 3
---

# Architecture

Mount0 uses FUSE (Filesystem in Userspace) bindings to intercept filesystem calls and handle them in user space.

## Core Components

### 1. The Kernel Module
Mount0 relies on the OS's FUSE kernel module to forward filesystem requests to the user-space application.

### 2. The Bridge
A native Node.js addon bridges the gap between C++ FUSE bindings and JavaScript.

### 3. The Virtual Store
An in-memory (or backed) key-value store that represents the file tree.

## Performance

Since Mount0 operates primarily in memory, read/write operations are extremely fast, limited mostly by IPC overhead.
