/**
 * Utils Unit Tests
 *
 * Tests for general utility functions
 */

import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (classNames utility)', () => {
  // ===========================================================================
  // Basic Usage Tests
  // ===========================================================================
  describe('Basic Usage', () => {
    it('should merge simple class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle single class name', () => {
      expect(cn('foo')).toBe('foo');
    });

    it('should handle empty string', () => {
      expect(cn('')).toBe('');
    });

    it('should handle no arguments', () => {
      expect(cn()).toBe('');
    });

    it('should filter out falsy values', () => {
      expect(cn('foo', null, 'bar', undefined, 'baz')).toBe('foo bar baz');
    });

    it('should handle boolean conditions', () => {
      expect(cn('foo', false && 'bar', true && 'baz')).toBe('foo baz');
    });
  });

  // ===========================================================================
  // Tailwind Merge Tests
  // ===========================================================================
  describe('Tailwind Merge', () => {
    it('should merge conflicting padding classes', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('should merge conflicting margin classes', () => {
      expect(cn('m-4', 'm-2')).toBe('m-2');
    });

    it('should merge conflicting text color classes', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should merge conflicting background classes', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('should keep non-conflicting classes', () => {
      expect(cn('p-4', 'm-2')).toBe('p-4 m-2');
    });

    it('should merge conflicting flex classes', () => {
      expect(cn('flex-row', 'flex-col')).toBe('flex-col');
    });

    it('should merge conflicting width classes', () => {
      expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
    });

    it('should merge conflicting height classes', () => {
      expect(cn('h-screen', 'h-full')).toBe('h-full');
    });
  });

  // ===========================================================================
  // Object Syntax Tests
  // ===========================================================================
  describe('Object Syntax (clsx)', () => {
    it('should handle object with true values', () => {
      expect(cn({ foo: true, bar: true })).toBe('foo bar');
    });

    it('should filter out object with false values', () => {
      expect(cn({ foo: true, bar: false })).toBe('foo');
    });

    it('should handle mixed object and string', () => {
      expect(cn('base', { active: true, disabled: false })).toBe('base active');
    });

    it('should handle empty object', () => {
      expect(cn({})).toBe('');
    });

    it('should handle object with all false values', () => {
      expect(cn({ foo: false, bar: false })).toBe('');
    });
  });

  // ===========================================================================
  // Array Syntax Tests
  // ===========================================================================
  describe('Array Syntax', () => {
    it('should handle arrays', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('should handle nested arrays', () => {
      expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
    });

    it('should handle arrays with falsy values', () => {
      expect(cn(['foo', null, 'bar'])).toBe('foo bar');
    });

    it('should handle mixed arrays and strings', () => {
      expect(cn('base', ['foo', 'bar'], 'end')).toBe('base foo bar end');
    });
  });

  // ===========================================================================
  // Complex Usage Tests
  // ===========================================================================
  describe('Complex Usage', () => {
    it('should handle component variant pattern', () => {
      const variant = 'primary';
      const size = 'large';
      const isDisabled = false;

      const result = cn(
        'btn',
        {
          'btn-primary': variant === 'primary',
          'btn-secondary': variant === 'secondary',
          'btn-lg': size === 'large',
          'btn-sm': size === 'small',
          'btn-disabled': isDisabled,
        }
      );

      expect(result).toBe('btn btn-primary btn-lg');
    });

    it('should handle responsive classes with overrides', () => {
      // Base padding with responsive override
      expect(cn('p-2', 'md:p-4', 'lg:p-6')).toBe('p-2 md:p-4 lg:p-6');
    });

    it('should handle state classes', () => {
      expect(cn('bg-white', 'hover:bg-gray-100', 'focus:bg-gray-200')).toBe(
        'bg-white hover:bg-gray-100 focus:bg-gray-200'
      );
    });

    it('should handle dark mode classes', () => {
      expect(cn('bg-white', 'dark:bg-gray-900')).toBe('bg-white dark:bg-gray-900');
    });

    it('should handle typical button classes', () => {
      const result = cn(
        'inline-flex items-center justify-center',
        'rounded-md text-sm font-medium',
        'ring-offset-background transition-colors',
        'focus-visible:outline-none focus-visible:ring-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'bg-primary text-primary-foreground hover:bg-primary/90',
        'h-10 px-4 py-2'
      );

      expect(result).toContain('inline-flex');
      expect(result).toContain('items-center');
      expect(result).toContain('rounded-md');
      expect(result).toContain('h-10');
      expect(result).toContain('px-4');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle numbers (converted to strings)', () => {
      // @ts-expect-error Testing runtime behavior
      expect(cn('class', 123)).toBe('class 123');
    });

    it('should handle whitespace-only strings', () => {
      expect(cn('  ')).toBe('');
    });

    it('should handle extra whitespace between classes', () => {
      expect(cn('foo  bar')).toBe('foo bar');
    });

    it('should handle undefined in array', () => {
      expect(cn(['foo', undefined, 'bar'])).toBe('foo bar');
    });

    it('should preserve identical non-tailwind classes', () => {
      // Note: clsx + tailwind-merge only deduplicates Tailwind utility conflicts
      // Custom classes are kept as-is
      expect(cn('foo', 'foo', 'foo')).toBe('foo foo foo');
    });
  });
});
