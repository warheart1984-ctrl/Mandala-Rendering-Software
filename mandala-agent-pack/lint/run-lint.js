import { ConstitutionalLinter } from "./constitutional-linter.js";

const linter = new ConstitutionalLinter(process.cwd());
const issues = linter.run();

if (issues.length) {
  console.error("Mandala Constitutional Lint Issues:");
  console.table(issues);
  process.exit(1);
} else {
  console.log("Mandala Constitutional Lint: OK");
}
