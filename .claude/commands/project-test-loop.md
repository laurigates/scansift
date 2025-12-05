---
description: "Run test → fix → refactor loop with TDD workflow"
allowed-tools: ["Read", "Edit", "Bash", "Write", "TodoWrite"]
---

Run TDD cycle:

1. **Run test suite**: `bun test`
2. **If tests fail**:
   - Analyze failure output
   - Identify root cause
   - Make minimal fix to pass the test
   - Re-run tests to confirm
3. **If tests pass**:
   - Check for refactoring opportunities
   - Refactor while keeping tests green
   - Re-run tests to confirm still passing
4. **Repeat until**:
   - All tests pass
   - No obvious refactoring needed
   - User intervention required

Report:
- Test results summary
- Fixes applied
- Refactorings performed
- Current status (all pass / needs work / blocked)
