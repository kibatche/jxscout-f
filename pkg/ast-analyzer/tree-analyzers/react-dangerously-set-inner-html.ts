import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const DANGEROUS_HTML_ANALYZER_NAME = "dangerouslySetInnerHTML";

const dangerousHtmlAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
    // Handle object properties
    const handleObjectExpression = (path: NodePath<t.ObjectExpression>) => {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;
      if (node.properties.length < 1) return;

      let isDangerouslySetInnerHTML = false
      
      node.properties.forEach(p => {
        if (t.isObjectProperty(p)
          && ((!p.computed && t.isIdentifier(p.key, {name: "dangerouslySetInnerHTML"}))
            || t.isStringLiteral(p.key, {value: "dangerouslySetInnerHTML"})))
        {
          return isDangerouslySetInnerHTML = true;
        }
      })

      // Check if this object has dangerouslySetInnerHTML property
      if (isDangerouslySetInnerHTML) {
        const tags: Record<string, true> = {
          "dangerouslySetInnerHTML-object": true,
        };

        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: DANGEROUS_HTML_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags,
        };

        matchesReturn.push(match);
      }
    }

    // Handle JSX elements
    const handleJSXElement = (path: NodePath<t.JSXElement>) => {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;

      let isDangerouslySetInnerHTML = false
  
      node.openingElement.attributes.forEach(a => {
        if (t.isJSXAttribute(a) 
          && t.isJSXIdentifier(a.name, {name: "dangerouslySetInnerHTML"}))
        {
          return isDangerouslySetInnerHTML = true
        }
      })

      if (isDangerouslySetInnerHTML) {
        const tags: Record<string, true> = {
          "dangerouslySetInnerHTML-jsx": true,
        };

        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: DANGEROUS_HTML_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags,
        };

        matchesReturn.push(match);
      }
    }
    return {ObjectExpression: handleObjectExpression, JSXElement: handleJSXElement}
  };


export { dangerousHtmlAnalyzerBuilder };
