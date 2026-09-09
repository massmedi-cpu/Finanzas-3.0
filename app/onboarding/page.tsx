import AppShell from "../app-shell";
import OnboardingClient from "./onboarding-client";

export const metadata = {
  title: "Primeros pasos · Financial App",
  description: "Guía de puesta en marcha basada en el estado real de Financial App.",
};

export default function OnboardingPage() {
  return (
    <AppShell>
      <OnboardingClient />
    </AppShell>
  );
}
