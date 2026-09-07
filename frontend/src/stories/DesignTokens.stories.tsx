import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * The Retrieva design system: electric-blue/cyan on premium near-black, bold Space Grotesk
 * display + Inter body. Swatches read the live CSS variables, so this page is the source of truth.
 */
const Swatch = ({ name, varName }: { name: string; varName: string }) => (
  <div className="flex items-center gap-3">
    <div
      className="h-12 w-12 rounded-lg border border-border"
      style={{ background: `hsl(var(${varName}))` }}
    />
    <div className="text-sm">
      <div className="font-medium text-foreground">{name}</div>
      <code className="text-xs text-muted-foreground">{varName}</code>
    </div>
  </div>
);

function Tokens() {
  return (
    <div className="text-foreground max-w-3xl space-y-10">
      <section>
        <h2 className="font-display text-2xl font-bold mb-4">Colour</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Swatch name="Background" varName="--background" />
          <Swatch name="Card" varName="--card" />
          <Swatch name="Primary (electric cyan)" varName="--primary" />
          <Swatch name="Accent" varName="--accent" />
          <Swatch name="Muted" varName="--muted" />
          <Swatch name="Border" varName="--border" />
          <Swatch name="Success" varName="--success" />
          <Swatch name="Warning" varName="--warning" />
          <Swatch name="Destructive" varName="--destructive" />
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold mb-4">Type scale</h2>
        <div className="space-y-3">
          <p className="font-display text-5xl font-bold tracking-tight">Display / Space Grotesk</p>
          <p className="font-display text-3xl font-semibold">Heading / Space Grotesk</p>
          <p className="text-lg">Body large / Inter — the concentration your Register can’t show.</p>
          <p className="text-sm text-muted-foreground">Body small / Inter — muted supporting copy.</p>
          <p className="font-mono text-xs text-muted-foreground">Mono / JetBrains — 116 · 6.5% · 93.5%</p>
        </div>
      </section>
    </div>
  );
}

const meta: Meta<typeof Tokens> = { title: 'Brand/Design Tokens', component: Tokens };
export default meta;
export const Tokens_: StoryObj<typeof Tokens> = { name: 'Palette & Type' };
