#!/usr/bin/env bash
# Mechanical half of the docs-freshness review in .github/workflows/docs-quality.yml.
#
# Fails when README.md or CLAUDE.md
#   - names a `bun run <script>` (or npm/pnpm/yarn) that package.json does not define, or
#   - cites a backticked src/, tests/ or scripts/ path that does not exist.
#
# docs/ is left out on purpose: ADRs and PRDs record the layout at the time they
# were written. Run from the repository root: bash scripts/check-docs-consistency.sh
set -euo pipefail

docs=(README.md CLAUDE.md)
status=0

# grep exits 2 on a missing file, which `|| true` below would hide.
for doc in "${docs[@]}"; do
  if [[ ! -f $doc ]]; then
    echo "::error::$doc not found; run from the repository root"
    exit 1
  fi
done

scripts=$(jq -r '.scripts | keys[]' package.json)

while IFS=: read -r file line cmd; do
  name=${cmd##* }
  # Prose punctuation after the command (`bun run dev.`) is not part of the name.
  while [[ $name == *[.,\;:!?\)\'\"] ]]; do name=${name%?}; done
  # Flags (`bun run --filter ...`) and placeholders (`bun run <script>`) name no script.
  [[ -z $name || $name == -* || $name == *[\<\>]* ]] && continue
  if [[ $name == */* || $name == *.* ]]; then
    # `bun run path/to/file.ts` runs a file, not a package.json script.
    [[ -e $name ]] && continue
  elif grep -qxF -- "$name" <<<"$scripts"; then
    continue
  fi
  echo "::error file=$file,line=$line::'$cmd' matches no package.json script or file"
  status=1
done < <(grep -noE '\b(bun|npm|pnpm|yarn) run [^[:space:]`]+' "${docs[@]}" || true)

# shellcheck disable=SC2016 # the backticks are literal Markdown, not expansions
while IFS=: read -r file line ref; do
  path=${ref//\`/}
  # Globs such as `src/*` and placeholders such as `src/<module>` describe a pattern, not a file.
  [[ $path == *[\*\<\>]* ]] && continue
  # Drop a `:line` or `:line:col` suffix (`src/server/errors.ts:42`).
  [[ $path =~ ^([^:]+)(:[0-9]+){1,2}$ ]] && path=${BASH_REMATCH[1]}
  [[ -e $path ]] && continue
  echo "::error file=$file,line=$line::$path is referenced but does not exist"
  status=1
done < <(grep -noE '`(src|tests|scripts)/[^`[:space:]]*`' "${docs[@]}" || true)

if [[ $status -eq 0 ]]; then
  echo "README.md and CLAUDE.md commands and paths match package.json and the tree."
fi
exit "$status"
