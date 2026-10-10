"use client";

import { Check, X } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { angleAt, plateAtFront } from "@/lib/wheel";
import { useScene } from "@/store/useScene";
import { useSurprise } from "@/store/useSurprise";
import { Button, IconButton } from "@/components/ui/Button";
import type { Locale } from "@/i18n/routing";

/** The plate at the front right now, following the shared spin plan frame by frame. */
function useFrontPlate() {
  const status = useSurprise((s) => s.status);
  const plan = useSurprise((s) => s.plan);
  const startedAt = useSurprise((s) => s.startedAt);
  const target = useSurprise((s) => s.target);
  const [front, setFront] = useState(0);
  useEffect(() => {
    if (status !== "spinning" || !plan) return;
    let raf = 0;
    const tick = () => {
      setFront(plateAtFront(angleAt(plan, performance.now() - startedAt)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [status, plan, startedAt]);
  return status === "landed" ? target : front;
}

/** Fetch ideas and spin (the dock's button and the panel's "Spin again"). */
export function useSpinSurprise() {
  const locale = useLocale() as Locale;
  return () => {
    const { wantPhysics, reducedMotion } = useScene.getState();
    wantPhysics();
    void useSurprise.getState().start(locale, { reducedMotion });
  };
}

/**
 * Surprise Me in the DOM (R3): the eight ideas, with the highlight hopping in step with the 3D
 * lazy-susan (or on its own when 3D is off). This is the readable, accessible version of the wheel.
 * Rendered in the mobile sheet and, on desktop, as a card on the right, clear of the wheel.
 */
export function SurprisePanel({ className = "" }: { className?: string }) {
  const t = useTranslations("Surprise");
  const titleId = useId();
  const spin = useSpinSurprise();
  const status = useSurprise((s) => s.status);
  const ideas = useSurprise((s) => s.ideas);
  const error = useSurprise((s) => s.error);
  const target = useSurprise((s) => s.target);
  const front = useFrontPlate();
  const ref = useRef<HTMLElement>(null);
  // In the phone sheet the panel opens below the fold: bring it into view (no-op when hidden).
  const open = status !== "idle";
  useEffect(() => {
    const el = ref.current;
    if (open && el && el.offsetParent !== null)
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  if (status === "idle") return null;

  const landed = status === "landed";
  const message =
    status === "loading"
      ? t("thinking")
      : status === "spinning"
        ? t("spinning")
        : status === "landed"
          ? t("landed", { title: ideas[target]?.title ?? "" })
          : (error ?? t("failed"));

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      data-surprise={status}
      className={`rounded-card border border-saffron-400/70 bg-saffron-400/10 p-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="type-meta text-ink-muted">
            {t("title")}
          </h3>
          {/* Announces the start, the landing and errors, not every hop of the highlight. */}
          <p role="status" className="mt-0.5 font-hand text-2xl leading-tight text-walnut-900">
            {message}
          </p>
          {landed && (
            <p className="mt-1 text-[14px] text-ink-muted">
              {ideas[target]?.oneLiner} {t("cooking")}
            </p>
          )}
        </div>
        <IconButton
          size="sm"
          aria-label={t("cancel")}
          onClick={() => useSurprise.getState().cancel()}
        >
          <X aria-hidden />
        </IconButton>
      </div>

      {ideas.length > 0 && (
        <ol aria-label={t("ideas")} className="mt-3 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
          {ideas.map((idea, i) => {
            const on = i === front;
            return (
              <li
                key={`${i}-${idea.title}`}
                data-idea={i}
                data-front={on || undefined}
                aria-current={landed && on ? "true" : undefined}
                className={`flex min-w-0 items-center gap-2 rounded-control px-2.5 py-1.5 text-[14px] transition-colors duration-100 ${
                  on
                    ? landed
                      ? "bg-basil-600 text-white"
                      : "bg-saffron-400 text-walnut-900"
                    : "bg-cream-50 text-ink"
                }`}
              >
                <span aria-hidden className="text-lg">
                  {idea.emoji}
                </span>
                <span className="truncate">{idea.title}</span>
                {landed && on && <Check weight="bold" aria-hidden className="ml-auto shrink-0" />}
              </li>
            );
          })}
        </ol>
      )}

      {status === "error" && (
        <Button variant="secondary" size="sm" onClick={spin} className="mt-3">
          {t("retry")}
        </Button>
      )}
    </section>
  );
}
