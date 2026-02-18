import { Component } from "@angular/core";
import { NgIconComponent, provideIcons } from "@ng-icons/core";
import { lucideCode, lucideCpu, lucideLayers, lucideShield, lucideUnlock, lucideZap } from "@ng-icons/lucide";
import { CodeComponent } from "../shared/components/code.component";

@Component({
  selector: "app-features",
  standalone: true,
  template: `
    <section id="features" class="relative z-10 py-20 px-6 bg-black">
      <div class="container mx-auto">
        <div class="border-l-4 border-white/20 pl-6 mb-16">
          <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold font-mono break-words">
            <span class="text-white">&gt; WHY_<wbr />CHOOSE_<wbr />MOUNT0</span>
          </h2>
        </div>

        <div class="grid md:grid-cols-3 gap-1 max-w-6xl mx-auto mb-12">
          <div class="sq-panel hover:bg-white/5 transition">
            <div class="sq-panel-header">
              <h3 class="sq-panel-title">[ZERO_<wbr />DISK]</h3>
            </div>
            <div class="sq-panel-body">
              <div class="w-12 h-12 mb-4 border border-white/20 flex items-center justify-center">
                <ng-icon name="lucideZap" size="24" class="text-white" />
              </div>
              <p class="text-white/60 text-xs font-mono leading-relaxed">Pure in-memory operations. No physical disk latency. Data lives only in RAM.</p>
            </div>
          </div>

          <div class="sq-panel hover:bg-white/5 transition">
            <div class="sq-panel-header">
              <h3 class="sq-panel-title">[FUSE_<wbr />DRIVEN]</h3>
            </div>
            <div class="sq-panel-body">
              <div class="w-12 h-12 mb-4 border border-white/20 flex items-center justify-center">
                <ng-icon name="lucideCpu" size="24" class="text-white" />
              </div>
              <p class="text-white/60 text-xs font-mono leading-relaxed">Mount any data source into the native OS filesystem tree using High-performance FUSE bindings.</p>
            </div>
          </div>

          <div class="sq-panel hover:bg-white/5 transition">
            <div class="sq-panel-header">
              <h3 class="sq-panel-title">[FULLY_<wbr />ENCRYPTED]</h3>
            </div>
            <div class="sq-panel-body">
              <div class="w-12 h-12 mb-4 border border-white/20 flex items-center justify-center">
                <ng-icon name="lucideShield" size="24" class="text-white" />
              </div>
              <p class="text-white/60 text-xs font-mono leading-relaxed">Built-in AES-256-GCM encryption at the filesystem level. Your data is always secure at rest.</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-1 max-w-6xl mx-auto mb-12">
          <app-code title="[SUPPORTED_PROVIDERS]" [code]="supportedProvidersCode" language="bash" />
          <app-code title="[CORE_PACKAGES]" [code]="supportedPackagesCode" language="bash" />
          <app-code title="[MOUNT_INTERFACES]" [code]="mountInterfacesCode" language="typescript" />
        </div>

        <p class="text-white/50 text-xs font-mono text-center mb-10">// more providers and RAID levels coming</p>

        <div class="text-center">
          <div class="max-w-3xl mx-auto">
            <app-code title="[CLI_USAGE]" [code]="cliCode" language="bash" />
          </div>
        </div>
      </div>
    </section>
  `,
  imports: [NgIconComponent, CodeComponent],
  providers: [provideIcons({ lucideZap, lucideCode, lucideUnlock, lucideShield, lucideCpu, lucideLayers })],
})
export class FeaturesComponent {
  protected readonly cliCode = `$ mount0 mount /mnt/s3 --provider s3 --bucket my-data
$ ls -la /mnt/s3
$ cp large-file.dat /mnt/s3/`;

  protected readonly supportedProvidersCode = `local
memory
s3
ssh
samba
ftp
webdav
encrypted
raid_0_1_5_6
multi_majority`;

  protected readonly mountInterfacesCode = `interface FilesystemProvider {
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<string[]>;
}`;

  protected readonly supportedPackagesCode = `@mount0/core
@mount0/cache
@mount0/s3
@mount0/ssh
@mount0/samba
@mount0/encrypted
@mount0/raid
@mount0/multi
@mount0/ftp
@mount0/webdav`;
}
