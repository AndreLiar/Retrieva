'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /chat has moved to /copilot — keep this redirect so existing bookmarks/links still work
export default function ChatRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/copilot');
  }, [router]);
  return null;
}
