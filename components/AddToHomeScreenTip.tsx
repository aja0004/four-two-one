'use client';

import React, { useEffect, useState } from 'react';
import { Share, PlusSquare, X } from 'lucide-react';

const LS_DISMISSED_KEY = '421_a2hs_dismissed_v1';

export function AddToHomeScreenTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = window.localStorage.getItem(LS_DISMISSED_KEY);
      if (dismissed === '1') return;

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      const ua = window.navigator.userAgent || '';
      const isIOS = /iPhone|iPad|iPod/i.test(ua);

      if (isIOS && !isStandalone) {
        setVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(LS_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto mb-3 max-w-md px-4">
      <div className="relative flex items-center gap-3 rounded-2xl border border-ios-border bg-ios-card/90 p-3.5 shadow-sm backdrop-blur-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ios-accent/15 text-ios-accent">
          <Share className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 pr-6 text-xs leading-relaxed text-ios-secondary">
          <p className="font-semibold text-ios-label">Install 4-2-1 on your iPhone</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1">
            Tap <Share className="inline h-3.5 w-3.5 text-ios-accent" /> then{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-ios-label">
              <PlusSquare className="inline h-3.5 w-3.5" /> Add to Home Screen
            </span>{' '}
            for full-screen live sync.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss tip"
          className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full text-ios-secondary active:bg-ios-elevated"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
