"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: UserFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/user/UserFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: UserFeature]. Håndterer brugeroprettelse
 * og synkronisering af RBAC-roller (`CLIENT`, `ADMIN`, `THERAPIST`).
 *
 * ARKITEKTONISK OVERBLIK (4 TRIN):
 *   1. [Record/DTO: UserDto] & [Record/DTO: UserProfileDto]
 *      TypeScript-kontrakter der matcher `UserFeature.UserDto` i Java.
 *   2. [Service: UserApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<UserDto, string>] og validerer
 *      ikke-tomt `username` og gyldig `role` i #validateBeforeCreate(dto).
 *   3. [Hook: useBaseCrud<UserDto, string>(userService)]
 *   4. [Component: <UserFeatureView />]
 * ============================================================================
 */

import React, { useState } from 'react';
import { BaseApiService, DomainGuard, HasId } from '../../core/baseDomainCore';
import {
  ConfirmActionDialog,
  ProblemAlert,
  RoleGuard,
  useBaseCrud,
} from '../../core/baseUiCore';
import { SupportedUiLocale, useUiLocale } from '../i18n/I18nFeature';

// ============================================================================
// 1. DTO CONTRACTS (1:1 mirror of UserFeature.UserDto Java Record)
// ============================================================================

export type UserRole = 'CLIENT' | 'ADMIN' | 'THERAPIST';

export interface UserDto extends HasId<string> {
  readonly id?: string;
  readonly username: string;
  readonly password?: string;
  readonly role: UserRole | string;
}

export interface UserProfileDto {
  readonly userUuid: string;
  readonly email: string;
  readonly name: string;
  readonly primaryRole: string;
}

// ============================================================================
// 2. FEATURE API SERVICE (Module-Private — DO NOT EXPORT! Mirrors package-private in Java)
// ============================================================================

export function validateUserRole(role?: string | null): void {
  DomainGuard.require(
    Boolean(role && /^(CLIENT|ADMIN|THERAPIST)$/.test(role)),
    'BAD_REQUEST',
    'invalid role'
  );
}

const ROLE_LABELS: Record<SupportedUiLocale, Record<string, string>> = {
  da: {
    CLIENT: 'Klient',
    THERAPIST: 'Behandler',
    PROVIDER: 'Behandler',
    MANAGEMENT: 'Ledelse',
    ADMIN: 'Administrator',
  },
  en: {
    CLIENT: 'Client',
    THERAPIST: 'Therapist',
    PROVIDER: 'Therapist',
    MANAGEMENT: 'Management',
    ADMIN: 'Administrator',
  },
  fr: {
    CLIENT: 'Client',
    THERAPIST: 'Praticien',
    PROVIDER: 'Praticien',
    MANAGEMENT: 'Direction',
    ADMIN: 'Administrateur',
  },
  es: {
    CLIENT: 'Cliente',
    THERAPIST: 'Terapeuta',
    PROVIDER: 'Terapeuta',
    MANAGEMENT: 'Dirección',
    ADMIN: 'Administrador',
  },
  de: {
    CLIENT: 'Klient',
    THERAPIST: 'Therapeut',
    PROVIDER: 'Therapeut',
    MANAGEMENT: 'Leitung',
    ADMIN: 'Administrator',
  },
};

export function localizeUserRole(role: string, locale: SupportedUiLocale): string {
  const key = (role || '').toUpperCase();
  return ROLE_LABELS[locale]?.[key] || role;
}

class UserApiService extends BaseApiService<UserDto, string> {
  constructor() {
    super('/api/backend/users');
  }

  protected override validateBeforeCreate(dto: Omit<UserDto, 'id'> | UserDto): void {
    DomainGuard.require(
      Boolean(dto.username && dto.username.trim().length > 0),
      'BAD_REQUEST',
      'Username is required'
    );
    validateUserRole(dto.role);
  }
}

// Singleton instance scoped strictly to this vertical slice
const userService = new UserApiService();

// ============================================================================
// 3. FEATURE VIEW (Exported React Entrypoint for this Vertical Slice)
// ============================================================================

interface UserCopy {
  badge: string;
  heading: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  roleLabel: string;
  createUserBtn: string;
  loadingText: string;
  deleteBtn: string;
  confirmDeleteTitle: string;
  confirmDeleteDesc: string;
  confirmDeleteBtn: string;
  cancelBtn: string;
  forbiddenNotice: string;
}

const USER_COPY: Record<SupportedUiLocale, UserCopy> = {
  da: {
    badge: 'Brugeradministration',
    heading: 'Brugere & Roller',
    usernameLabel: 'Brugernavn',
    usernamePlaceholder: 'Brugernavn',
    passwordLabel: 'Adgangskode',
    passwordPlaceholder: 'Adgangskode',
    roleLabel: 'Rolle',
    createUserBtn: 'Opret Bruger',
    loadingText: 'Indlæser...',
    deleteBtn: 'Slet',
    confirmDeleteTitle: 'Slet brugerkonto?',
    confirmDeleteDesc: 'Er du sikker på, at du vil fjerne denne bruger fra platformen?',
    confirmDeleteBtn: 'Ja, slet bruger',
    cancelBtn: 'Annuller',
    forbiddenNotice: 'Adgang nægtet: Brugeradministration kræver administratorrettigheder (ADMIN).',
  },
  en: {
    badge: 'User Administration',
    heading: 'Users & Roles',
    usernameLabel: 'Username',
    usernamePlaceholder: 'Username',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Password',
    roleLabel: 'Role',
    createUserBtn: 'Create User',
    loadingText: 'Loading...',
    deleteBtn: 'Delete',
    confirmDeleteTitle: 'Delete user account?',
    confirmDeleteDesc: 'Are you sure you want to remove this user from the platform?',
    confirmDeleteBtn: 'Yes, delete user',
    cancelBtn: 'Cancel',
    forbiddenNotice: 'Access denied: User administration requires administrator privileges (ADMIN).',
  },
  fr: {
    badge: 'Administration des Utilisateurs',
    heading: 'Utilisateurs & Rôles',
    usernameLabel: "Nom d'utilisateur",
    usernamePlaceholder: "Nom d'utilisateur",
    passwordLabel: 'Mot de passe',
    passwordPlaceholder: 'Mot de passe',
    roleLabel: 'Rôle',
    createUserBtn: 'Créer un Utilisateur',
    loadingText: 'Chargement...',
    deleteBtn: 'Supprimer',
    confirmDeleteTitle: 'Supprimer le compte utilisateur ?',
    confirmDeleteDesc: 'Voulez-vous vraiment supprimer cet utilisateur ?',
    confirmDeleteBtn: 'Oui, supprimer',
    cancelBtn: 'Annuler',
    forbiddenNotice: "Accès refusé : l'administration des utilisateurs nécessite les droits ADMIN.",
  },
  es: {
    badge: 'Administración de Usuarios',
    heading: 'Usuarios y Roles',
    usernameLabel: 'Nombre de usuario',
    usernamePlaceholder: 'Nombre de usuario',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Contraseña',
    roleLabel: 'Rol',
    createUserBtn: 'Crear Usuario',
    loadingText: 'Cargando...',
    deleteBtn: 'Eliminar',
    confirmDeleteTitle: '¿Eliminar usuario?',
    confirmDeleteDesc: '¿Seguro que deseas eliminar esta cuenta de usuario?',
    confirmDeleteBtn: 'Sí, eliminar',
    cancelBtn: 'Cancelar',
    forbiddenNotice: 'Acceso denegado: la administración de usuarios requiere permisos de administrador (ADMIN).',
  },
  de: {
    badge: 'Benutzerverwaltung',
    heading: 'Benutzer & Rollen',
    usernameLabel: 'Benutzername',
    usernamePlaceholder: 'Benutzername',
    passwordLabel: 'Passwort',
    passwordPlaceholder: 'Passwort',
    roleLabel: 'Rolle',
    createUserBtn: 'Benutzer erstellen',
    loadingText: 'Wird geladen...',
    deleteBtn: 'Löschen',
    confirmDeleteTitle: 'Benutzerkonto löschen?',
    confirmDeleteDesc: 'Möchten Sie dieses Benutzerkonto wirklich entfernen?',
    confirmDeleteBtn: 'Ja, löschen',
    cancelBtn: 'Abbrechen',
    forbiddenNotice: 'Zugriff verweigert: Die Benutzerverwaltung erfordert Administratorrechte (ADMIN).',
  },
};

const UserFeatureAuthorizedContent: React.FC = () => {
  const locale = useUiLocale();
  const copy = USER_COPY[locale];
  const { items: users, loading, error, createItem, deleteItem, clearError } =
    useBaseCrud(userService);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('CLIENT');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await createItem({ username, password, role });
    if (created) {
      setUsername('');
      setPassword('');
      setRole('CLIENT');
    }
  };

  return (
    <section
      data-testid="user-feature-view"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          <i className="bi bi-people" aria-hidden="true" />
          {copy.badge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.heading}
        </h2>
      </div>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <ConfirmActionDialog
        open={pendingDeleteId !== null}
        title={copy.confirmDeleteTitle}
        description={copy.confirmDeleteDesc}
        confirmLabel={copy.confirmDeleteBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const targetId = pendingDeleteId;
          setPendingDeleteId(null);
          if (targetId) void deleteItem(targetId);
        }}
      />

      <form
        onSubmit={handleSubmit}
        data-testid="user-form"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="user-username-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.usernameLabel}
          </label>
          <input
            id="user-username-input"
            data-testid="input-username"
            placeholder={copy.usernamePlaceholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="user-password-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.passwordLabel}
          </label>
          <input
            id="user-password-input"
            data-testid="input-password"
            type="password"
            placeholder={copy.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="user-role-select"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.roleLabel}
          </label>
          <select
            id="user-role-select"
            data-testid="select-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          >
            <option value="CLIENT">{localizeUserRole('CLIENT', locale)}</option>
            <option value="THERAPIST">{localizeUserRole('THERAPIST', locale)}</option>
            <option value="ADMIN">{localizeUserRole('ADMIN', locale)}</option>
          </select>
        </div>
        <button
          type="submit"
          data-testid="submit-user"
          className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {copy.createUserBtn}
        </button>
      </form>

      {loading ? (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      ) : (
        <ul data-testid="user-list" className="space-y-2">
          {users.map((user) => (
            <li
              key={user.id}
              data-testid={`user-item-${user.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <strong className="text-slate-900">{user.username}</strong> —{" "}
                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                  {localizeUserRole(user.role, locale)}
                </span>
              </span>
              {user.id && (
                <button
                  type="button"
                  data-testid={`delete-user-${user.id}`}
                  onClick={() => setPendingDeleteId(user.id!)}
                  className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
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

const UserForbiddenNotice: React.FC = () => {
  const locale = useUiLocale();
  return (
    <div
      role="alert"
      data-testid="forbidden-notice"
      className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      {USER_COPY[locale].forbiddenNotice}
    </div>
  );
};

export const UserFeatureView: React.FC = () => (
  <RoleGuard
    allowed={["ADMIN"]}
    fallback={<UserForbiddenNotice />}
  >
    <UserFeatureAuthorizedContent />
  </RoleGuard>
);
