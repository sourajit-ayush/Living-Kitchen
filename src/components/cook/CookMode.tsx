"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ListChecks,
  Microphone,
  MicrophoneSlash,
  SunDim,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useMemo } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { VoiceIntent } from "@/lib/voiceCommands";
import type { Locale } from "@/i18n/routing";
import { SPEECH_LANG } from "@/lib/speech";
import { scaleRecipe } from "@/lib/scale";
import { useFormatAmount } from "@/components/recipe/IngredientList";
import { playAlarm, primeAudio } from "@/lib/sound";
import { stepTimers } from "@/lib/timers";
import { useCookbook } from "@/store/useCookbook";
import { useScene } from "@/store/useScene";
import { remainingMs, timerId, useTimers } from "@/store/useTimers";
import { IngredientsDrawer } from "./IngredientsDrawer";
import { SpoonProgress } from "./SpoonProgress";
import { StepScreen } from "./StepScreen";
import { TimerDock } from "./TimerDock";
import { speak, useVoice } from "./useVoice";
import { useWakeLock } from "./useWakeLock";

const SWIPE_PX = 60;

function useCookbookHydrated() {
  return useSyncExternalStore(
    (onChange) => useCookbook.persist.onFinishHydration(onChange),
    () => useCookbook.persist.hasHydrated(),
    () => false,
  );
}

/** Round, high-contrast icon buttons for the dark Cook Mode chrome. */
function ChromeButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex size-12 shrink-0 items-center justify-center rounded-full text-cream-50 transition-colors duration-150 hover:bg-cream-50/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-400 aria-pressed:bg-saffron-400 aria-pressed:text-walnut-900 [&_svg]:size-6"
    >
      {children}
    </button>
  );
}

/**
 * Cook Mode (F9): full screen, one step at a time in big type over the blurred kitchen.
 * Swipe, arrow keys or voice to move; inline timer chips with a dock of running timers; the
 * ingredients checklist in a pull-up drawer; the screen kept on while it's open.
 */
export function CookMode({ id }: { id: string }) {
  const t = useTranslations("CookMode");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const hydrated = useCookbookHydrated();
  const entry = useCookbook((s) => s.entries[id]);
  const [index, setIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const [drawer, setDrawer] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const speechLang = SPEECH_LANG[locale];
  const wakeLock = useWakeLock(!!entry);

  const steps = useMemo(() => entry?.recipe.steps ?? [], [entry]);
  const total = steps.length;
  const current = index ?? Math.min(entry?.step ?? 0, total);
  const step = current < total ? steps[current] : null;

  const go = useCallback(
    (next: number) => {
      if (!entry) return;
      const clamped = Math.max(0, Math.min(total, next));
      setDirection(clamped >= current ? 1 : -1);
      setIndex(clamped);
      useCookbook.getState().setStep(id, clamped);
    },
    [entry, total, current, id],
  );

  // The background kitchen acts out the step; plating at the end; back to normal on exit.
  useEffect(() => {
    if (!entry) return;
    useScene.setState({
      cookAction: step ? step.action : "plate",
      cookCategory: entry.recipe.category,
    });
  }, [entry, step]);
  useEffect(() => () => useScene.setState({ cookAction: null }), []);

  // Announce each step for screen readers (focus stays on the button you used).
  useEffect(() => {
    if (!entry) return;
    setAnnouncement(step ? `${t("stepOf", { n: step.n, total })}. ${step.text}` : t("doneTitle"));
  }, [entry, step, total, t]);

  // Timers: check for finished ones a few times a second, then ring, buzz and announce.
  useEffect(() => {
    const id = setInterval(() => {
      for (const timer of useTimers.getState().tick()) {
        playAlarm();
        navigator.vibrate?.([300, 150, 300, 150, 300]);
        setAnnouncement(
          t("timerDone", { label: timer.label || t("timerFromStep", { n: timer.stepN }) }),
        );
      }
    }, 500);
    return () => clearInterval(id);
  }, [t]);

  const startStepTimer = useCallback(() => {
    if (!entry || !step) return;
    const timers = stepTimers(step);
    const store = useTimers.getState();
    const i = timers.findIndex((_, k) => {
      const existing = store.timers.find((x) => x.id === timerId(id, step.n, k));
      return !existing || existing.status === "paused";
    });
    if (i < 0) return;
    const tid = timerId(id, step.n, i);
    const existing = store.timers.find((x) => x.id === tid);
    primeAudio();
    if (existing) store.resume(tid);
    else
      store.start({
        id: tid,
        recipeId: id,
        stepN: step.n,
        label: timers[i].label || t("minutes", { count: Math.round(timers[i].seconds / 60) }),
        durationMs: timers[i].seconds * 1000,
      });
  }, [entry, step, id, t]);

  const stopTimers = useCallback(() => {
    const store = useTimers.getState();
    const running = store.timers.filter((x) => x.recipeId === id && x.status === "running");
    const onThisStep = running.filter((x) => x.stepN === step?.n);
    for (const timer of onThisStep.length ? onThisStep : running) store.pause(timer.id);
  }, [id, step]);

  const formatAmount = useFormatAmount();
  const [help, setHelp] = useState(false);
  const say = useCallback((text: string) => speak(text, speechLang), [speechLang]);
  const spokenTime = useCallback(
    (ms: number) => {
      const total = Math.ceil(ms / 1000);
      return t("sayMinSec", { min: Math.floor(total / 60), sec: total % 60 }).trim();
    },
    [t],
  );

  /** A timer of any length, from the voice ("timer for 5 minutes"), on the current step. */
  const startVoiceTimer = useCallback(
    (seconds: number) => {
      if (!entry) return;
      const stepN = step?.n ?? total;
      const store = useTimers.getState();
      const taken = new Set(store.timers.map((x) => x.id));
      let k = 100;
      while (taken.has(timerId(id, stepN, k))) k++;
      const label = spokenTime(seconds * 1000);
      primeAudio();
      store.start({
        id: timerId(id, stepN, k),
        recipeId: id,
        stepN,
        label,
        durationMs: seconds * 1000,
      });
      say(t("sayTimerSet", { label }));
    },
    [entry, step, total, id, spokenTime, say, t],
  );

  const onCommand = useCallback(
    (intent: VoiceIntent) => {
      if (intent.type === "timer") return startVoiceTimer(intent.seconds);
      if (intent.type === "goTo") {
        if (intent.step >= 1 && intent.step <= total) go(intent.step - 1);
        else say(t("sayNoStep", { n: intent.step }));
        return;
      }
      const { command } = intent;
      if (command === "next") go(current + 1);
      else if (command === "back") go(current - 1);
      else if (command === "repeat" && step) say(step.text);
      else if (command === "startTimer") startStepTimer();
      else if (command === "stopTimer") stopTimers();
      else if (command === "ingredients" && entry) {
        setDrawer(true);
        const list = scaleRecipe(entry.recipe, entry.servings, entry.unitSystem)
          .ingredients.map((ing) => `${formatAmount(ing)} ${ing.name}`)
          .join(", ");
        say(t("sayIngredients", { list }));
      } else if (command === "whatsNext") {
        const next = steps[current + 1];
        say(next ? t("sayNextStep", { n: next.n, text: next.text }) : t("sayLastStep"));
      } else if (command === "timeLeft") {
        const now = Date.now();
        const running = useTimers
          .getState()
          .timers.filter((x) => x.recipeId === id && x.status === "running");
        say(
          running.length
            ? running
                .map((x) =>
                  t("sayTimeLeft", { label: x.label, time: spokenTime(remainingMs(x, now)) }),
                )
                .join(" ")
            : t("sayNoTimer"),
        );
      } else if (command === "help") {
        setHelp(true);
        say(t("sayHelp"));
      }
    },
    [
      go,
      current,
      step,
      steps,
      total,
      id,
      entry,
      say,
      t,
      formatAmount,
      spokenTime,
      startStepTimer,
      startVoiceTimer,
      stopTimers,
    ],
  );
  const voice = useVoice(speechLang, onCommand);
  const listening = voice.state === "listening";

  // Voice stays on from one Cook Mode to the next once the cook has switched it on.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !voice.supported || !entry) return;
    autoStarted.current = true;
    try {
      if (localStorage.getItem("lk-voice") === "on") voice.start();
    } catch {
      // storage blocked: voice just starts off
    }
  }, [voice, entry]);
  const toggleVoice = () => {
    const on = !listening;
    if (on) voice.start();
    else voice.stop();
    try {
      localStorage.setItem("lk-voice", on ? "on" : "off");
    } catch {
      // storage blocked
    }
  };

  // Hands-free: while voice is on, each new step is read aloud.
  const lastSpoken = useRef<number | null>(null);
  useEffect(() => {
    if (!listening || !step || lastSpoken.current === step.n) return;
    lastSpoken.current = step.n;
    speak(step.text, speechLang);
  }, [listening, step, speechLang]);

  // Arrow keys / Page Up-Down move between steps (not while the drawer is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (drawer || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(current + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(current - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, go, current]);

  if (!hydrated) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="fixed inset-0 z-30 flex items-center justify-center bg-walnut-900/55 text-cream-50 outline-none"
      >
        <p className="font-hand text-2xl">{t("loading")}</p>
      </main>
    );
  }

  if (!entry) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-walnut-900/60 px-6 text-center text-cream-50 outline-none"
      >
        <h1 className="type-h1">{t("notFoundTitle")}</h1>
        <p className="max-w-[44ch] text-lg text-cream-50/85">{t("notFoundBody")}</p>
        <Link
          href="/"
          className="inline-flex h-14 items-center rounded-full bg-tomato-600 px-6 text-lg font-semibold text-white"
        >
          {t("backToKitchen")}
        </Link>
      </main>
    );
  }

  const exit = () => {
    voice.stop();
    window.speechSynthesis?.cancel();
    router.push("/");
  };

  return (
    <main
      id="main"
      tabIndex={-1}
      data-cook-mode
      className="fixed inset-0 z-30 flex flex-col bg-walnut-900/55 text-cream-50 outline-none"
    >
      <h1 className="sr-only">
        {t("title")}: {entry.recipe.title}
      </h1>
      <header className="flex items-center gap-1 px-3 pt-[max(env(safe-area-inset-top),12px)] pb-1">
        <ChromeButton label={t("exit")} onClick={exit}>
          <X weight="bold" />
        </ChromeButton>
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="truncate font-display text-lg font-semibold">{entry.recipe.title}</p>
          <p className="type-meta text-cream-50/75 tabular" data-step-counter>
            {step ? t("stepOf", { n: step.n, total }) : t("doneTitle")}
          </p>
        </div>
        {wakeLock && (
          <span
            title={t("wakeLock")}
            className="flex size-12 items-center justify-center text-saffron-400"
          >
            <SunDim weight="duotone" aria-hidden className="size-6" />
            <span className="sr-only">{t("wakeLock")}</span>
          </span>
        )}
        {voice.supported && (
          <ChromeButton
            label={listening ? t("voiceOn") : t("voiceOff")}
            pressed={listening}
            onClick={toggleVoice}
          >
            {listening ? <Microphone weight="fill" /> : <MicrophoneSlash />}
          </ChromeButton>
        )}
      </header>

      <div className="px-5 pb-2">
        <SpoonProgress step={Math.min(current + 1, total)} total={total} label={t("progress")} />
        {(listening || voice.state === "denied") && (
          <p className="mt-1 text-center text-sm text-cream-50/80" role="status">
            {voice.state === "denied" ? t("voiceDenied") : t("voiceListening")}
          </p>
        )}
        {listening && (
          <div className="mt-1 text-center">
            <button
              type="button"
              aria-expanded={help}
              aria-controls="voice-help"
              onClick={() => setHelp((h) => !h)}
              className="rounded-full px-3 py-1 text-sm text-saffron-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-saffron-400"
            >
              {t("voiceHelpButton")}
            </button>
            {help && (
              <div
                id="voice-help"
                className="mx-auto mt-2 max-w-md rounded-card bg-walnut-900/80 px-4 py-3 text-left text-sm text-cream-50"
              >
                <p className="mb-1 font-semibold">{t("voiceHelpTitle")}</p>
                <ul className="grid gap-0.5 sm:grid-cols-2">
                  {(t.raw("voiceHelpItems") as string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex-1 touch-pan-y overflow-y-auto px-6 py-6 sm:px-10"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5)
            go(current + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={step ? step.n : "done"}
              initial={{ opacity: 0, x: 40 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * direction, transition: { duration: 0.15 } }}
            >
              {step ? (
                <StepScreen recipeId={id} step={step} total={total} />
              ) : (
                <div className="flex flex-col items-start gap-5">
                  <CheckCircle weight="duotone" className="size-16 text-saffron-400" aria-hidden />
                  <h2 className="font-display text-5xl font-semibold">{t("doneTitle")}</h2>
                  <p className="text-2xl text-cream-50/85">{t("doneBody")}</p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={exit}
                      className="inline-flex h-14 items-center rounded-full bg-tomato-600 px-6 text-lg font-semibold text-white hover:bg-chilli-700"
                    >
                      {t("backToRecipe")}
                    </button>
                    <button
                      type="button"
                      onClick={() => go(0)}
                      className="inline-flex h-14 items-center rounded-full border border-cream-50/40 px-6 text-lg font-medium hover:bg-cream-50/10"
                    >
                      {t("restart")}
                    </button>
                  </div>
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      <TimerDock recipeId={id} onGoToStep={(n) => go(n - 1)} />

      <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          type="button"
          onClick={() => go(current - 1)}
          disabled={current === 0}
          className="inline-flex h-14 items-center justify-center gap-2 justify-self-start rounded-full border border-cream-50/40 px-5 text-lg font-medium hover:bg-cream-50/10 disabled:opacity-40"
        >
          <ArrowLeft aria-hidden className="size-5" />
          {t("prev")}
        </button>
        <ChromeButton label={t("ingredients")} onClick={() => setDrawer(true)}>
          <ListChecks />
        </ChromeButton>
        {step ? (
          <button
            type="button"
            onClick={() => go(current + 1)}
            className="inline-flex h-14 items-center justify-center gap-2 justify-self-end rounded-full bg-tomato-600 px-6 text-lg font-semibold text-white shadow-pill hover:bg-chilli-700"
          >
            {current === total - 1 ? t("finish") : t("next")}
            <ArrowRight aria-hidden className="size-5" />
          </button>
        ) : (
          <span />
        )}
      </footer>
      <p className="sr-only max-sm:hidden">{t("swipeHint")}</p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <IngredientsDrawer entry={entry} open={drawer} onOpenChange={setDrawer} />
    </main>
  );
}
