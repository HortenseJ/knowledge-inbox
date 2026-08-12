/**
 * Extracts transcript text from either a JSON or plain-text STT response.
 */
export function parseSttResponse(json: unknown, text: string): string {
	if (json && typeof json === "object" && !Array.isArray(json)) {
		const candidate = (json as Record<string, unknown>).text;
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
	}

	const trimmed = text.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const candidate = (parsed as Record<string, unknown>).text;
				if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
			}
		} catch {
			// Fall through to preserve a non-JSON plain-text response.
		}
	}
	return trimmed;
}
