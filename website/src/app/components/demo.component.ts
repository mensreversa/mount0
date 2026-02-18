import { Component } from "@angular/core";
import { CodeComponent } from "../shared/components/code.component";

@Component({
  selector: "app-demo",
  standalone: true,
  template: `
    <section id="demo" class="relative z-10 py-20 px-6 bg-black">
      <div class="container mx-auto">
        <div class="border-l-4 border-white/20 pl-6 mb-4">
          <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold font-mono break-words">
            <span class="text-white">&gt; VIRTUAL_<wbr />DISK_<wbr />PATTERNS</span>
          </h2>
        </div>
        <p class="text-white/60 mb-12 max-w-2xl font-mono text-xs sm:text-sm pl-6">// High-performance patterns for virtual filesystems.<br />// Compose multiple providers with ease.</p>

        <div class="grid md:grid-cols-2 md:auto-rows-fr gap-1 max-w-6xl mx-auto">
          <app-code title="[RAID_CONFIGURATION]" [code]="raidCode" language="typescript" />
          <app-code title="[MULTI_STRATEGY]" [code]="multiCode" language="typescript" />
        </div>
      </div>
    </section>
  `,
  imports: [CodeComponent],
})
export class DemoComponent {
  protected readonly raidCode = `import { RAID1 } from "@mount0/raid";
import { S3Provider } from "@mount0/s3";
import { SSHProvider } from "@mount0/ssh";

const raid = new RAID1([
  new S3Provider({ bucket: "us-west" }),
  new SSHProvider({ host: "backup-srv" })
]);

await mount0("/mnt/raid", { provider: raid });`;

  protected readonly multiCode = `import { MajorityProvider } from "@mount0/multi";

const provider = new MajorityProvider([
  new S3Provider({ bucket: "aws" }),
  new GCSProvider({ bucket: "gcp" }),
  new AzureProvider({ bucket: "azure" })
]);

// Read only succeeds if 2/3 agree
await provider.read("/config.yaml");`;
}
