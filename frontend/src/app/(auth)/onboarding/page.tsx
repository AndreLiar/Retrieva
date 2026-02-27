'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/lib/stores/auth-store';
import { organizationsApi } from '@/lib/api/organizations';
import { getErrorMessage } from '@/lib/api';

const onboardingSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  industry: z.enum(['insurance', 'banking', 'investment', 'payments', 'other']),
  country: z.string().max(100).optional(),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized, fetchUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/login');
    }
    // If user already has an org, skip onboarding
    if (isInitialized && isAuthenticated && user?.organizationId) {
      router.replace('/assessments');
    }
  }, [isInitialized, isAuthenticated, user?.organizationId, router]);

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: '',
      industry: 'other',
      country: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: OnboardingFormData) => {
    setError(null);
    try {
      await organizationsApi.create({
        name: data.name,
        industry: data.industry,
        country: data.country || '',
      });
      // Re-fetch user so auth store gets org data
      await fetchUser();
      toast.success(`${data.name} created! Welcome to Retrieva.`);
      router.push('/assessments');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!isInitialized || !isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Building2 className="h-10 w-10 mx-auto text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">Create your organization</h2>
        <p className="text-sm text-muted-foreground">
          Set up your company account to manage DORA compliance for all vendors
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
          {error}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organization name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="HDI Global SE"
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="banking">Banking</SelectItem>
                    <SelectItem value="investment">Investment / Asset Management</SelectItem>
                    <SelectItem value="payments">Payments</SelectItem>
                    <SelectItem value="other">Other Financial Services</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country <span className="text-muted-foreground">(optional)</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="Germany"
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating organization...
              </>
            ) : (
              'Create organization'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
