import type { FileChange } from "../change-records.js";

export interface GeneratedFile {
  path: string;
  contents: string;
}

export interface BuildResult {
  filesWritten: string[];
  changes: FileChange[];
  summary: string;
}

export interface GameBuilder {
  id: string;
  summary: string;
  generateFiles(): GeneratedFile[];
  build(projectRoot: string): Promise<BuildResult>;
}
