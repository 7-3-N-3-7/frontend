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

import React, { useEffect, useState } from 'react';
import { BaseApiService, DomainGuard, ErrorCode, HasId } from '../../core/baseDomainCore';
import {
  ConfirmActionDialog,
  ProblemAlert,
  useBaseCrud,
  useOptionalAuth,
} from '../../core/baseUiCore';
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
  readonly createdAt?: string;
}

export interface PsychotraumatologyFeatureViewProps {
  portalMode?: 'client' | 'provider';
}

export interface ClientPickerOption {
  readonly id: string;
  readonly userId?: string | null;
  readonly fullName: string;
  readonly email?: string | null;
}

/**
 * Filtrerer `/api/backend/clinic/clients` til PCL-5 klientvælgeren:
 * udelader ugyldige rækker, den aktuelle bruger selv, lækkede behandlere (`Dr. ...` / `*_terapeut`)
 * og dubletter på både bruger-ID og normaliseret navn.
 */
export function filterPcl5ClientOptions(
  rows: unknown,
  excludeUserId?: string | null,
  excludeEmail?: string | null
): ClientPickerOption[] {
  if (!Array.isArray(rows)) return [];
  const excludedId = excludeUserId?.trim() || '';
  const excludedMail = excludeEmail?.trim().toLowerCase() || '';
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: ClientPickerOption[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const candidate = row as {
      id?: unknown;
      userId?: unknown;
      fullName?: unknown;
      email?: unknown;
    };
    if (typeof candidate.id !== 'string' || typeof candidate.fullName !== 'string') continue;
    const fullName = candidate.fullName.trim();
    if (!fullName) continue;
    if (/^dr\.\s/i.test(fullName) || /_terapeut/i.test(fullName)) continue;

    const rawUserId = typeof candidate.userId === 'string' ? candidate.userId.trim() : '';
    const effectiveId = rawUserId || candidate.id.trim();
    if (!effectiveId) continue;
    if (excludedId && effectiveId === excludedId) continue;

    const email = typeof candidate.email === 'string' ? candidate.email.trim() : '';
    if (excludedMail && email.toLowerCase() === excludedMail) continue;

    const normalizedName = fullName.toLowerCase();
    if (seenIds.has(effectiveId) || seenNames.has(normalizedName)) continue;

    seenIds.add(effectiveId);
    seenNames.add(normalizedName);
    result.push({
      id: candidate.id,
      userId: rawUserId || null,
      fullName,
      email: email || undefined,
    });
  }
  return result;
}

export interface Pcl5ClusterMeta {
  readonly id: 'B' | 'C' | 'D' | 'E';
  readonly startIndex: number;
  readonly count: number;
  readonly titles: Record<SupportedUiLocale, string>;
}

export const PCL5_QUESTIONS_DA: readonly string[] = [
  'Gentagne, forstyrrende og uønskede erindringer om den belastende oplevelse?',
  'Gentagne, forstyrrende drømme om den belastende oplevelse?',
  'Pludselig følelse eller handling som om den belastende hændelse skete igen?',
  'Stærkt følelsesmæssigt ubehag ved påmindelser om oplevelsen?',
  'Stærke fysiske reaktioner (hjertebanken, sved, vejrtrækningsbesvær) ved påmindelser?',
  'Undgåelse af erindringer, tanker eller følelser relateret til oplevelsen?',
  'Undgåelse af ydre påmindelser (steder, personer, samtaler eller aktiviteter)?',
  'Vanskelighed ved at huske vigtige dele af den belastende oplevelse?',
  'Vedvarende negative overbevisninger om dig selv, andre eller verden?',
  'Selvbebrejdelse eller bebrejdelse af andre for oplevelsen eller dens følger?',
  'Vedvarende stærke negative følelser (frygt, rædsel, vrede, skyld eller skam)?',
  'Markant nedsat interesse for eller deltagelse i vigtige aktiviteter?',
  'Følelse af afstand eller fremmedgørelse i forhold til andre mennesker?',
  'Vanskelighed ved at opleve positive følelser som glæde, kærlighed eller ro?',
  'Irritabel adfærd, vredesudbrud eller aggression over for andre?',
  'Hensynsløs eller selvdestruktiv adfærd?',
  'Konstant øget årvågenhed eller vagtsomhed ("på vagt")?',
  'Let ved at blive forskrækket eller fare sammen?',
  'Koncentrationsbesvær i hverdagen?',
  'Søvnproblemer (svært ved at falde i søvn, vågner ofte eller urolig søvn)?',
];

export const PCL5_QUESTIONS_EN: readonly string[] = [
  'Repeated, disturbing, and unwanted memories of the stressful experience?',
  'Repeated, disturbing dreams of the stressful experience?',
  'Suddenly feeling or acting as if the stressful experience were actually happening again?',
  'Feeling very upset when something reminded you of the stressful experience?',
  'Having strong physical reactions when something reminded you of the stressful experience?',
  'Avoiding memories, thoughts, or feelings related to the stressful experience?',
  'Avoiding external reminders of the stressful experience (people, places, activities)?',
  'Trouble remembering important parts of the stressful experience?',
  'Having strong negative beliefs about yourself, other people, or the world?',
  'Blaming yourself or someone else for the stressful experience or what happened after it?',
  'Having strong negative feelings such as fear, horror, anger, guilt, or shame?',
  'Loss of interest in activities that you used to enjoy?',
  'Feeling distant or cut off from other people?',
  'Trouble experiencing positive feelings (unable to feel happiness or loving feelings)?',
  'Irritable behavior, angry outbursts, or acting aggressively?',
  'Taking too many risks or doing things that could cause you harm?',
  'Being "superalert" or watchful or on guard?',
  'Feeling jumpy or easily startled?',
  'Having difficulty concentrating?',
  'Trouble falling or staying asleep?',
];

export const PCL5_QUESTIONS_BY_LOCALE: Record<SupportedUiLocale, readonly string[]> = {
  da: PCL5_QUESTIONS_DA,
  en: PCL5_QUESTIONS_EN,
  fr: [
    'Souvenirs répétés, perturbants et involontaires de l’expérience stressante ?',
    'Rêves répétés et perturbants en lien avec l’expérience stressante ?',
    'Impression soudaine ou comportement comme si l’événement se reproduisait ?',
    'Forte détresse émotionnelle lors de rappels de l’expérience ?',
    'Réactions physiques intenses (palpitations, sueurs) lors de rappels ?',
    'Évitement des souvenirs, pensées ou sentiments liés à l’expérience ?',
    'Évitement des rappels externes (personnes, lieux, conversations, activités) ?',
    'Difficulté à se souvenir d’aspects importants de l’expérience ?',
    'Croyances négatives persistantes sur soi, les autres ou le monde ?',
    'Auto-accusation ou blâme d’autrui pour l’expérience ou ses conséquences ?',
    'Émotions négatives intenses (peur, colère, culpabilité ou honte) ?',
    'Perte d’intérêt pour les activités autrefois appréciées ?',
    'Sentiment d’être distant ou coupé des autres ?',
    'Difficulté à éprouver des émotions positives (joie, affection) ?',
    'Irritabilité, crises de colère ou comportement agressif ?',
    'Prise de risques inconsidérée ou comportement autodestructeur ?',
    'Hypervigilance constante ou sentiment d’être toujours sur ses gardes ?',
    'Réactions de sursaut exagérées ?',
    'Difficultés de concentration ?',
    'Troubles de l’endormissement ou réveils nocturnes fréquents ?',
  ],
  es: [
    '¿Recuerdos repetidos, perturbadores y no deseados de la experiencia estresante?',
    '¿Sueños repetidos y perturbadores sobre la experiencia estresante?',
    '¿Sentir o actuar de repente como si la experiencia estuviera ocurriendo de nuevo?',
    '¿Malestar emocional intenso al recordar la experiencia?',
    '¿Reacciones físicas fuertes (palpitaciones, sudor) ante recordatorios?',
    '¿Evitación de recuerdos, pensamientos o sentimientos sobre la experiencia?',
    '¿Evitación de recordatorios externos (personas, lugares, actividades)?',
    '¿Dificultad para recordar partes importantes de la experiencia?',
    '¿Creencias negativas persistentes sobre uno mismo, los demás o el mundo?',
    '¿Culparse a sí mismo o a otros por la experiencia o lo sucedido después?',
    '¿Sentimientos negativos intensos como miedo, horror, ira, culpa o vergüenza?',
    '¿Pérdida de interés en actividades que antes disfrutaba?',
    '¿Sentirse distante o desconectado de los demás?',
    '¿Dificultad para experimentar sentimientos positivos (alegría o afecto)?',
    '¿Irritabilidad, arrebatos de ira o comportamiento agresivo?',
    '¿Asumir riesgos innecesarios o conductas autodestructivas?',
    '¿Estar en estado de alerta constante o hipervigilancia?',
    '¿Sobresaltarse con facilidad?',
    '¿Dificultad para concentrarse?',
    '¿Problemas para conciliar o mantener el sueño?',
  ],
  de: [
    'Wiederholte, belastende und ungewollte Erinnerungen an das Erlebnis?',
    'Wiederholte, belastende Träume über das belastende Erlebnis?',
    'Plötzliches Gefühl oder Handeln, als würde das Ereignis erneut stattfinden?',
    'Starke emotionale Belastung bei Erinnerungsreizen?',
    'Starke körperliche Reaktionen (Herzrasen, Schwitzen) bei Erinnerungsreizen?',
    'Vermeidung von Erinnerungen, Gedanken oder Gefühlen zum Erlebnis?',
    'Vermeidung äußerer Auslöser (Orte, Personen, Gespräche, Aktivitäten)?',
    'Schwierigkeiten, sich an wichtige Teile des Erlebnisses zu erinnern?',
    'Anhaltende negative Überzeugungen über sich selbst, andere oder die Welt?',
    'Selbstvorwürfe oder Schuldzuweisungen bezüglich des Erlebnisses?',
    'Starke negative Gefühle wie Angst, Wut, Schuld oder Scham?',
    'Deutlich geringeres Interesse an früher geschätzten Aktivitäten?',
    'Gefühl der Distanz oder Entfremdung von anderen Menschen?',
    'Schwierigkeiten, positive Gefühle wie Freude oder Zuneigung zu empfinden?',
    'Reizbares Verhalten, Wutausbrüche oder Aggression?',
    'Leichtsinniges oder selbstschädigendes Verhalten?',
    'Anhaltende Überwachsamkeit ("ständig auf der Hut sein")?',
    'Übertriebene Schreckhaftigkeit?',
    'Konzentrationsschwierigkeiten?',
    'Ein- oder Durchschlafstörungen?',
  ],
};

export const PCL5_CLUSTERS: readonly Pcl5ClusterMeta[] = [
  {
    id: 'B',
    startIndex: 0,
    count: 5,
    titles: {
      da: 'Del 1/4 · Genoplevelse (B)',
      en: 'Part 1/4 · Intrusion (B)',
      fr: 'Partie 1/4 · Intrusion (B)',
      es: 'Parte 1/4 · Intrusión (B)',
      de: 'Teil 1/4 · Wiedererleben (B)',
    },
  },
  {
    id: 'C',
    startIndex: 5,
    count: 2,
    titles: {
      da: 'Del 2/4 · Undgåelse (C)',
      en: 'Part 2/4 · Avoidance (C)',
      fr: 'Partie 2/4 · Évitement (C)',
      es: 'Parte 2/4 · Evitación (C)',
      de: 'Teil 2/4 · Vermeidung (C)',
    },
  },
  {
    id: 'D',
    startIndex: 7,
    count: 7,
    titles: {
      da: 'Del 3/4 · Tanker & stemning (D)',
      en: 'Part 3/4 · Cognition & Mood (D)',
      fr: 'Partie 3/4 · Pensées & humeur (D)',
      es: 'Parte 3/4 · Cognición y ánimo (D)',
      de: 'Teil 3/4 · Kognition & Stimmung (D)',
    },
  },
  {
    id: 'E',
    startIndex: 14,
    count: 6,
    titles: {
      da: 'Del 4/4 · Årvågenhed & reaktion (E)',
      en: 'Part 4/4 · Arousal & Reactivity (E)',
      fr: 'Partie 4/4 · Hyperéveil (E)',
      es: 'Parte 4/4 · Hiperactivación (E)',
      de: 'Teil 4/4 · Übererregung (E)',
    },
  },
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

const SEVERITY_LABELS: Record<SupportedUiLocale, Record<string, string>> = {
  da: {
    Minimal: 'Minimal belastning',
    'Minimal Symptoms': 'Minimal belastning',
    'Mild / Sub-threshold': 'Lettere / under klinisk grænse',
    'Moderate Symptoms': 'Moderate symptomer',
    'Moderate (Probable PTSD)': 'Moderat (klinisk grænse nået)',
    'High Symptoms (Above Clinical Threshold)': 'Høj belastning (over klinisk grænse)',
    Severe: 'Alvorlig belastning',
  },
  en: {
    Minimal: 'Minimal',
    'Minimal Symptoms': 'Minimal symptoms',
    'Mild / Sub-threshold': 'Mild / Sub-threshold',
    'Moderate Symptoms': 'Moderate symptoms',
    'Moderate (Probable PTSD)': 'Moderate (Clinical threshold)',
    'High Symptoms (Above Clinical Threshold)': 'High symptoms (Above clinical threshold)',
    Severe: 'Severe',
  },
  fr: {
    Minimal: 'Charge minimale',
    'Minimal Symptoms': 'Symptômes minimes',
    'Mild / Sub-threshold': 'Légère / infra-seuil',
    'Moderate Symptoms': 'Symptômes modérés',
    'Moderate (Probable PTSD)': 'Modérée (seuil clinique)',
    'High Symptoms (Above Clinical Threshold)': 'Symptômes élevés (au-dessus du seuil)',
    Severe: 'Sévère',
  },
  es: {
    Minimal: 'Mínima',
    'Minimal Symptoms': 'Síntomas mínimos',
    'Mild / Sub-threshold': 'Leve / subumbral',
    'Moderate Symptoms': 'Síntomas moderados',
    'Moderate (Probable PTSD)': 'Moderada (umbral clínico)',
    'High Symptoms (Above Clinical Threshold)': 'Síntomas elevados (sobre umbral clínico)',
    Severe: 'Severa',
  },
  de: {
    Minimal: 'Minimal',
    'Minimal Symptoms': 'Minimale Symptome',
    'Mild / Sub-threshold': 'Leicht / unterschwellig',
    'Moderate Symptoms': 'Mäßige Symptome',
    'Moderate (Probable PTSD)': 'Moderat (klinische Schwelle)',
    'High Symptoms (Above Clinical Threshold)': 'Hohe Symptombelastung (über Schwelle)',
    Severe: 'Schwer',
  },
};

export function localizePcl5Severity(
  severity: string,
  locale: SupportedUiLocale
): string {
  return SEVERITY_LABELS[locale][severity] ?? severity;
}

interface PsychotraumaCopy {
  badge: string;
  clientHeading: string;
  providerHeading: string;
  questionsIntro: string;
  likertLabels: readonly [string, string, string, string, string];
  answeredProgress: string;
  totalLabel: string;
  prevPartBtn: string;
  nextPartBtn: string;
  switchToManualBtn: string;
  switchToWizardBtn: string;
  clientPickerLabel: string;
  selectClientPlaceholder: string;
  manualClientOption: string;
  backToClientListBtn: string;
  clientUuidLabel: string;
  clientUuidPlaceholder: string;
  testTypeLabel: string;
  scoreLabel: string;
  scorePlaceholder: string;
  submitBtn: string;
  loadingText: string;
  emptyText: string;
  deleteBtn: string;
  deleteConfirmTitle: string;
  deleteConfirmDesc: string;
  cancelBtn: string;
  incompleteTitle: string;
  incompleteDetail: string;
}

const PSYCHOTRAUMA_COPY: Record<SupportedUiLocale, PsychotraumaCopy> = {
  da: {
    badge: 'Psykotraumatologi',
    clientHeading: 'Min Psykotraumatologi Screening (PCL-5 / ITQ)',
    providerHeading: 'Psykotraumatologi Screening (PCL-5 / ITQ)',
    questionsIntro:
      'Svar ud fra den seneste måned. Spørgeskemaet er opdelt i 4 overskuelige dele:',
    likertLabels: ['0 Slet ikke', '1 Lidt', '2 Moderat', '3 En del', '4 Ekstremt'],
    answeredProgress: 'besvaret',
    totalLabel: 'Beregnet total',
    prevPartBtn: 'Forrige del',
    nextPartBtn: 'Næste del',
    switchToManualBtn: 'Indtast samlet score manuelt',
    switchToWizardBtn: 'Brug 20-punkt spørgeskema',
    clientPickerLabel: 'Klient',
    selectClientPlaceholder: '-- Vælg klient --',
    manualClientOption: 'Indtast klient-ID manuelt',
    backToClientListBtn: 'Vælg fra liste',
    clientUuidLabel: 'Klient-ID',
    clientUuidPlaceholder: 'Klient UUID',
    testTypeLabel: 'Skematype',
    scoreLabel: 'Score',
    scorePlaceholder: 'Samlet score (0–80)',
    submitBtn: 'Indsend Screening',
    loadingText: 'Indlæser...',
    emptyText: 'Ingen screening-registreringer fundet endnu.',
    deleteBtn: 'Slet',
    deleteConfirmTitle: 'Slet screening-registrering?',
    deleteConfirmDesc:
      'Denne handling fjerner permanent den valgte screening fra oversigten.',
    cancelBtn: 'Annuller',
    incompleteTitle: 'Ufuldstændig besvarelse',
    incompleteDetail:
      'Besvar alle 20 spørgsmål før indsendelse ({answered}/20 besvaret), eller skift til manuel score.',
  },
  en: {
    badge: 'Psychotraumatology',
    clientHeading: 'My Psychotraumatology Screening (PCL-5 / ITQ)',
    providerHeading: 'Psychotraumatology Screening (PCL-5 / ITQ)',
    questionsIntro:
      'Answer based on the past month. The questionnaire is split into 4 manageable parts:',
    likertLabels: ['0 Not at all', '1 A little', '2 Moderately', '3 Quite a bit', '4 Extremely'],
    answeredProgress: 'answered',
    totalLabel: 'Calculated total',
    prevPartBtn: 'Previous part',
    nextPartBtn: 'Next part',
    switchToManualBtn: 'Enter total score manually',
    switchToWizardBtn: 'Use 20-item questionnaire',
    clientPickerLabel: 'Client',
    selectClientPlaceholder: '-- Select client --',
    manualClientOption: 'Enter client ID manually',
    backToClientListBtn: 'Pick from list',
    clientUuidLabel: 'Client ID',
    clientUuidPlaceholder: 'Client UUID',
    testTypeLabel: 'Instrument',
    scoreLabel: 'Score',
    scorePlaceholder: 'Total score (0–80)',
    submitBtn: 'Submit Screening',
    loadingText: 'Loading...',
    emptyText: 'No screening records recorded yet.',
    deleteBtn: 'Delete',
    deleteConfirmTitle: 'Delete screening record?',
    deleteConfirmDesc:
      'This action permanently removes the selected screening record.',
    cancelBtn: 'Cancel',
    incompleteTitle: 'Incomplete questionnaire',
    incompleteDetail:
      'Please answer all 20 questions before submitting ({answered}/20 answered), or switch to manual score entry.',
  },
  fr: {
    badge: 'Psychotraumatologie',
    clientHeading: 'Mon Dépistage Psychotraumatologique (PCL-5 / ITQ)',
    providerHeading: 'Dépistage Psychotraumatologique (PCL-5 / ITQ)',
    questionsIntro:
      'Répondez selon le mois écoulé. Le questionnaire est divisé en 4 parties :',
    likertLabels: ['0 Pas du tout', '1 Un peu', '2 Modérément', '3 Beaucoup', '4 Extrêmement'],
    answeredProgress: 'répondues',
    totalLabel: 'Total calculé',
    prevPartBtn: 'Partie précédente',
    nextPartBtn: 'Partie suivante',
    switchToManualBtn: 'Saisir le score manuellement',
    switchToWizardBtn: 'Utiliser le questionnaire (20 questions)',
    clientPickerLabel: 'Client',
    selectClientPlaceholder: '-- Choisir un client --',
    manualClientOption: 'Saisir l’ID client manuellement',
    backToClientListBtn: 'Choisir dans la liste',
    clientUuidLabel: 'ID Client',
    clientUuidPlaceholder: 'UUID Client',
    testTypeLabel: 'Questionnaire',
    scoreLabel: 'Score',
    scorePlaceholder: 'Score total (0–80)',
    submitBtn: 'Envoyer le Dépistage',
    loadingText: 'Chargement...',
    emptyText: 'Aucun dépistage enregistré.',
    deleteBtn: 'Supprimer',
    deleteConfirmTitle: 'Supprimer ce dépistage ?',
    deleteConfirmDesc:
      'Cette action supprime définitivement le dépistage sélectionné.',
    cancelBtn: 'Annuler',
    incompleteTitle: 'Questionnaire incomplet',
    incompleteDetail:
      'Veuillez répondre aux 20 questions avant l’envoi ({answered}/20 répondues), ou saisir le score manuellement.',
  },
  es: {
    badge: 'Psicotraumatología',
    clientHeading: 'Mi Cribado de Psicotraumatología (PCL-5 / ITQ)',
    providerHeading: 'Cribado de Psicotraumatología (PCL-5 / ITQ)',
    questionsIntro:
      'Responda según el último mes. El cuestionario se divide en 4 partes:',
    likertLabels: ['0 Nada', '1 Un poco', '2 Moderadamente', '3 Bastante', '4 Extremadamente'],
    answeredProgress: 'respondidas',
    totalLabel: 'Total calculado',
    prevPartBtn: 'Parte anterior',
    nextPartBtn: 'Parte siguiente',
    switchToManualBtn: 'Introducir puntuación manual',
    switchToWizardBtn: 'Usar cuestionario de 20 ítems',
    clientPickerLabel: 'Cliente',
    selectClientPlaceholder: '-- Seleccionar cliente --',
    manualClientOption: 'Introducir ID manualmente',
    backToClientListBtn: 'Elegir de la lista',
    clientUuidLabel: 'ID del cliente',
    clientUuidPlaceholder: 'UUID del cliente',
    testTypeLabel: 'Instrumento',
    scoreLabel: 'Puntuación',
    scorePlaceholder: 'Puntuación total (0–80)',
    submitBtn: 'Enviar Cribado',
    loadingText: 'Cargando...',
    emptyText: 'Aún no hay registros de cribado.',
    deleteBtn: 'Eliminar',
    deleteConfirmTitle: '¿Eliminar registro de cribado?',
    deleteConfirmDesc:
      'Esta acción elimina permanentemente el registro seleccionado.',
    cancelBtn: 'Cancelar',
    incompleteTitle: 'Cuestionario incompleto',
    incompleteDetail:
      'Responde las 20 preguntas antes de enviar ({answered}/20 respondidas), o cambia a entrada manual.',
  },
  de: {
    badge: 'Psychotraumatologie',
    clientHeading: 'Mein Psychotraumatologie-Screening (PCL-5 / ITQ)',
    providerHeading: 'Psychotraumatologie-Screening (PCL-5 / ITQ)',
    questionsIntro:
      'Antworten Sie bezogen auf den letzten Monat. Der Fragebogen ist in 4 Teile gegliedert:',
    likertLabels: ['0 Gar nicht', '1 Ein wenig', '2 Mäßig', '3 Ziemlich', '4 Extrem'],
    answeredProgress: 'beantwortet',
    totalLabel: 'Berechneter Gesamtwert',
    prevPartBtn: 'Vorheriger Teil',
    nextPartBtn: 'Nächster Teil',
    switchToManualBtn: 'Gesamtwert manuell eingeben',
    switchToWizardBtn: '20-Punkte-Fragebogen nutzen',
    clientPickerLabel: 'Klient',
    selectClientPlaceholder: '-- Klient auswählen --',
    manualClientOption: 'Klient-ID manuell eingeben',
    backToClientListBtn: 'Aus Liste wählen',
    clientUuidLabel: 'Klient-ID',
    clientUuidPlaceholder: 'Klient UUID',
    testTypeLabel: 'Verfahren',
    scoreLabel: 'Score',
    scorePlaceholder: 'Gesamtscore (0–80)',
    submitBtn: 'Screening einreichen',
    loadingText: 'Wird geladen...',
    emptyText: 'Noch keine Screening-Einträge vorhanden.',
    deleteBtn: 'Löschen',
    deleteConfirmTitle: 'Screening-Eintrag löschen?',
    deleteConfirmDesc:
      'Dieser Vorgang entfernt das ausgewählte Screening dauerhaft.',
    cancelBtn: 'Abbrechen',
    incompleteTitle: 'Unvollständiger Fragebogen',
    incompleteDetail:
      'Bitte beantworten Sie alle 20 Fragen ({answered}/20 beantwortet) oder wechseln Sie zur manuellen Eingabe.',
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
        Number.isFinite(dto.score) &&
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

export function normalizeUtcTimestamp(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
    return `${trimmed}Z`;
  }
  return trimmed;
}

export const PsychotraumatologyFeatureView: React.FC<
  PsychotraumatologyFeatureViewProps
> = ({ portalMode }) => {
  const locale = useUiLocale();
  const copy = PSYCHOTRAUMA_COPY[locale];
  const auth = useOptionalAuth();
  const isClientSelfView =
    portalMode === 'client' ||
    (portalMode !== 'provider' &&
      Boolean(auth && !auth.hasRole('PROVIDER', 'MANAGEMENT')));
  const { items: tests, loading, error, createItem, deleteItem, clearError, setError } =
    useBaseCrud(psychotraumatologyService);

  const [clientOptions, setClientOptions] = useState<ClientPickerOption[]>([]);
  const [useManualClientId, setUseManualClientId] = useState(false);
  const [clientUuid, setClientUuid] = useState('');
  const [testType, setTestType] = useState('PCL-5');
  const [manualMode, setManualMode] = useState(false);
  const [manualScore, setManualScore] = useState<string>('');
  const [clusterIndex, setClusterIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || isClientSelfView) return;
    let active = true;
    fetch('/api/backend/clinic/clients')
      .then((res) => (res?.ok ? res.json() : []))
      .then((rows) => {
        if (!active) return;
        setClientOptions(filterPcl5ClientOptions(rows, auth.user.id, auth.user.email));
      })
      .catch(() => {
        /* Fallback to manual client ID input when clinic list cannot be fetched */
      });
    return () => {
      active = false;
    };
  }, [auth, isClientSelfView]);

  const answeredCount = Object.keys(answers).length;
  const computedScore = Object.values(answers).reduce((sum, val) => sum + val, 0);
  const effectiveScore = manualMode
    ? manualScore.trim() === ''
      ? Number.NaN
      : Number(manualScore)
    : computedScore;

  const effectiveClientUuid = isClientSelfView ? auth?.user.id ?? '' : clientUuid;
  const visibleTests =
    isClientSelfView && auth
      ? tests.filter((t) => !t.clientUuid || t.clientUuid === auth.user.id)
      : tests;

  const localizedQuestions = PCL5_QUESTIONS_BY_LOCALE[locale];
  const activeCluster = PCL5_CLUSTERS[clusterIndex];
  const clusterQuestions = localizedQuestions.slice(
    activeCluster.startIndex,
    activeCluster.startIndex + activeCluster.count
  );
  const progressPercent = Math.round((answeredCount / 20) * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMode && answeredCount < 20) {
      const detail = copy.incompleteDetail.replace('{answered}', String(answeredCount));
      setError({
        type: 'about:blank',
        title: copy.incompleteTitle,
        status: 400,
        detail,
        errorCode: ErrorCode.VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        fields: { answers: detail },
      });
      return;
    }
    if (!isClientSelfView && auth?.user.id && effectiveClientUuid.trim() === auth.user.id) {
      const selfDetail =
        locale === 'da'
          ? 'Behandler kan ikke oprette en PCL-5 screening på sig selv som klient.'
          : 'Therapist cannot submit a PCL-5 assessment for themselves as client.';
      setError({
        type: 'about:blank',
        title: copy.incompleteTitle,
        status: 400,
        detail: selfDetail,
        errorCode: ErrorCode.BAD_REQUEST,
        timestamp: new Date().toISOString(),
        fields: { clientUuid: selfDetail },
      });
      return;
    }
    const numericScore = effectiveScore;
    const severity = calculatePcl5Severity(numericScore);
    const answersPayload = manualMode
      ? [numericScore]
      : Array.from({ length: 20 }, (_, i) => answers[i]);
    const created = await createItem({
      clientUuid: effectiveClientUuid,
      testType,
      score: numericScore,
      severity,
      answersJson: JSON.stringify(answersPayload),
    });
    if (created) {
      if (!isClientSelfView) {
        setClientUuid('');
      }
      setManualScore('');
      setAnswers({});
      setClusterIndex(0);
    }
  };

  return (
    <section
      data-testid="psychotraumatology-feature-view"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="bi bi-clipboard2-pulse" aria-hidden="true" />
            {copy.badge}
          </span>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
            {isClientSelfView ? copy.clientHeading : copy.providerHeading}
          </h2>
        </div>

        <button
          type="button"
          data-testid="toggle-manual-score-mode"
          onClick={() => setManualMode((prev) => !prev)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <i
            className={`bi ${manualMode ? 'bi-ui-checks' : 'bi-123'}`}
            aria-hidden="true"
          />
          {manualMode ? copy.switchToWizardBtn : copy.switchToManualBtn}
        </button>
      </div>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        data-testid="psychotraumatology-form"
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!isClientSelfView && (
            <div className="space-y-1">
              {clientOptions.length > 0 && !useManualClientId ? (
                <>
                  <label
                    htmlFor="pcl5-client-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {copy.clientPickerLabel}
                  </label>
                  <select
                    id="pcl5-client-select"
                    data-testid="select-pcl5-client"
                    value={clientUuid}
                    onChange={(e) => {
                      if (e.target.value === '__manual__') {
                        setUseManualClientId(true);
                        setClientUuid('');
                      } else {
                        setClientUuid(e.target.value);
                      }
                    }}
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">{copy.selectClientPlaceholder}</option>
                    {clientOptions.map((client) => {
                      const val = client.userId || client.id;
                      const label = client.email
                        ? `${client.fullName} (${client.email})`
                        : client.fullName;
                      return (
                        <option key={client.id} value={val}>
                          {label}
                        </option>
                      );
                    })}
                    <option value="__manual__">{copy.manualClientOption}</option>
                  </select>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="pcl5-client-uuid-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      {copy.clientUuidLabel}
                    </label>
                    {clientOptions.length > 0 && (
                      <button
                        type="button"
                        data-testid="btn-back-to-client-list"
                        onClick={() => setUseManualClientId(false)}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        {copy.backToClientListBtn}
                      </button>
                    )}
                  </div>
                  <input
                    id="pcl5-client-uuid-input"
                    data-testid="input-clientUuid"
                    placeholder={copy.clientUuidPlaceholder}
                    value={clientUuid}
                    onChange={(e) => setClientUuid(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="pcl5-test-type-select"
              className="block text-xs font-semibold text-slate-700"
            >
              {copy.testTypeLabel}
            </label>
            <select
              id="pcl5-test-type-select"
              data-testid="select-testType"
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            >
              <option value="PCL-5">PCL-5</option>
              <option value="ITQ">ITQ</option>
            </select>
          </div>

          {manualMode && (
            <div className="space-y-1">
              <label
                htmlFor="pcl5-manual-score-input"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.scoreLabel} (0–80)
              </label>
              <input
                id="pcl5-manual-score-input"
                data-testid="input-score"
                type="number"
                placeholder={copy.scorePlaceholder}
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          )}
        </div>

        {!manualMode && (
          <div
            data-testid="pcl5-questions-reference"
            className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-700">{copy.questionsIntro}</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-semibold text-teal-800">
                {answeredCount} / 20 {copy.answeredProgress} · {copy.totalLabel}:{' '}
                {computedScore} / 80
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                data-testid="pcl5-progress-bar"
                role="progressbar"
                aria-valuenow={answeredCount}
                aria-valuemin={0}
                aria-valuemax={20}
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-teal-700 transition-all duration-200"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PCL5_CLUSTERS.map((cluster, idx) => {
                const isSelected = idx === clusterIndex;
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    data-testid={`pcl5-cluster-tab-${idx}`}
                    onClick={() => setClusterIndex(idx)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                      isSelected
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cluster.titles[locale]}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {clusterQuestions.map((questionText, offset) => {
                const qIndex = activeCluster.startIndex + offset;
                const currentAnswer = answers[qIndex];
                return (
                  <div
                    key={qIndex}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      <span className="mr-1.5 font-bold text-teal-800">
                        {qIndex + 1}.
                      </span>
                      {questionText}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {([0, 1, 2, 3, 4] as const).map((rating) => {
                        const selected = currentAnswer === rating;
                        return (
                          <button
                            key={rating}
                            type="button"
                            data-testid={`pcl5-q-${qIndex}-opt-${rating}`}
                            aria-pressed={selected}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [qIndex]: rating }))
                            }
                            className={`min-h-11 rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
                              selected
                                ? 'border-teal-700 bg-teal-700 text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-teal-50'
                            }`}
                          >
                            {copy.likertLabels[rating]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                data-testid="pcl5-prev-cluster"
                disabled={clusterIndex === 0}
                onClick={() => setClusterIndex((i) => Math.max(0, i - 1))}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                {copy.prevPartBtn}
              </button>
              <button
                type="button"
                data-testid="pcl5-next-cluster"
                disabled={clusterIndex === PCL5_CLUSTERS.length - 1}
                onClick={() =>
                  setClusterIndex((i) => Math.min(PCL5_CLUSTERS.length - 1, i + 1))
                }
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                {copy.nextPartBtn}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="submit-psychotraumatology"
            className="min-h-11 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.submitBtn}
          </button>
        </div>
      </form>

      {loading && !error ? (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      ) : visibleTests.length === 0 ? (
        <p className="text-sm text-slate-500">{copy.emptyText}</p>
      ) : (
        <ul
          data-testid="psychotraumatology-list"
          className="list-none space-y-2 pl-0"
          style={{ paddingLeft: 0 }}
        >
          {visibleTests.map((test) => {
            const resolvedClientLabel = test.clientUuid
              ? clientOptions.find((c) => (c.userId || c.id) === test.clientUuid)?.fullName || ''
              : '';
            const clientLabel =
              resolvedClientLabel ||
              (isClientSelfView ? auth?.user.name || '' : '');
            let formattedTime = '';
            const rawTimestamp = test.createdAt || test.timestamp;
            if (rawTimestamp) {
              const dt = new Date(normalizeUtcTimestamp(rawTimestamp));
              if (!Number.isNaN(dt.getTime())) {
                formattedTime = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(dt);
              }
            }
            return (
              <li
                key={test.id}
                data-testid={`psychotraumatology-item-${test.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-slate-900">{test.testType}</strong>
                    {clientLabel && (
                      <span className="text-xs font-medium text-slate-600">
                        · {clientLabel}
                      </span>
                    )}
                    <span>
                      — {copy.scoreLabel}: {test.score}{' '}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        test.score >= CLINICAL_PTSD_CUTOFF_SCORE
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-teal-50 text-teal-800'
                      }`}
                    >
                      {localizePcl5Severity(test.severity, locale)}
                    </span>
                  </div>
                  {formattedTime && (
                    <div className="text-xs text-slate-500">{formattedTime}</div>
                  )}
                </div>
                {!isClientSelfView && test.id && (
                  <button
                    type="button"
                    data-testid={`delete-test-${test.id}`}
                    onClick={() => setPendingDeleteId(test.id!)}
                    className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    {copy.deleteBtn}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingDeleteId && (
        <ConfirmActionDialog
          open
          tone="danger"
          title={copy.deleteConfirmTitle}
          description={copy.deleteConfirmDesc}
          confirmLabel={copy.deleteBtn}
          cancelLabel={copy.cancelBtn}
          onConfirm={async () => {
            const idToDelete = pendingDeleteId;
            setPendingDeleteId(null);
            await deleteItem(idToDelete);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </section>
  );
};
