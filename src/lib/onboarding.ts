const ONBOARDING_KEY = 'onboarding-completed';

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}
