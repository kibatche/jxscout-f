import { AnalyzerMatch, AnalyzerParams } from "../types";
import { Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const INNER_HTML_ANALYZER_NAME = "inner-html";

const innerHTMLAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  return {
    AssignmentExpression(path) {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;

      const left = node.left
      if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
      const isInnerHTMLAssignment = (
        ((t.isIdentifier(left.property, { name: "innerHTML" }) && !left.computed) || t.isStringLiteral(left.property, { value: "innerHTML" })))

      if (isInnerHTMLAssignment) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: INNER_HTML_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "inner-html": true,
          },
        };

        matchesReturn.push(match);
      }
    },
  };
};

export { innerHTMLAnalyzerBuilder };
