/**
 * @file apps/landing/src/App.tsx
 * @description Rod-komponent for den offentlige Landing-applikation (`@platform/landing`, Port 5173).
 *
 * FORMÅL (Til Censor, Vejleder & Udviklere):
 * Denne applikation afvikles som et isoleret Vite-build uden adgang til Dashboard-koden.
 * Den monterer udelukkende `LandingFeatureView`, som håndterer uautentificeret trafik og
 * sender brugeren videre til OIDC/Dashboard via `AuthGateway`.
 */

import React from "react";
import { LandingFeatureView } from "./features/landing/LandingFeature";

export const App: React.FC = () => {
  return <LandingFeatureView />;
};

export default App;
