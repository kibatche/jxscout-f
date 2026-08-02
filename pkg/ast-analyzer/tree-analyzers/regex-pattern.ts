import { AnalyzerMatch, AnalyzerParams } from "../types";
import { Visitor } from "@babel/traverse";
import * as t from "@babel/types";
export const REGEX_ANALYZER_NAME = "regex";

const regexAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
  return {
    RegExpLiteral(path) {
      // Check if this is a regex literal
      const node = path.node
      if (!node.loc || node.start == null || node.end == null) return;
      const match: AnalyzerMatch = {
        filePath: args.filePath,
        analyzerName: REGEX_ANALYZER_NAME,
        value: args.source.slice(node.start, node.end),
        start: node.loc.start,
        end: node.loc.end,
        tags: {
          "regex-pattern": true,
        },
      };
      matchesReturn.push(match);
    },
    NewExpression(path) {
      const node = path.node
      // On test le constructeur avec RegExp.
      /**@todo Ne prend PAS en compte les construction du type new window.RegExp par exemple, qui passeront donc à l'as. Demander 
       * à claudo les autres cas qui peuvent passer à côté aussi. Pour l'instant, on garde cette faiblesse. */
      if (t.isIdentifier(node.callee, {name: "RegExp"})) {
        if (!node.loc || node.start == null || node.end == null) return;
        // Check if the first argument is a string literal
        if (node.arguments.length > 0 && t.isStringLiteral(node.arguments[0])) {
          const match: AnalyzerMatch = {
            filePath: args.filePath,
            analyzerName: REGEX_ANALYZER_NAME,
            value: args.source.slice(node.start, node.end),
            start: node.loc.start,
            end: node.loc.end,
            tags: {
              "regex-pattern": true,
            },
          };
          matchesReturn.push(match);
        }
      }
    },
  };
};

export { regexAnalyzerBuilder };
