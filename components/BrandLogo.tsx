'use client';

import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
}

/**
 * 4-2-1 Signature Brand Mark:
 * A minimalist geometric convergence symbol encoding the 4 -> 2 -> 1 funnel
 * into a sleek inverted pyramid / cloche silhouette:
 *   •  •  •  •   (4 options)
 *     ━━  ━━     (2 finalists)
 *       ●        (1 dinner winner, accented with a subtle plate ring)
 */
export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const isSmall = size === 'sm';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {/* Geometric 4 -> 2 -> 1 Funnel Emblem */}
      <div
        className={`relative flex items-center justify-center overflow-hidden border border-ios-border/80 bg-ios-card shadow-xs ${
          isSmall ? 'h-8 w-8 rounded-[10px]' : 'h-10 w-10 rounded-[13px]'
        }`}
      >
        {/* Subtle radial glow at the bottom "1" winner apex */}
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(circle at 50% 82%, var(--ios-accent), transparent 68%)',
          }}
        />

        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={isSmall ? 'h-5 w-5' : 'h-6 w-6'}
          aria-hidden="true"
        >
          {/* Subtle converging funnel guide lines */}
          <path
            d="M6.5 9.5L13 18.5L18 27.5M29.5 9.5L23 18.5L18 27.5M14.2 9.5L13 18.5M21.8 9.5L23 18.5"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Top Tier: 4 Dots (Stage 4) */}
          <circle cx="6.5" cy="9.5" r="2.1" className="fill-ios-label opacity-80" />
          <circle cx="14.2" cy="9.5" r="2.1" className="fill-ios-label opacity-80" />
          <circle cx="21.8" cy="9.5" r="2.1" className="fill-ios-label opacity-80" />
          <circle cx="29.5" cy="9.5" r="2.1" className="fill-ios-label opacity-80" />

          {/* Middle Tier: 2 Capsules (Stage 2 Finalists) */}
          <rect
            x="9.5"
            y="16.4"
            width="6.8"
            height="4.2"
            rx="2.1"
            className="fill-ios-label"
          />
          <rect
            x="19.7"
            y="16.4"
            width="6.8"
            height="4.2"
            rx="2.1"
            className="fill-ios-label"
          />

          {/* Bottom Apex: 1 Accent Plate & Core Dot (The 1 Dinner Winner) */}
          <circle
            cx="18"
            cy="27.2"
            r="4.6"
            className="stroke-ios-accent"
            strokeOpacity="0.35"
            strokeWidth="1.4"
          />
          <circle cx="18" cy="27.2" r="2.6" className="fill-ios-accent" />
        </svg>
      </div>

      {/* Clean Minimalist Wordmark */}
      <div className="flex items-baseline">
        <span
          className={`font-extrabold tracking-tight text-ios-label ${
            isSmall ? 'text-base' : 'text-[22px]'
          }`}
        >
          4
        </span>
        <span
          className={`mx-0.5 font-bold text-ios-accent ${
            isSmall ? 'text-xs' : 'text-sm'
          }`}
        >
          ·
        </span>
        <span
          className={`font-extrabold tracking-tight text-ios-label ${
            isSmall ? 'text-base' : 'text-[22px]'
          }`}
        >
          2
        </span>
        <span
          className={`mx-0.5 font-bold text-ios-accent ${
            isSmall ? 'text-xs' : 'text-sm'
          }`}
        >
          ·
        </span>
        <span
          className={`font-extrabold tracking-tight text-ios-label ${
            isSmall ? 'text-base' : 'text-[22px]'
          }`}
        >
          1
        </span>
      </div>
    </div>
  );
}
