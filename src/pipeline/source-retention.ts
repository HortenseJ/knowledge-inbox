export interface SourceDeletionContext {
	deleteEnabled: boolean;
	expectedOutputs: number;
	committedOutputs: number;
}

/**
 * Allows source deletion only after every expected output is committed.
 */
export function shouldDeleteSource(context: SourceDeletionContext): boolean {
	return context.deleteEnabled
		&& context.expectedOutputs > 0
		&& context.committedOutputs === context.expectedOutputs;
}
