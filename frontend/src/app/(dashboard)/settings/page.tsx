'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, User, Mail, Shield, Bell, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import axios from 'axios';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';
import { authApi } from '@/lib/api';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const RESEND_COOLDOWN_SECONDS = 60;

type ProfileFormData = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    syncAlerts: true,
    weeklyDigest: false,
  });
  const [resendCooldownEnd, setResendCooldownEnd] = useState<Date | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    if (!resendCooldownEnd) return;

    const updateRemaining = () => {
      const remainingMs = resendCooldownEnd.getTime() - Date.now();
      if (remainingMs <= 0) {
        setCooldownRemaining(0);
        setResendCooldownEnd(null);
        return;
      }
      setCooldownRemaining(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();
    cooldownIntervalRef.current = setInterval(updateRemaining, 1000);
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [resendCooldownEnd]);

  const startResendCooldown = () => {
    setResendCooldownEnd(new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000));
  };

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  });

  // Reset form when user data becomes available
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name || '',
        email: user.email || '',
      });
    }
  }, [user, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await authApi.updateProfile(data);
      return response.data?.user;
    },
    onSuccess: (updatedUser) => {
      if (updatedUser) {
        updateUser(updatedUser);
      }
      toast.success('Profile updated successfully');
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await authApi.resendVerification();
      return response;
    },
    onSuccess: () => {
      startResendCooldown();
      toast.success('Verification email sent! Check your inbox.');
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error) && error.response) {
        // Handle rate limiting (429)
        if (error.response.status === 429) {
          startResendCooldown();
          const message = error.response.data?.message ??
            'Please wait before requesting another verification email.';
          toast.error(message);
          return;
        }
        // Handle already verified (400) or other errors with backend message
        if (error.response.status === 400) {
          const message = error.response.data?.message ?? 'Unable to send verification email';
          toast.info(message); // Use info toast for "already verified" messages
          return;
        }
        // Handle other errors with backend message if available
        const message = error.response.data?.message ?? 'Failed to send verification email';
        toast.error(message);
        return;
      }
      toast.error('Failed to send verification email');
    },
  });

  const isResendButtonDisabled = resendVerificationMutation.isPending || cooldownRemaining > 0;

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Your personal information and profile settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) =>
                updateProfileMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} disabled />
                    </FormControl>
                    <FormDescription>
                      Email cannot be changed. Contact support if you need to update it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Email Verification Status */}
      {!user?.isEmailVerified && (
        <Card className="mb-6 border-warning/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Verification
              <Badge variant="outline" className="ml-2 text-warning border-warning/50">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Verified
              </Badge>
            </CardTitle>
            <CardDescription>
              Please verify your email address to access all features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              We sent a verification email to <strong>{user?.email}</strong>.
              Click the link in the email to verify your account.
            </p>
            <Button
              variant="outline"
              onClick={() => resendVerificationMutation.mutate()}
              disabled={isResendButtonDisabled}
            >
              {resendVerificationMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {cooldownRemaining > 0
                ? `Please wait ${cooldownRemaining}s`
                : 'Resend Verification Email'}
            </Button>
            {cooldownRemaining > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Requests are limited to once per minute to protect your verification link.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {user?.isEmailVerified && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Verification
              <Badge variant="default" className="ml-2 bg-success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your email address has been verified.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notification Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Choose what notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch
              checked={notificationSettings.emailNotifications}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({
                  ...prev,
                  emailNotifications: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sync Alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when Notion syncs complete or fail
              </p>
            </div>
            <Switch
              checked={notificationSettings.syncAlerts}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({
                  ...prev,
                  syncAlerts: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Weekly Digest</p>
              <p className="text-sm text-muted-foreground">
                Receive a weekly summary of activity
              </p>
            </div>
            <Switch
              checked={notificationSettings.weeklyDigest}
              onCheckedChange={(checked) =>
                setNotificationSettings((prev) => ({
                  ...prev,
                  weeklyDigest: checked,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Security Settings Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your password and security settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings/security">
            <Button variant="outline">Manage Security Settings</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
