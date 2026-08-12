import type { CategoryRoute, VaultProfile } from "../domain/vault-profile";

/**
 * Resolves only an exact configured category ID to a trusted vault route.
 */
export function resolveRoute(
	profile: VaultProfile,
	categoryId: string | null,
): CategoryRoute | null {
	if (!categoryId) return null;
	return profile.routes.find((route) => route.id === categoryId) ?? null;
}
