import { Component } from '@angular/core';

@Component({
  selector: 'app-studio',
  standalone: true,
  template: `
    <section id="studio" class="relative z-10 py-24 px-6 bg-black overflow-hidden">
      <div class="container mx-auto">
        <div class="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div class="border-l-4 border-white/20 pl-6 mb-8">
              <h2 class="text-2xl sm:text-3xl md:text-5xl font-bold font-mono tracking-tight">
                <span class="text-white">&gt; MOUNT0_<wbr />CONSOLE</span>
              </h2>
            </div>
            <p class="text-white/60 mb-8 max-w-xl font-mono text-sm leading-relaxed">
              // The ultimate dashboard for your virtual filesystem infrastructure.<br />
              // Monitor mount points, throughput, and cache efficiency in real-time.
            </p>

            <ul class="space-y-6 mb-12">
              <li class="flex gap-4">
                <div class="flex-none w-px h-12 bg-white/20"></div>
                <div>
                  <h4 class="text-white font-mono text-sm font-bold uppercase tracking-widest">
                    [ MOUNT_EXPLORER ]
                  </h4>
                  <p class="text-white/40 text-xs mt-1">
                    Visualize your multi-provider mount trees and active FUSE sessions.
                  </p>
                </div>
              </li>
              <li class="flex gap-4">
                <div class="flex-none w-px h-12 bg-white/20"></div>
                <div>
                  <h4 class="text-white font-mono text-sm font-bold uppercase tracking-widest">
                    [ IO_TELEMETRY ]
                  </h4>
                  <p class="text-white/40 text-xs mt-1">
                    Real-time charts of read/write operations and cache hit ratios.
                  </p>
                </div>
              </li>
              <li class="flex gap-4">
                <div class="flex-none w-px h-12 bg-white/20"></div>
                <div>
                  <h4 class="text-white font-mono text-sm font-bold uppercase tracking-widest">
                    [ SECURITY_AUDIT ]
                  </h4>
                  <p class="text-white/40 text-xs mt-1">
                    Audit access patterns and verify crypto layers across your infrastructure.
                  </p>
                </div>
              </li>
            </ul>

            <div class="flex flex-wrap gap-4">
              <div
                class="px-4 py-2 bg-white/5 border border-white/10 text-[10px] font-mono text-white/50 uppercase tracking-widest"
              >
                FUSE
              </div>
              <div
                class="px-4 py-2 bg-white/5 border border-white/10 text-[10px] font-mono text-white/50 uppercase tracking-widest"
              >
                Rust/Wasm
              </div>
              <div
                class="px-4 py-2 bg-white/5 border border-white/10 text-[10px] font-mono text-white/50 uppercase tracking-widest"
              >
                TypeScript
              </div>
            </div>
          </div>

          <div class="relative">
            <div class="relative bg-black rounded-xl overflow-hidden shadow-2xl">
              <div
                class="aspect-video bg-zinc-900 flex items-center justify-center border border-white/10"
              >
                <span class="text-white/20 font-mono">[CONSOLE_UI_PREVIEW]</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class StudioComponent {}
