"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: PsychotraumatologyFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/psychotraumatology/PsychotraumatologyFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: PsychotraumatologyFeature]. Håndterer
 * klinisk traumescreening (DSM-5 PCL-5 & ITQ) og sværhedsgradsklassificering.
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: PsychotraumatologyTestDto] & Kliniske Grænseværdier
 *      (`MIN_PCL5_SCORE`, `MAX_PCL5_SCORE`, `CLINICAL_PTSD_CUTOFF_SCORE`).
 *   2. Ren Domænelogik (#calculatePcl5Severity(score))
 *      Klassificerer PCL-5 score i `Minimal`, `Mild / Sub-threshold`,
 *      `Moderate (Probable PTSD)` eller `Severe`.
 *   3. [Service: PsychotraumatologyApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<PsychotraumatologyTestDto, string>]
 *      og håndhæver gyldigt `clientUuid` samt `0 <= score <= 80` via [Class: DomainGuard].
 *   4. [Hook: useBaseCrud<PsychotraumatologyTestDto, string>(psychotraumatologyService)]
 *   5. [Component: <PsychotraumatologyFeatureView />]
 * ============================================================================
 */

import React, { useState } from 'react';
import { BaseApiService, DomainGuard, HasId } from '../../core/baseDomainCore';
import { ProblemAlert, useBaseCrud } from '../../core/baseUiCore';

// ============================================================================
// 1. DTO CONTRACT & DOMAIN HELPERS (1:1 mirror of PsychotraumatologyFeature.java)
// ============================================================================

export interface PsychotraumatologyTestDto extends HasId<string> {
  readonly id?: string;
  readonly clientUuid: string;
  readonly therapistUuid?: string | null;
  readonly testType: string;
  readonly score: number;
  readonly severity: string;
  readonly answersJson: string;
  readonly timestamp?: string;
}

export const PCL5_QUESTIONS_DA = [
  'Gentagne, forstyrrende og uønskede erindringer om en belastende oplevelse?',
  'Gentagne, forstyrrende drømme eller søvnvanskeligheder relateret til belastning?',
  'Pludselig følelse af eller handling som om den belastende hændelse skete igen?',
  'Stærk følelsesmæssig uro eller fysiske reaktioner ved påmindelser?',
  'Undgåelse af bestemte tanker, følelser eller eksterne påmindelser?',
];

export const PCL5_QUESTIONS_EN = [
  'Repeated, disturbing, and unwanted memories of a stressful experience?',
  'Repeated, disturbing dreams or sleep difficulties related to stress?',
  'Suddenly feeling or acting as if the stressful experience were actually happening again?',
  'Feeling very upset or having strong physical reactions when reminded of the experience?',
  'Avoiding memories, thoughts, feelings, or external reminders of the experience?',
];

export const MIN_PCL5_SCORE = 0;
export const MAX_PCL5_SCORE = 80;
export const MILD_PTSD_CUTOFF_SCORE = 20;
export const CLINICAL_PTSD_CUTOFF_SCORE = 33;
export const SEVERE_PTSD_CUTOFF_SCORE = 50;

export function calculatePcl5Severity(score: number): string {
  if (score >= SEVERE_PTSD_CUTOFF_SCORE) return 'Severe';
  if (score >= CLINICAL_PTSD_CUTOFF_SCORE) return 'Moderate (Probable PTSD)';
  if (score >= MILD_PTSD_CUTOFF_SCORE) return 'Mild / Sub-threshold';
  return 'Minimal';
}

// ============================================================================
// 2. FEATURE API SERVICE (Module-Private — DO NOT EXPORT! Mirrors package-private in Java)
// ============================================================================

class PsychotraumatologyApiService extends BaseApiService<PsychotraumatologyTestDto, string> {
  constructor() {
    super('/api/backend/psychotraumatology/tests');
  }

  protected override validateBeforeCreate(
    dto: Omit<PsychotraumatologyTestDto, 'id'> | PsychotraumatologyTestDto
  ): void {
    DomainGuard.require(
      Boolean(dto.clientUuid && dto.clientUuid.trim().length > 0),
      'BAD_REQUEST',
      'Klient-UUID må ikke være tomt'
    );
    DomainGuard.require(
      typeof dto.score === 'number' &&
        dto.score >= MIN_PCL5_SCORE &&
        dto.score <= MAX_PCL5_SCORE,
      'BAD_REQUEST',
      'PCL-5 score skal være mellem 0 og 80'
    );
  }
}

// Singleton instance scoped strictly to this vertical slice
const psychotraumatologyService = new PsychotraumatologyApiService();

// ============================================================================
// 3. FEATURE VIEW (Exported React Entrypoint for this Vertical Slice)
// ============================================================================

export const PsychotraumatologyFeatureView: React.FC = () => {
  const { items: tests, loading, error, createItem, deleteItem, clearError } =
    useBaseCrud(psychotraumatologyService);

  const [clientUuid, setClientUuid] = useState('');
  const [testType, setTestType] = useState('PCL-5');
  const [score, setScore] = useState<number>(25);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const severity = calculatePcl5Severity(score);
    const created = await createItem({
      clientUuid,
      testType,
      score,
      severity,
      answersJson: JSON.stringify([score]),
    });
    if (created) {
      setClientUuid('');
      setScore(25);
    }
  };

  return (
    <section
      data-testid="psychotraumatology-feature-view"
      className="p-4 card border-0 shadow-xs rounded-4 bg-white"
    >
      <h2 className="h5 fw-bold mb-3">Psykotraumatologi Screening (PCL-5 / ITQ)</h2>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        data-testid="psychotraumatology-form"
        className="mb-4 d-flex flex-wrap gap-2"
      >
        <input
          data-testid="input-clientUuid"
          placeholder="Klient UUID"
          value={clientUuid}
          onChange={(e) => setClientUuid(e.target.value)}
          className="form-control w-auto"
        />
        <select
          data-testid="select-testType"
          value={testType}
          onChange={(e) => setTestType(e.target.value)}
          className="form-select w-auto"
        >
          <option value="PCL-5">PCL-5</option>
          <option value="ITQ">ITQ</option>
        </select>
        <input
          data-testid="input-score"
          type="number"
          placeholder="Score (0-80)"
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="form-control w-auto"
        />
        <button
          type="submit"
          data-testid="submit-psychotraumatology"
          className="btn btn-primary px-4"
        >
          Indsend Screening
        </button>
      </form>

      {loading ? (
        <p data-testid="loading-indicator">Indlæser...</p>
      ) : (
        <ul data-testid="psychotraumatology-list" className="list-group">
          {tests.map((test) => (
            <li
              key={test.id}
              data-testid={`psychotraumatology-item-${test.id}`}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>
                <strong>{test.testType}</strong> — Score: {test.score} ({test.severity})
              </span>
              {test.id && (
                <button
                  type="button"
                  data-testid={`delete-test-${test.id}`}
                  onClick={() => void deleteItem(test.id!)}
                  className="btn btn-sm btn-outline-danger"
                >
                  Slet
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
