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
import { ProblemAlert, useBaseCrud, useOptionalAuth } from '../../core/baseUiCore';
import { SupportedUiLocale, useUiLocale } from '../i18n/I18nFeature';

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

interface PsychotraumaCopy {
  badge: string;
  clientHeading: string;
  providerHeading: string;
  questionsIntro: string;
  questions: readonly string[];
  clientUuidPlaceholder: string;
  scorePlaceholder: string;
  submitBtn: string;
  loadingText: string;
  scoreLabel: string;
  deleteBtn: string;
}

const PSYCHOTRAUMA_COPY: Record<SupportedUiLocale, PsychotraumaCopy> = {
  da: {
    badge: 'Psykotraumatologi',
    clientHeading: 'Min Psykotraumatologi Screening (PCL-5 / ITQ)',
    providerHeading: 'Psykotraumatologi Screening (PCL-5 / ITQ)',
    questionsIntro: 'Vejledende PCL-5 spørgsmål før selvevaluering (0–80 point):',
    questions: PCL5_QUESTIONS_DA,
    clientUuidPlaceholder: 'Klient UUID',
    scorePlaceholder: 'Score (0-80)',
    submitBtn: 'Indsend Screening',
    loadingText: 'Indlæser...',
    scoreLabel: 'Score',
    deleteBtn: 'Slet',
  },
  en: {
    badge: 'Psychotraumatology',
    clientHeading: 'My Psychotraumatology Screening (PCL-5 / ITQ)',
    providerHeading: 'Psychotraumatology Screening (PCL-5 / ITQ)',
    questionsIntro: 'Reference PCL-5 questions before self-assessment (0–80 points):',
    questions: PCL5_QUESTIONS_EN,
    clientUuidPlaceholder: 'Client UUID',
    scorePlaceholder: 'Score (0-80)',
    submitBtn: 'Submit Screening',
    loadingText: 'Loading...',
    scoreLabel: 'Score',
    deleteBtn: 'Delete',
  },
  fr: {
    badge: 'Psychotraumatologie',
    clientHeading: 'Mon Dépistage Psychotraumatologique (PCL-5 / ITQ)',
    providerHeading: 'Dépistage Psychotraumatologique (PCL-5 / ITQ)',
    questionsIntro: 'Questions indicatives PCL-5 avant l’auto-évaluation (0–80 points) :',
    questions: [
      'Souvenirs répétés, perturbants et involontaires d’une expérience stressante ?',
      'Rêves répétés et perturbants ou troubles du sommeil liés au stress ?',
      'Sentiment soudain ou impression de revivre l’événement stressant comme s’il se reproduisait ?',
      'Forte détresse émotionnelle ou réactions physiques lors de rappels de l’événement ?',
      'Évitement de souvenirs, pensées, émotions ou rappels externes liés à l’expérience ?',
    ],
    clientUuidPlaceholder: 'UUID Client',
    scorePlaceholder: 'Score (0-80)',
    submitBtn: 'Envoyer le Dépistage',
    loadingText: 'Chargement...',
    scoreLabel: 'Score',
    deleteBtn: 'Supprimer',
  },
  es: {
    badge: 'Psicotraumatología',
    clientHeading: 'Mi Cribado de Psicotraumatología (PCL-5 / ITQ)',
    providerHeading: 'Cribado de Psicotraumatología (PCL-5 / ITQ)',
    questionsIntro: 'Preguntas orientativas PCL-5 antes de la autoevaluación (0–80 puntos):',
    questions: [
      '¿Recuerdos repetidos, perturbadores y no deseados de una experiencia estresante?',
      '¿Sueños repetidos y perturbadores o dificultades para dormir relacionadas con el estrés?',
      '¿Sensación o actuación repentina como si la experiencia estresante estuviera ocurriendo de nuevo?',
      '¿Malestar emocional intenso o reacciones físicas al recordar la experiencia?',
      '¿Evitación de recuerdos, pensamientos, sentimientos o recordatorios externos de la experiencia?',
    ],
    clientUuidPlaceholder: 'UUID del cliente',
    scorePlaceholder: 'Puntuación (0-80)',
    submitBtn: 'Enviar Cribado',
    loadingText: 'Cargando...',
    scoreLabel: 'Puntuación',
    deleteBtn: 'Eliminar',
  },
  de: {
    badge: 'Psychotraumatologie',
    clientHeading: 'Mein Psychotraumatologie-Screening (PCL-5 / ITQ)',
    providerHeading: 'Psychotraumatologie-Screening (PCL-5 / ITQ)',
    questionsIntro: 'Orientierende PCL-5-Fragen vor der Selbsteinschätzung (0–80 Punkte):',
    questions: [
      'Wiederholte, belastende und ungewollte Erinnerungen an ein belastendes Erlebnis?',
      'Wiederholte, belastende Träume oder Schlafstörungen im Zusammenhang mit der Belastung?',
      'Plötzliches Gefühl oder Handeln, als würde das belastende Ereignis erneut stattfinden?',
      'Starke emotionale Belastung oder körperliche Reaktionen bei Erinnerungsreizen?',
      'Vermeidung von Erinnerungen, Gedanken, Gefühlen oder äußeren Auslösern?',
    ],
    clientUuidPlaceholder: 'Klient UUID',
    scorePlaceholder: 'Score (0-80)',
    submitBtn: 'Screening einreichen',
    loadingText: 'Wird geladen...',
    scoreLabel: 'Score',
    deleteBtn: 'Löschen',
  },
};

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
  const locale = useUiLocale();
  const copy = PSYCHOTRAUMA_COPY[locale];
  const auth = useOptionalAuth();
  const isClientSelfView = Boolean(
    auth && !auth.hasRole('PROVIDER', 'MANAGEMENT')
  );
  const { items: tests, loading, error, createItem, deleteItem, clearError } =
    useBaseCrud(psychotraumatologyService);

  const [clientUuid, setClientUuid] = useState('');
  const [testType, setTestType] = useState('PCL-5');
  const [score, setScore] = useState<number>(25);

  const effectiveClientUuid = isClientSelfView ? auth!.user.id : clientUuid;
  const visibleTests = isClientSelfView
    ? tests.filter((t) => !t.clientUuid || t.clientUuid === auth!.user.id)
    : tests;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const severity = calculatePcl5Severity(score);
    const created = await createItem({
      clientUuid: effectiveClientUuid,
      testType,
      score,
      severity,
      answersJson: JSON.stringify([score]),
    });
    if (created) {
      if (!isClientSelfView) {
        setClientUuid('');
      }
      setScore(25);
    }
  };

  return (
    <section
      data-testid="psychotraumatology-feature-view"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <i className="bi bi-clipboard2-pulse" aria-hidden="true" />
          {copy.badge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {isClientSelfView ? copy.clientHeading : copy.providerHeading}
        </h2>
      </div>

      <ProblemAlert problem={error} onDismiss={clearError} />

      {isClientSelfView && (
        <div
          data-testid="pcl5-questions-reference"
          className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700"
        >
          <p className="mb-1.5 font-semibold text-slate-900">
            {copy.questionsIntro}
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            {copy.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        data-testid="psychotraumatology-form"
        className="flex flex-wrap items-center gap-2.5"
      >
        {!isClientSelfView && (
          <input
            data-testid="input-clientUuid"
            placeholder={copy.clientUuidPlaceholder}
            value={clientUuid}
            onChange={(e) => setClientUuid(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        )}
        <select
          data-testid="select-testType"
          value={testType}
          onChange={(e) => setTestType(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
        >
          <option value="PCL-5">PCL-5</option>
          <option value="ITQ">ITQ</option>
        </select>
        <input
          data-testid="input-score"
          type="number"
          placeholder={copy.scorePlaceholder}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <button
          type="submit"
          data-testid="submit-psychotraumatology"
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {copy.submitBtn}
        </button>
      </form>

      {loading ? (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      ) : (
        <ul data-testid="psychotraumatology-list" className="space-y-2">
          {visibleTests.map((test) => (
            <li
              key={test.id}
              data-testid={`psychotraumatology-item-${test.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
            >
              <span>
                <strong className="text-slate-900">{test.testType}</strong> — {copy.scoreLabel}:{' '}
                {test.score}{' '}
                <span
                  className={`ml-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    test.score >= CLINICAL_PTSD_CUTOFF_SCORE
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-teal-50 text-teal-800'
                  }`}
                >
                  ({test.severity})
                </span>
              </span>
              {!isClientSelfView && test.id && (
                <button
                  type="button"
                  data-testid={`delete-test-${test.id}`}
                  onClick={() => void deleteItem(test.id!)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  {copy.deleteBtn}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
