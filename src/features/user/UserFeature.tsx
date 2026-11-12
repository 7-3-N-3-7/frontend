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
import { ProblemAlert, useBaseCrud } from '../../core/baseUiCore';

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

export const UserFeatureView: React.FC = () => {
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
    <section data-testid="user-feature-view" className="p-4 card border-0 shadow-xs rounded-4 bg-white">
      <h2 className="h5 fw-bold mb-3">Brugere (UserFeature)</h2>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <form onSubmit={handleSubmit} data-testid="user-form" className="mb-4 d-flex flex-wrap gap-2">
        <input
          data-testid="input-username"
          placeholder="Brugernavn"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="form-control w-auto"
        />
        <input
          data-testid="input-password"
          type="password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-control w-auto"
        />
        <select
          data-testid="select-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="form-select w-auto"
        >
          <option value="CLIENT">CLIENT</option>
          <option value="THERAPIST">THERAPIST</option>
          <option value="ADMIN">ADMIN</option>
          <option value="INVALID_ROLE">INVALID_ROLE</option>
        </select>
        <button
          type="submit"
          data-testid="submit-user"
          className="btn btn-primary px-4"
        >
          Opret Bruger
        </button>
      </form>

      {loading ? (
        <p data-testid="loading-indicator">Indlæser...</p>
      ) : (
        <ul data-testid="user-list" className="list-group">
          {users.map((user) => (
            <li
              key={user.id}
              data-testid={`user-item-${user.id}`}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>
                <strong>{user.username}</strong> — <span className="badge bg-secondary">{user.role}</span>
              </span>
              {user.id && (
                <button
                  type="button"
                  data-testid={`delete-user-${user.id}`}
                  onClick={() => void deleteItem(user.id!)}
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
