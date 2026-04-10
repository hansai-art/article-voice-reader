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

export function OnboardingTour({ onComplete, onTryDemo }: { onComplete: () => void; onTryDemo?: () => void }) {
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
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto w-full max-w-lg mx-auto bg-background border border-border rounded-2xl shadow-2xl p-6"
      >
        {/* Skip button */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step content with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-4"
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold">{t(current.titleKey)}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mt-0.5">{t(current.descKey)}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dots + Navigation */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step - 1)}
                className="gap-1 h-8"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('back')}
              </Button>
            )}
            {isLast ? (
              <div className="flex items-center gap-2">
                {onTryDemo && (
                  <Button size="sm" variant="outline" onClick={() => { finish(); onTryDemo(); }} className="gap-1 h-8">
                    {t('onboardingTryDemo')}
                  </Button>
                )}
                <Button size="sm" onClick={finish} className="gap-1 px-5 h-8">
                  {t('onboardingDone')}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1 h-8">
                {t('onboardingNext')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
