"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: BookingFeature.tsx (Role-Guarded Vertical Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/appointment/AppointmentFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Demonstrerer deklarativ Separation of Concerns (SoC) via
 * [Component: <RoleGuard allowed={["CLIENT", "PROVIDER"]} />].
 * Både klienter (`CLIENT`) og behandlere (`PROVIDER` / `THERAPIST`) har adgang
 * til booking- og kalendermodulet ([Component: <AppointmentFeatureView />]),
 * mens en ren `MANAGEMENT`-rolle afvises med `data-testid="forbidden-notice"`.
 * ============================================================================
 */

import React from "react";
import { RoleGuard } from "../../core/baseUiCore";
import {
  AppointmentDto,
  AppointmentFeatureView,
} from "../appointment/AppointmentFeature";

export type BookingDto = AppointmentDto;

/**
 * Role-Guarded Booking Vertical Slice (Shared between CLIENT and PROVIDER / THERAPIST).
 */
export const BookingFeatureView: React.FC = () => {
  return (
    <RoleGuard
      allowed={["CLIENT", "PROVIDER"]}
      fallback={
        <div
          className="max-w-2xl mx-auto my-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-amber-900 shadow-sm flex items-start gap-3"
          data-testid="forbidden-notice"
        >
          <i className="bi bi-shield-lock text-lg text-amber-700 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold m-0">Adgang begrænset</p>
            <p className="text-sm text-amber-800 mt-1 mb-0">
              Kun klienter og terapeuter har adgang til booking og kalender.
            </p>
          </div>
        </div>
      }
    >
      <AppointmentFeatureView />
    </RoleGuard>
  );
};

export default BookingFeatureView;
