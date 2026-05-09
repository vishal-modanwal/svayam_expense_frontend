import { AuthUser } from '../models/app.models';
import { AuthService } from '../services/auth.service';

/**
 * Merges API profile fields into the session user and persists via AuthService.
 */
export function mergeStoredProfileWithUser(user: Partial<AuthUser>, auth: AuthService): void {
  const current = auth.getCurrentUser();
  if (!current) {
    auth.syncProfile(user as AuthUser);
    return;
  }
  auth.syncProfile({ ...current, ...user } as AuthUser);
}
