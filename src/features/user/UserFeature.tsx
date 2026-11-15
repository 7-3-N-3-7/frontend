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
import { ProblemAlert, RoleGuard, useBaseCrud } from '../../core/baseUiCore';
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
    DomainGuard.require(
      Boolean(dto.role && /^(CLIENT|ADMIN|THERAPIST)$/.test(dto.role)),
      'BAD_REQUEST',
      'invalid role'
    );
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
  usernamePlaceholder: string;
  passwordPlaceholder: string;
  createUserBtn: string;
  loadingText: string;
  deleteBtn: string;
  forbiddenNotice: string;
}

const USER_COPY: Record<SupportedUiLocale, UserCopy> = {
  da: {
    badge: 'Brugeradministration',
    heading: 'Brugere & Roller',
    usernamePlaceholder: 'Brugernavn',
    passwordPlaceholder: 'Adgangskode',
    createUserBtn: 'Opret Bruger',
    loadingText: 'Indlæser...',
    deleteBtn: 'Slet',
    forbiddenNotice: 'Adgang nægtet: Brugeradministration kræver administratorrettigheder (ADMIN).',
  },
  en: {
    badge: 'User Administration',
    heading: 'Users & Roles',
    usernamePlaceholder: 'Username',
    passwordPlaceholder: 'Password',
    createUserBtn: 'Create User',
    loadingText: 'Loading...',
    deleteBtn: 'Delete',
    forbiddenNotice: 'Access denied: User administration requires administrator privileges (ADMIN).',
  },
  fr: {
    badge: 'Administration des Utilisateurs',
    heading: 'Utilisateurs & Rôles',
    usernamePlaceholder: "Nom d'utilisateur",
    passwordPlaceholder: 'Mot de passe',
    createUserBtn: 'Créer un Utilisateur',
    loadingText: 'Chargement...',
    deleteBtn: 'Supprimer',
    forbiddenNotice: "Accès refusé : l'administration des utilisateurs nécessite les droits ADMIN.",
  },
  es: {
    badge: 'Administración de Usuarios',
    heading: 'Usuarios y Roles',
    usernamePlaceholder: 'Nombre de usuario',
    passwordPlaceholder: 'Contraseña',
    createUserBtn: 'Crear Usuario',
    loadingText: 'Cargando...',
    deleteBtn: 'Eliminar',
    forbiddenNotice: 'Acceso denegado: la administración de usuarios requiere permisos de administrador (ADMIN).',
  },
  de: {
    badge: 'Benutzerverwaltung',
    heading: 'Benutzer & Rollen',
    usernamePlaceholder: 'Benutzername',
    passwordPlaceholder: 'Passwort',
    createUserBtn: 'Benutzer erstellen',
    loadingText: 'Wird geladen...',
    deleteBtn: 'Löschen',
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

      <form
        onSubmit={handleSubmit}
        data-testid="user-form"
        className="flex flex-wrap items-center gap-2.5"
      >
        <input
          data-testid="input-username"
          placeholder={copy.usernamePlaceholder}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <input
          data-testid="input-password"
          type="password"
          placeholder={copy.passwordPlaceholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <select
          data-testid="select-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
        >
          <option value="CLIENT">CLIENT</option>
          <option value="THERAPIST">THERAPIST</option>
          <option value="ADMIN">ADMIN</option>
          <option value="INVALID_ROLE">INVALID_ROLE</option>
        </select>
        <button
          type="submit"
          data-testid="submit-user"
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
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
                  {user.role}
                </span>
              </span>
              {user.id && (
                <button
                  type="button"
                  data-testid={`delete-user-${user.id}`}
                  onClick={() => void deleteItem(user.id!)}
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
