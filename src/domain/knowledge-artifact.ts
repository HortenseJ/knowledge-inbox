export interface KnowledgeArtifact {
	title: string;
	categoryId: string | null;
	contentMarkdown: string;
	todos: string[];
	uncertainties: string[];
}
