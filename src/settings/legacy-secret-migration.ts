export interface LegacySecretValues {
	sttApiKey: string;
	aiApiKey: string;
}

export interface LegacySecretExtraction {
	sanitizedSettings: Record<string, unknown>;
	legacySecrets: LegacySecretValues;
	hadLegacySecrets: boolean;
}

/**
 * Removes plaintext API keys from loaded plugin settings.
 *
 * The returned values can be migrated into Obsidian SecretStorage before the
 * sanitized settings are persisted.
 */
export function extractLegacySecrets(
	loadedSettings: Record<string, unknown>,
): LegacySecretExtraction {
	const sanitizedSettings = { ...loadedSettings };
	const sttApiKey = typeof sanitizedSettings.sttApiKey === "string"
		? sanitizedSettings.sttApiKey.trim()
		: "";
	const aiApiKey = typeof sanitizedSettings.aiApiKey === "string"
		? sanitizedSettings.aiApiKey.trim()
		: "";

	delete sanitizedSettings.sttApiKey;
	delete sanitizedSettings.aiApiKey;

	return {
		sanitizedSettings,
		legacySecrets: { sttApiKey, aiApiKey },
		hadLegacySecrets: sttApiKey.length > 0 || aiApiKey.length > 0,
	};
}
