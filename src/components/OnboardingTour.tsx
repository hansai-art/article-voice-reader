import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Plus, Play, Sparkles, Rocket, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

const ONBOARDING_KEY = 'onboarding-completed';

const steps = [
  { icon: BookOpen, titleKey: 'onboardingWelcomeTitle' as const, descKey: 'onboardingWelcomeDesc' as const },
  { icon: Plus, titleKey: 'onboardingAddTitle' as const, descKey: 'onboardingAddDesc' as const },
  { icon: Play, titleKey: 'onboardingPlayerTitle' as const, descKey: 'onboardingPlayerDesc' as const },
  { icon: Sparkles, titleKey: 'onboardingFeaturesTitle' as const, descKey: 'onboardingFeaturesDesc' as const },
  { icon: Rocket, titleKey: 'onboardingStartTitle' as const, descKey: 'onboardingStartDesc' as const },
];

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function OnboardingTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const { t } = useLanguage();

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-sm bg-background rounded-2xl shadow-2xl p-8 text-center"
      >
        {/* Skip button */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step content with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Icon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-3">{t(current.titleKey)}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{t(current.descKey)}</p>
          </motion.div>
        </AnimatePresence>

        {/* Dots indicator */}
        <div className="flex justify-center gap-1.5 mt-8 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('back')}
          </Button>
          {isLast ? (
            <Button size="sm" onClick={finish} className="gap-1 px-6">
              {t('onboardingDone')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1">
              {t('onboardingNext')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
