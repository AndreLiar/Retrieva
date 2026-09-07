import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConcentrationGraphHero } from '@/components/marketing/ConcentrationGraphHero';

/**
 * The hero visual: a vendor → subprocessor concentration graph with the shared substrate
 * flagged as a single point of failure. The one orchestrated motion (edges draw, nodes pop,
 * risk node pulses); static under prefers-reduced-motion.
 */
const meta: Meta<typeof ConcentrationGraphHero> = {
  title: 'Marketing/Concentration Graph Hero',
  component: ConcentrationGraphHero,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof ConcentrationGraphHero>;

export const Default: Story = {
  render: () => <ConcentrationGraphHero className="w-[420px] max-w-full" />,
};
