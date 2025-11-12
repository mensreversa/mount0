{
  "targets": [
    {
      "target_name": "mount0_fuse",
      "sources": [
        "src/native/fuse_bindings.c"
      ],
      "include_dirs": [
        "<!(node -e \"console.log(require('path').dirname(process.execPath) + '/../../include/node')\")",
        "src/native"
      ],
      "cflags": [
        "-std=c11",
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
            "-DFUSE_USE_VERSION=35"
          ]
        }],
        ["OS=='linux'", {
          "libraries": [
            "-lfuse3"
          ],
          "cflags": [
            "-D_FILE_OFFSET_BITS=64",
            "-DFUSE_USE_VERSION=35"
          ]
        }],
        ["OS=='win'", {
          "include_dirs": [
            "<!@(node -p \"require('path').join(process.env.ProgramFiles || 'C:\\\\Program Files', 'WinFsp', 'inc', 'fuse')\")"
          ],
          "libraries": [
            "<!@(node -p \"require('path').join(process.env.ProgramFiles || 'C:\\\\Program Files', 'WinFsp', 'lib', 'x64', 'winfsp-x64.lib')\")"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [
                "/std:c++17",
                "/DFUSE_USE_VERSION=30"
              ]
            }
          }
        }]
      ],
      "xcode_settings": {
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      }
    }
  ]
}

