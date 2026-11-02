export interface EntityGroup {
  people: string[];
  organizations: string[];
  locations: string[];
  dates: string[];
  statistics: string[];
}

export interface AnalysisData {
  title: string;
  source: string;
  was_truncated: boolean;
  summary: string;
  takeaways: string[];
  entities: EntityGroup;
  detected_language: string;
  detected_lang_code: string;
  raw_markdown?: string;
}

export interface SupportedLanguage {
  code: string;
  name: string;
}
