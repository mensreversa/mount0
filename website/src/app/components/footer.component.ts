import { Component } from "@angular/core";


@Component({
  selector: "app-footer",
  template: `
    <footer class="relative z-10 bg-black border-t border-white/10 py-12 px-6">
      <div class="container mx-auto font-mono">
        <div class="grid md:grid-cols-4 gap-8 mb-8">
          <div class="col-span-2">
              <span class="text-sm font-bold text-white tracking-wider uppercase">MOUNT0</span>
            </div>
            <p class="text-white/60 mb-4 text-xs leading-relaxed">// High-performance virtual filesystem<br />// for developers.</p>
          </div>
        </div>
        <div class="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between">
          <p class="text-white/40 text-xs mb-4 md:mb-0 uppercase tracking-wider">© 2026 MENS REVERSA SRL. MIT LICENSE.</p>
        </div>
      </div>
    </footer>
  `,
  imports: [],
})
export class FooterComponent { }
