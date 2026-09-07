import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/shared/ui/button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: { control: 'select', options: ['xs', 'sm', 'default', 'lg'] },
  },
  args: { children: 'Start free' },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'default', size: 'lg' } };
export const Outline: Story = { args: { variant: 'outline', size: 'lg', children: 'Sign in' } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const).map((v) => (
        <Button key={v} variant={v}>
          {v}
        </Button>
      ))}
    </div>
  ),
};
