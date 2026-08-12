import type { KnowledgeArtifact } from "../domain/knowledge-artifact";
import type { CategoryRoute, VaultProfile } from "../domain/vault-profile";

export interface WikiTemplateInput {
	artifact: KnowledgeArtifact;
	route: CategoryRoute;
	profile: VaultProfile;
	createdAt: Date;
	sourceRawPath: string;
}

/**
 * Renders a generic final wiki note when the route has no custom template.
 */
export function renderDefaultWikiTemplate(input: WikiTemplateInput): string {
	const sourceLink = `[[${input.sourceRawPath.replace(/\.md$/i, "")}]]`;
	const lines = [
		"---",
		`created: ${input.createdAt.toISOString()}`,
		"type: note",
		`category: ${input.route.id}`,
	];
	if (input.profile.metadataFields.source) {
		lines.push(`${input.profile.metadataFields.source}: "${sourceLink}"`);
	}
	lines.push(
		"---",
		"",
		`# ${input.artifact.title}`,
		"",
		input.artifact.contentMarkdown,
	);

	if (input.artifact.todos.length > 0) {
		lines.push("", "## 待办", "");
		for (const todo of input.artifact.todos) lines.push(`- [ ] ${todo}`);
	}
	if (input.artifact.uncertainties.length > 0) {
		lines.push("", "## 待核实", "");
		for (const uncertainty of input.artifact.uncertainties) lines.push(`- ${uncertainty}`);
	}
	lines.push("");
	return lines.join("\n");
}
