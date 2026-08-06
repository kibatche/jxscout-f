import { AnalyzerMatch, AnalyzerParams } from "../types";
import { NodePath, Visitor } from "@babel/traverse";
import * as t from "@babel/types";

export const WINDOW_NAME_ANALYZER_NAME = "window-name";

const windowNameAnalyzerBuilder = (
  args: AnalyzerParams,
  matchesReturn: AnalyzerMatch[]
): Visitor => {
    // retourne tous les window|self|top|parent|globalThis.name ou window|self|top|parent|globalThis["name"] = . Voir si ça ne crée pas trop de retour car "name" est une propriété très commune.
    const handleAssignmentExpression = (path: NodePath<t.AssignmentExpression>) => {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;

      const left = node.left
      
      if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
      // window|self|top|parent|globalThis["name"] = truc
      // window|self|top|parent|globalThis.name = truc
      const isSimpleNameAssignment = 
      (
        (t.isIdentifier(left.object, {name: "window"})
        || t.isIdentifier(left.object, {name: "self"})
        || t.isIdentifier(left.object, {name: "top"})
        || t.isIdentifier(left.object, {name: "parent"})
        || t.isIdentifier(left.object, {name: "globalThis"}))
      )
      && ((t.isIdentifier(left.property, {name: "name"}) && !left.computed) || t.isStringLiteral(left.property, {value: "name"}))

      const obj = left.object

      // whatever.window|self|top|parent|globalThis.name = truc
      // whatever["window|self|top|parent|globalThis"].name = truc
      // whatever.window|self|top|parent|globalThis["name"] = truc
      // whatever["window|self|top|parent|globalThis"]["name"] = truc
      const isComplexNameAssignment = 
      (t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
      && t.isIdentifier(obj.object)// on se laisse la possibilité d'avoir un w.top.name par exemple, au lieu de contraindre à window. Voir si ça a une conséquence en terme de bruit.
      && (
        (
          ((t.isIdentifier(obj.property, {name: "window"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "window"}))
        || (((t.isIdentifier(obj.property, {name: "self"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "self"}))
        || (((t.isIdentifier(obj.property, {name: "top"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "top"}))
        || (((t.isIdentifier(obj.property, {name: "parent"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "parent"}))
        || (((t.isIdentifier(obj.property, {name: "globalThis"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "globalThis"})
      )
      )
      && ((t.isIdentifier(left.property, {name: "name"}) && !left.computed) || t.isStringLiteral(left.property, {value: "name"}))
      
      if (isSimpleNameAssignment || isComplexNameAssignment) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: WINDOW_NAME_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "window-name-assignment": true,
          },
        };

        matchesReturn.push(match);
      }
    }

    // permet de retrouver les lecture de whatever.name ou whaever["name"]
    const handleMemberExpression = (path: NodePath<t.MemberExpression|t.OptionalMemberExpression>) => {
      const node = path.node;
      if (!node.loc || node.start == null || node.end == null) return;

      // On teste si le parent est une affectation et si le noeud courant est à gauche dudit parent retrouvé
      if (path.findParent(p => p.isAssignmentExpression() && p.node.left === node)) return;
      // Check if this is a window.name read
      const isSimpleNameRead = 
      (
        (t.isIdentifier(node.object, {name: "window"})
        || t.isIdentifier(node.object, {name: "self"})
        || t.isIdentifier(node.object, {name: "top"})
        || t.isIdentifier(node.object, {name: "parent"})
        || t.isIdentifier(node.object, {name: "globalThis"}))
      )
      && ((t.isIdentifier(node.property, {name: "name"}) && !node.computed) || t.isStringLiteral(node.property, {value: "name"}))

      const obj = node.object
      const isComplexNameRead = 
      (t.isMemberExpression(obj) || t.isOptionalMemberExpression(obj))
      && t.isIdentifier(obj.object)// on se laisse la possibilité d'avoir un w.top.name par exemple, au lieu de contraindre à window. Voir si ça a une conséquence en terme de bruit.
      && (
        (
          ((t.isIdentifier(obj.property, {name: "window"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "window"}))
        || (((t.isIdentifier(obj.property, {name: "self"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "self"}))
        || (((t.isIdentifier(obj.property, {name: "top"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "top"}))
        || (((t.isIdentifier(obj.property, {name: "parent"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "parent"}))
        || (((t.isIdentifier(obj.property, {name: "globalThis"}) && !obj.computed)) || t.isStringLiteral(obj.property, {value: "globalThis"})
      )
      )
      && ((t.isIdentifier(node.property, {name: "name"}) && !node.computed) || t.isStringLiteral(node.property, {value: "name"}))

      if (isSimpleNameRead || isComplexNameRead) {
        const match: AnalyzerMatch = {
          filePath: args.filePath,
          analyzerName: WINDOW_NAME_ANALYZER_NAME,
          value: args.source.slice(node.start, node.end),
          start: node.loc.start,
          end: node.loc.end,
          tags: {
            "window-name-read": true,
          },
        };

        matchesReturn.push(match);
      }
    }
    return {AssignmentExpression: handleAssignmentExpression, MemberExpression: handleMemberExpression, OptionalMemberExpression: handleMemberExpression}
  };


export { windowNameAnalyzerBuilder };
