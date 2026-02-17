import { Component } from '@angular/core';
import { CodeComponent } from '../shared/components/code.component';

@Component({
  selector: 'app-hero',
  standalone: true,
  template: `
    <section
      class="relative z-10 min-h-screen flex items-center justify-center px-6 terminal-grid pt-20"
    >
      <div class="text-center max-w-5xl mx-auto">
        <!-- Terminal Header -->
        <div class="border border-white/20 mb-8 p-1 inline-block">
          <div class="border border-white/10 px-4 py-2">
            <span class="text-white/40 text-xs font-mono">[SYSTEM_READY]</span>
          </div>
        </div>

        <h1
          class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-8 font-mono break-words"
        >
          <span class="text-white">&gt; MOUNT0_<wbr />VIRTUAL_<wbr />FS</span><br />
          <span class="text-white/70">&gt; ZERO_<wbr />DISK_<wbr />FOOTPRINT</span>
        </h1>

        <div class="border-l-2 border-white/20 pl-6 mb-12">
          <p
            class="text-sm sm:text-base md:text-lg text-white/60 max-w-2xl mx-auto text-left font-mono"
          >
            // High-performance virtual filesystem infrastructure.<br />
            // Mount remote storage as local directories.<br />
            // FUSE-based, in-memory, highly scalable.<br />
            // Pure performance. No overhead.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a
            href="https://github.com/mensreversa/mount0"
            target="_blank"
            rel="noopener"
            class="bg-white text-black px-8 py-4 text-sm font-bold hover:bg-white/90 transition border-2 border-white text-center uppercase tracking-widest"
          >
            &gt; GET_<wbr />STARTED
          </a>
          <a
            href="https://docs.mount0.com"
            class="bg-black text-white px-8 py-4 text-sm font-bold hover:bg-white/10 transition border-2 border-white/20 text-center uppercase tracking-widest"
            >&gt; VIEW_<wbr />DOCS</a
          >
        </div>

        <!-- Execution Protocol Example -->
        <div class="max-w-3xl mx-auto">
          <app-code title="[FILESYSTEM_MOUNT]" [code]="mountCode" language="typescript" />
        </div>
      </div>
    </section>
  `,
  imports: [CodeComponent],
})
export class HeroComponent {
  protected readonly mountCode = `import { mount0 } from "@mount0/core";
import { S3Provider } from "@mount0/s3";

const mnt = await mount0("/mnt/data", {
  provider: new S3Provider({
    bucket: "my-bucket",
    region: "us-east-1"
  }),
  cache: {
    maxSize: "1GB",
    ttl: "1h"
  }
});

console.log("Ready.");`;
}
