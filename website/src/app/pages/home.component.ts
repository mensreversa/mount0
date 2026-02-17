import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <section
      class="relative min-h-screen flex items-center justify-center pt-20 pb-32 overflow-hidden"
    >
      <div class="container mx-auto px-6 relative z-10 text-center">
        <h1 class="text-6xl md:text-8xl font-bold mb-8 font-mono tracking-tight leading-none">
          MOUNT<span class="text-white/20">0</span>
        </h1>
        <p
          class="text-xl md:text-2xl text-white/60 mb-12 max-w-2xl mx-auto font-mono leading-relaxed"
        >
          High-performance virtual filesystem for developers.
          <br /><span class="text-sm mt-4 block text-white/40"
            >FUSE-based • In-Memory • Zero Footprint</span
          >
        </p>
        <div
          class="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6 font-mono"
        >
          <a
            href="https://docs.mount0.com"
            class="border border-white bg-white text-black px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition w-full md:w-auto"
          >
            [Read_Docs]
          </a>
          <a
            href="https://github.com/mensreversa/mount0"
            target="_blank"
            rel="noopener"
            class="border border-white/20 hover:border-white text-white px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-white/5 transition w-full md:w-auto"
          >
            &gt; View_Source
          </a>
        </div>
      </div>
    </section>

    <section class="py-20 bg-zinc-900/50">
      <div class="container mx-auto px-6 grid md:grid-cols-3 gap-12 font-mono">
        <div class="p-6 border border-white/10 hover:border-white/30 transition">
          <div class="text-4xl mb-4">🚀</div>
          <h3 class="text-xl font-bold mb-2">Blazing Fast</h3>
          <p class="text-white/60 text-sm">
            Operations happen in-memory, bypassing physical disk I/O bottlenecks.
          </p>
        </div>
        <div class="p-6 border border-white/10 hover:border-white/30 transition">
          <div class="text-4xl mb-4">🛡️</div>
          <h3 class="text-xl font-bold mb-2">Secure Sandbox</h3>
          <p class="text-white/60 text-sm">
            Isolated environment. Data vanishes instantly when the process stops.
          </p>
        </div>
        <div class="p-6 border border-white/10 hover:border-white/30 transition">
          <div class="text-4xl mb-4">💾</div>
          <h3 class="text-xl font-bold mb-2">FUSE Powered</h3>
          <p class="text-white/60 text-sm">
            Compatible with all standard CLI tools and applications.
          </p>
        </div>
      </div>
    </section>
  `,
})
export class HomeComponent {}
