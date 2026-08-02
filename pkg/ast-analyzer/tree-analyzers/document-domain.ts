import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const DOCUMENT_DOMAIN_ANALYZER_NAME = "document-domain";

const documentDomainAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
    const handleAssignment = (path: NodePath<t.AssignmentExpression>) => {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;
      const left = node.left
      if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
      
        // On est obligé de faire cela afin de pouvoir accéder à ) node.left.object au cas où on a
        // whatever.document.domain = truc.
        // domain, dans ce cas, reste une propriété de left, mais par contre document dvient une propriété de l'objet "whatever"
        // Cela semble inutilement compliqué mais les check de type ts nous obligent à faire cela.
      const isDocumentDomainAssignment = (
        t.isIdentifier(left.object, { name: "document" })
        && (t.isIdentifier(left.property, { name: "domain" }) || t.isStringLiteral(left.property, { value: "domain" })))
        ||
        ((t.isMemberExpression(left.object) || t.isOptionalMemberExpression(left.object))
          && (t.isIdentifier(left.object.property, { name: "document" }) || t.isStringLiteral(left.object.property, { value: "document" }))
          && (t.isIdentifier(left.property, { name: "domain" }) || t.isStringLiteral(left.property, { value: "domain" })))

      // Check if this is a document.domain assignment
      if (isDocumentDomainAssignment) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: DOCUMENT_DOMAIN_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "domain-assignment": true,
          },
        };

        matchesReturn.push(match);
      }
    }

    const handleMemberExpression = (path: NodePath<t.MemberExpression | t.OptionalMemberExpression>) => {
      const node = path.node
      if (!node.loc || node.start == null || node.end == null) return;

      // On teste si le parent est une affectation et si le noeud courant est à gauche dudit parent retrouvé
      if (path.findParent(p => p.isAssignmentExpression() && p.node.left === path.node)) return;

      const isDocumentDomainRead =
            (t.isIdentifier(node.object, { name: "document" })
              && (t.isIdentifier(node.property, { name: "domain" }) || t.isStringLiteral(node.property, { value: "domain" })))
            || (
              (t.isMemberExpression(node.object) || t.isOptionalMemberExpression(node.object))
              && (t.isIdentifier(node.object.property, { name: "document" }) || t.isStringLiteral(node.object.property, { value: "document" }))
              && (t.isIdentifier(node.property, { name: "domain" }) || t.isStringLiteral(node.property, { value: "domain" })))
      if (isDocumentDomainRead) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: DOCUMENT_DOMAIN_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "domain-read": true,
          },
        };

        matchesReturn.push(match);
      }
    }
    return { AssignmentExpression: handleAssignment, MemberExpression: handleMemberExpression, OptionalMemberExpression: handleMemberExpression }
  };

export { documentDomainAnalyzerBuilder };
