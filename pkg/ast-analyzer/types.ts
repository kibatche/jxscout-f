import * as parser from "@babel/parser";
import type { File, SourceLocation } from "@babel/types"
import { Visitor } from "@babel/traverse";

export type Position = SourceLocation["start"]

export interface AnalyzerMatch {
  filePath: string;
  analyzerName: string;
  value: string;
  start: Position;
  end: Position;
  tags: Record<string, true>;
  extra?: Record<string, any>;
}

export interface AnalyzerParams {
  ast: parser.ParseResult<File>;
  source: string;
  filePath: string;
}

export type Analyzer = (
  params: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
) => Visitor;
