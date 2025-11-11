{
  "targets": [
    {
      "target_name": "mount0_fuse",
      "sources": [
        "src/native/fuse_bindings.cc",
        "src/native/fuse_operations.cc"
      ],
      "include_dirs": [
        "<!(node -e \"console.log(require('path').dirname(process.execPath) + '/../../include/node')\")",
        "src/native"
      ],
      "cflags": [
        "-std=c++17",
        "-O3",
        "-Wall"
      ],
      "conditions": [
        ["OS=='mac'", {
          "libraries": [
            "-L/usr/local/lib",
            "-lfuse3"
          ],
          "cflags": [
            "-D_FILE_OFFSET_BITS=64",
            "-DFUSE_USE_VERSION=30"
          ]
        }],
        ["OS=='linux'", {
          "libraries": [
            "-lfuse3"
          ],
          "cflags": [
            "-D_FILE_OFFSET_BITS=64",
            "-DFUSE_USE_VERSION=30"
          ]
        }]
      ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_RTTI": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      }
    }
  ]
}

