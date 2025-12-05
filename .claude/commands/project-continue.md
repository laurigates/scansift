---
description: "Analyze project state and continue development where left off"
allowed-tools: ["Read", "Bash", "Grep", "Glob", "Edit", "Write", "TodoWrite"]
---

Continue project development:

1. **Check current state**:
   - Run `git status` (branch, uncommitted changes)
   - Run `git log -5 --oneline` (recent commits)

2. **Read context**:
   - All PRDs in `.claude/blueprints/prds/`
   - `work-overview.md` (current phase and progress) if it exists
   - Recent work-orders (completed and pending) if they exist

3. **Identify next task**:
   - Based on PRD requirements
   - Based on work-overview progress
   - Based on git status (resume if in progress)

4. **Begin work following TDD**:
   - Apply project-specific skills automatically
   - Follow RED → GREEN → REFACTOR workflow
   - Commit incrementally with conventional commits

Report before starting:
- Current project status summary
- Next task identified
- Approach and plan
