'use client';

import React, { useState } from 'react';
import { GamePhase, GameSessionState, PlayerRole } from '@/lib/types';
import {
  Check,
  Copy,
  Link2,
  MessageCircle,
  RotateCcw,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface FunnelHeaderProps {
  session: GameSessionState;
  deviceRole: PlayerRole;
  onResetGame: () => void;
}

export async function copyTextResilient(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to textarea execCommand fallback (needed on non-HTTPS LAN IPs)
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function FunnelHeader({
  session,
  deviceRole,
  onResetGame,
}: FunnelHeaderProps) {
  const { phase, user1Name, user2Name, playMode, roomCode, isOpenInvite } =
    session;
  const [copiedLink, setCopiedLink] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const getActiveStep = (p: GamePhase): 4 | 2 | 1 | null => {
    switch (p) {
      case 'Q_PAGE_1':
      case 'Q_PAGE_2':
      case 'GENERATING':
      case 'U1_REVIEW_4':
      case 'U2_VETOED':
        return 4;
      case 'HANDOFF_TO_U2':
      case 'U2_PICK_2':
        return 2;
      case 'HANDOFF_TO_U1':
      case 'U1_PICK_1':
      case 'WINNER':
        return 1;
      default:
        return null;
    }
  };

  const getTurnLabel = (p: GamePhase): string => {
    switch (p) {
      case 'Q_PAGE_1':
      case 'Q_PAGE_2':
        return `${user1Name}’s Turn • Cravings`;
      case 'GENERATING':
        return `Curating 4 Spots for ${user1Name}…`;
      case 'U1_REVIEW_4':
        return `${user1Name}’s Turn • Lock 4`;
      case 'HANDOFF_TO_U2':
      case 'U2_PICK_2':
        return `${user2Name}’s Turn • Pick 2`;
      case 'U2_VETOED':
        return `${user1Name}’s Turn • Veto Re-roll`;
      case 'HANDOFF_TO_U1':
      case 'U1_PICK_1':
        return `${user1Name}’s Turn • Final Call`;
      case 'WINNER':
        return 'Dinner Decided';
      default:
        return '4 · 2 · 1';
    }
  };

  const activeStep = getActiveStep(phase);
  const turnLabel = getTurnLabel(phase);

  const handleShareRoom = async () => {
    const shareUrl = `${window.location.origin}/room/${roomCode}`;
    const copied = await copyTextResilient(shareUrl);
    if (copied) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          title: 'Join our 4-2-1 Game',
          text: `Join our 4-2-1 game! Room code: ${roomCode}`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // If navigator.share failed (e.g. non-HTTPS local LAN IP), open the Invite Modal
      }
    }

    setShowInviteModal(true);
  };

  const firstStepDisplayNum =
    (phase === 'HANDOFF_TO_U2' ||
      phase === 'U2_PICK_2' ||
      phase === 'HANDOFF_TO_U1' ||
      phase === 'U1_PICK_1' ||
      phase === 'WINNER') &&
    session.currentFour.length === 3
      ? 3
      : 4;

  const steps: Array<{ num: 4 | 2 | 1; badge: number; label: string }> = [
    { num: 4, badge: firstStepDisplayNum, label: `${firstStepDisplayNum} Spots` },
    { num: 2, badge: 2, label: '2 Finalists' },
    { num: 1, badge: 1, label: '1 Winner' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-ios-border bg-ios-bg/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-md flex-col gap-2.5 px-4 pb-3 pt-1.5">
        {/* Top Row: Brand Logo + Active Turn Pill + Room/Reset controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="sm" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ios-elevated px-2.5 py-1 text-xs font-semibold text-ios-label">
              <span className="h-1.5 w-1.5 rounded-full bg-ios-accent" />
              {turnLabel}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {playMode === 'two_phones' && (
              <button
                type="button"
                onClick={handleShareRoom}
                title="Share room code"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-ios-border bg-ios-card px-2.5 text-xs font-semibold text-ios-accent active:bg-ios-elevated"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>#{roomCode}</span>
                <Share2 className="h-3 w-3 opacity-70" />
              </button>
            )}

            <button
              type="button"
              onClick={onResetGame}
              aria-label="Start over"
              title="Start over"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ios-secondary transition-colors hover:text-ios-label active:bg-ios-elevated"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Segmented 4 -> 2 -> 1 Funnel Progress Bar */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-ios-border/60 bg-ios-elevated/60 p-1">
          {steps.map((step) => {
            const isCurrent = activeStep === step.num;
            const isPassed =
              (activeStep === 2 && step.num === 4) ||
              (activeStep === 1 && (step.num === 4 || step.num === 2)) ||
              phase === 'WINNER';

            return (
              <div
                key={step.num}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold transition-all duration-200 ${
                  isCurrent
                    ? 'bg-ios-card text-ios-label shadow-xs'
                    : isPassed
                    ? 'text-ios-accent'
                    : 'text-ios-secondary'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold ${
                    isCurrent
                      ? 'bg-ios-accent text-white'
                      : isPassed
                      ? 'bg-ios-accent/20 text-ios-accent'
                      : 'bg-ios-border text-ios-secondary'
                  }`}
                >
                  {step.badge}
                </span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        {playMode === 'two_phones' && (
          <div className="flex items-center justify-between px-0.5 text-[11px] text-ios-secondary">
            <span>
              This iPhone:{' '}
              <strong className="font-semibold text-ios-label">
                {deviceRole === 'user1' ? user1Name : user2Name}
              </strong>
            </span>
            {isOpenInvite || user2Name === 'Partner (Joining…)' ? (
              <button
                type="button"
                onClick={handleShareRoom}
                className="inline-flex items-center gap-1 rounded-full bg-ios-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs active:opacity-90"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Invite Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-3 w-3" />
                    <span>Send Invite Link (#{roomCode})</span>
                  </>
                )}
              </button>
            ) : (
              <span>
                Partner:{' '}
                <strong className="font-semibold text-ios-label">
                  {deviceRole === 'user1' ? user2Name : user1Name}
                </strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Resilient Share / Invite Partner Modal (works on HTTPS and local HTTP LAN IPs) */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-ios-border bg-ios-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ios-label">
                Invite Partner to Live Game
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-elevated text-ios-secondary active:opacity-80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-ios-border bg-ios-bg p-3.5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ios-secondary">
                4-Digit Room Code
              </p>
              <p className="mt-0.5 text-3xl font-black tracking-[0.25em] text-ios-label">
                {roomCode}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  const shareUrl = `${window.location.origin}/room/${roomCode}`;
                  await copyTextResilient(shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-ios-accent px-4 text-sm font-semibold text-white shadow-xs active:opacity-90"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Invite Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy Invite Link</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`sms:?&body=${encodeURIComponent(
                    `Join our 4-2-1 game! Code: ${roomCode} — ${
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/room/${roomCode}`
                        : ''
                    }`
                  )}`}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-ios-border bg-ios-bg px-3 text-xs font-semibold text-ios-label active:bg-ios-elevated"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-ios-accent" />
                  <span>iMessage / SMS</span>
                </a>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Join our 4-2-1 game! Code: ${roomCode} — ${
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/room/${roomCode}`
                        : ''
                    }`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-ios-border bg-ios-bg px-3 text-xs font-semibold text-ios-label active:bg-ios-elevated"
                >
                  <Share2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
