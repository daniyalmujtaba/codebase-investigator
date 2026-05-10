import type { LlmTool } from "../llm/llm.types";

export const AGENT_TOOLS: LlmTool[] = [
  {
    name: "list_dir",
    description: "List files and subdirectories at a path within the repo (relative to root).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { path: { type: "string", description: "Relative path. Use '.' for root." } },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read a slice of a file. Prefer narrow ranges. Max 400 lines per call.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
      required: ["path"],
    },
  },
  {
    name: "grep",
    description: "Ripgrep across the repo. Returns file:line:match. Use globs to narrow.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        pattern: { type: "string" },
        glob: { type: "string", description: "Optional ripgrep glob, e.g. '*.ts'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "find_files",
    description: "List files matching a glob (e.g. '**/auth/*.ts').",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { glob: { type: "string" } },
      required: ["glob"],
    },
  },
  {
    name: "select_files",
    description:
      "Semantic file selection. Given a natural-language query, returns up to 12 files in this repo most likely relevant. Use this to FIND candidate files quickly instead of guessing paths. You still need to read_file to cite anything.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        k: { type: "integer", minimum: 1, maximum: 24 },
      },
      required: ["query"],
    },
  },
  {
    name: "submit_answer",
    description:
      "Submit the final structured answer. Every claim MUST include >=1 citation with file path and line range you have actually read.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        answerMarkdown: { type: "string" },
        claims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string" },
              citations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    file: { type: "string" },
                    startLine: { type: "integer", minimum: 1 },
                    endLine: { type: "integer", minimum: 1 },
                  },
                  required: ["file", "startLine", "endLine"],
                },
                minItems: 1,
              },
            },
            required: ["text", "citations"],
          },
        },
        assumptions: { type: "array", items: { type: "string" } },
        openQuestions: { type: "array", items: { type: "string" } },
      },
      required: ["answerMarkdown", "claims", "assumptions", "openQuestions"],
    },
  },
];
