// Scoring rubric: schema (Zod), score computation (pure functions, without disk nor database access)
// and partial change. Shared by the CLI, the API, the MCP server and the interface.
//
// Principle: the AI (or the user) scores a few criteria from 0 to 10 and reports the blocking rules
// that apply; the application computes the scale-based criteria (remote work, compensation), the weighted
// average, applies the rules (zero, cap) and rounds to the half point. The AI never gives the final score.
//
// Entry point only: the code lives in rubric/ (schema ← computation ← change, instructions). The names are
// listed one by one so that the helpers shared inside the folder (identifier, score10, fieldsTier) stay private.
export { applyChange, type Change, computedExamples, type ExampleComputed, schemaChange } from './rubric/change.ts';
export {
  type AppliedRule,
  type Breakdown,
  checkInput,
  computeScore,
  type DataOffer,
  type Flag,
  type InputsUsed,
  inputsUsed,
  interpolate,
  type LineCriterion,
  type OriginSubScore,
  type ResultComputation,
  roundedHalf,
  scoreCompensation,
  scoreExample,
  scoreRemote,
  summaryRules,
} from './rubric/computation.ts';
export { instructionsAi } from './rubric/instructions.ts';
export { onsiteDaysFromText } from './rubric/remote-text.ts';
export {
  COMPUTATIONS,
  CRITERIA_MAX,
  type Computation,
  type CriterionRubric,
  type Example,
  type Input,
  type Inputs,
  LEVELS,
  type Level,
  META_FILE,
  type Rubric,
  type Rule,
  type Scales,
  schemaCriterion,
  schemaExample,
  schemaInput,
  schemaInputs,
  schemaRubric,
  schemaRule,
  schemaScales,
  schemaTechnology,
  schemaTier,
  type Technology,
  type Tier,
  UNITS,
  type Unit,
  validateRubric,
} from './rubric/schema.ts';
