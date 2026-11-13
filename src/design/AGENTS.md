# Design
- Design/logic split: `src/design/**` is presentation only (no DB, server fns, fetch; enforced by src/design/design-boundary.test.js) and is edited from Claude per CLAUDE.md; `src/logic/` re-exports the data/action contracts. Design sections register in `src/design/sections/registry.ts`, spread into SCENES so they appear in the page/collection editor.
