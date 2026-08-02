import { any } from "estree-toolkit/dist/assert";
import { analyzeFile } from "./analyzer";

function printUsage() {
  console.error("Usage: tsx pkg/ast-analyzers/index.ts <filepath>");
  process.exit(1);
}

async function main(): Promise<any> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    printUsage();
  }

  const [filePath] = args;

  try {
    const results = await analyzeFile(filePath);
    console.log(JSON.stringify(results));
  } catch (error) {
    console.error(`Error running ast analysis:`, error);
    process.exit(1);
  }
}

await main();
