"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TherapistClinicOnboardingView } from "@/features/clinic/ClinicPlatformFeature";

export default function ClinicPage() {
  const { update } = useSession();
  const router = useRouter();

  return (
    <div className="space-y-6" data-testid="clinic-onboarding-page">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <TherapistClinicOnboardingView
          onOnboardingSuccess={async () => {
            await update();
            router.refresh();
          }}
        />
      </section>
    </div>
  );
}
