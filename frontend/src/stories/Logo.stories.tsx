import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Logo, LogoMark } from '@/shared/ui/logo';

const meta: Meta<typeof Logo> = {
  title: 'Brand/Logo',
  component: Logo,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Logo>;

export const Lockup: Story = {};

export const Mark: Story = {
  render: () => <LogoMark className="h-20 w-20" />,
};

export const Monochrome: Story = {
  render: () => (
    <div className="text-foreground">
      <LogoMark mono className="h-20 w-20" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6 text-foreground">
      <LogoMark className="h-6 w-6" />
      <LogoMark className="h-10 w-10" />
      <LogoMark className="h-16 w-16" />
      <Logo />
    </div>
  ),
};
