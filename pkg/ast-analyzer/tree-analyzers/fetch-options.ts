import { AnalyzerMatch, AnalyzerParams } from "../types";
import { Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const FETCH_OPTIONS_ANALYZER_NAME = "fetch-options";

// Common fetch option properties
const FETCH_OPTION_PROPERTIES = ["method", "headers", "body"];

const fetchOptionsAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  return {
    ObjectExpression(path) {
      const node = path.node
      if (!node.loc || node.start == null || node.end == null) return;

      // Get all property names in this object
      const propertyNames = new Set(
        node.properties.flatMap(
          (prop) => {
            if (!t.isObjectProperty(prop) || prop.computed) return [];
            if (t.isIdentifier(prop.key)) return [prop.key.name];
            if (t.isStringLiteral(prop.key)) return [prop.key.value];
            return [];
          })
      );

      // Check if this object has any fetch option properties
      const hasFetchProperties = FETCH_OPTION_PROPERTIES.some((prop) =>
        propertyNames.has(prop)
      );

      if (hasFetchProperties) {
        const tags: Record<string, true> = {
          "fetch-options": true,
        };

        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: FETCH_OPTIONS_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags,
        };

        matchesReturn.push(match);
      }
    },
  };
};

export { fetchOptionsAnalyzerBuilder };
