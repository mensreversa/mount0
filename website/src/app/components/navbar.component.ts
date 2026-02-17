import { Component } from "@angular/core";

@Component({
    selector: "app-navbar",
    template: `
    <nav class="relative z-10 bg-black border-b border-white/10">
      <div class="container mx-auto px-6 py-4">
        <div class="flex items-center justify-between font-mono">
          <a href="/" class="flex items-center space-x-3">
            <img src="/assets/icon.svg" alt="Mount0 Logo" class="w-8 h-8 invert" />
            <span class="text-sm font-bold text-white tracking-wider uppercase">Mount0</span>
          </a>
          <div class="hidden md:flex items-center space-x-6">
            <a href="https://docs.mount0.com" class="text-white/60 hover:text-white transition text-xs uppercase tracking-widest">[Docs]</a>
            <a href="https://github.com/mensreversa/mount0" target="_blank" rel="noopener" class="bg-white text-black px-4 py-2 hover:bg-white/90 transition text-xs uppercase tracking-widest font-bold border border-white"> &gt; GitHub </a>
          </div>
        </div>
      </div>
    </nav>
  `,
})
export class NavbarComponent { }
