#!/usr/bin/env bash
# Runs build-plan/prompts/260*.md one at a time with Grok Build on the box.
# Branch feat/imagine-first-design only. Pushes only that branch. Never main. Never force.
# State: build-plan/state-260.json. Logs: build-plan/logs-260/. Stop: touch build-plan/STOP-260.
set -u
ROOT=/workspace/hitchhiker-imagine-2026-11-11
BP=$ROOT/build-plan; LOG=$BP/logs-260; STATE=$BP/state-260.json
BRANCH=feat/imagine-first-design
GROK=/home/box/.local/bin/grok
export COREPACK_HOME=$HOME/.cache/corepack HH_CASSETTE=replay
unset GROK_HOME GROK_SANDBOX
mkdir -p "$LOG"; cd "$ROOT"
DENY=(--deny 'Bash(*git push*)' --deny 'Bash(*git reset --hard*)' --deny 'Bash(*git clean -*)' --deny 'Bash(*git checkout main*)' --deny 'Bash(*git merge*)' --deny 'Bash(*git rebase*)' --deny 'Bash(*pkill*)' --deny 'Bash(*killall*)' --deny 'Bash(*grok login*)' --deny 'Bash(*grok logout*)' --deny 'Bash(*GROK_HOME*)' --deny 'Bash(*vercel*)' --deny 'Bash(*netlify deploy*)' --deny 'Bash(*wrangler*)' --deny 'Bash(*hh brief --approve*)' --deny 'Bash(*so-long*)')
RULES="You are on branch $BRANCH in $ROOT. Never push, merge, rebase, deploy or switch branches. Never kill processes you did not start; other unrelated grok jobs are running on this machine. Never put an API key anywhere. Commit your work with the prompt's commit message when the verification passes."
st() { python3 - "$STATE" "$@" <<'PY'
import json,sys,os,time
p=sys.argv[1]; s=json.load(open(p)) if os.path.exists(p) else {"done":[]}
k,v=sys.argv[2],sys.argv[3]
if k=="done":
    s.setdefault("done",[]); v not in s["done"] and s["done"].append(v)
else: s[k]=v
s["updated"]=time.strftime("%Y-%m-%d %H:%M:%S %Z"); s["driver_pid"]=os.getppid()
json.dump(s,open(p,"w"),indent=1)
PY
}
isdone() { [ -f "$STATE" ] && python3 -c "import json,sys;sys.exit(0 if sys.argv[1] in json.load(open('$STATE')).get('done',[]) else 1)" "$1"; }
verify() { # $1=id $2=base-commit ; writes $LOG/$1.verify.log ; returns 0 when clean
  local id=$1 base=$2 out=$LOG/$id.verify.log rc=0 pk
  : > "$out"
  { echo "## typecheck"; pnpm typecheck; } >> "$out" 2>&1 || rc=1
  { echo "## lint"; pnpm lint; } >> "$out" 2>&1 || rc=1
  local pkgs
  if [ "$id" = "260z" ]; then pkgs=$(ls packages); else
    pkgs=$(git diff --name-only "$base" HEAD -- packages | cut -d/ -f2 | sort -u); fi
  for pk in $pkgs; do
    [ -f packages/$pk/package.json ] || continue
    echo "## test $pk" >> "$out"
    (cd packages/$pk && timeout 1800 pnpm test) > "$LOG/$id.test-$pk.log" 2>&1
    if [ $? -ne 0 ]; then
      fails=$(awk '/failing tests:/{f=1;next} f && /^✖ /{sub(/^✖ /,"");sub(/ \([0-9.]+m?s\)$/,"");print}' "$LOG/$id.test-$pk.log" | sort -u | grep -vxF -f "$BP/known-baseline-failures.txt")
      if [ -n "$fails" ] || ! grep -q "failing tests:" "$LOG/$id.test-$pk.log"; then
        echo "FAIL $pk: ${fails:-non-test failure, see $id.test-$pk.log}" >> "$out"; tail -n 60 "$LOG/$id.test-$pk.log" >> "$out"; rc=1
      else echo "only known baseline failures in $pk" >> "$out"; fi
    else echo "pass $pk" >> "$out"; fi
  done
  return $rc
}
run_grok() { # $1=log $2=prompt-file
  "$GROK" -m grok-4.7 --effort xhigh --always-approve --output-format streaming-json --max-turns "$3" --rules "$RULES" "${DENY[@]}" --prompt-file "$2" > "$1" 2>&1
}
[ "$(git branch --show-current)" = "$BRANCH" ] || { st status "wrong-branch"; exit 1; }
for f in $(ls "$BP"/prompts/260*.md | sort); do
  id=$(basename "$f" .md | cut -d- -f1)
  isdone "$id" && continue
  [ -f "$BP/STOP-260" ] && { st status "stopped-before-$id"; exit 0; }
  base=$(git rev-parse HEAD)
  st current "$id"; st status "running-$id"; st base "$base"
  echo "=== $(date '+%F %T %Z') START $id" >> "$LOG/driver.log"
  turns=300; [ "$id" = "260z" ] && turns=400
  run_grok "$LOG/$id.grok.jsonl" "$f" $turns; rc=$?
  echo "=== $(date '+%F %T %Z') END $id grok rc=$rc" >> "$LOG/driver.log"
  if [ -n "$(git status --porcelain)" ]; then git add -A && git commit -qm "$(sed -n '/^## Commit/,$p' "$f" | sed -n '/^```$/,/^```$/p' | sed '1d;$d' | head -1)" -m "Committed by run-260.sh after the Grok session ended with a dirty tree."; fi
  if [ "$rc" -ne 0 ] && [ "$(git rev-parse HEAD)" = "$base" ]; then st status "grok-failed-$id-rc$rc"; echo "BLOCKED $id grok rc=$rc, no commit" >> "$LOG/driver.log"; exit 1; fi
  if ! verify "$id" "$base"; then
    echo "=== $(date '+%F %T %Z') VERIFY FAIL $id -> one Grok fix session" >> "$LOG/driver.log"
    fixf=$LOG/$id.fix-prompt.md
    { echo "The previous Grok Build session implemented $f (read it). The driver's verification failed. Fix the real cause (never weaken a check, never skip or delete a test), then commit with message 'fix: verification failures after $id'. Verification output:"; echo; tail -c 20000 "$LOG/$id.verify.log"; } > "$fixf"
    run_grok "$LOG/$id.fix.grok.jsonl" "$fixf" 200
    [ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "fix: verification failures after $id" -m "Committed by run-260.sh after the Grok fix session ended with a dirty tree."
    if ! verify "$id" "$base"; then st status "verify-failed-$id"; echo "BLOCKED $id verification still failing" >> "$LOG/driver.log"; git push -q origin "$BRANCH" >> "$LOG/driver.log" 2>&1; exit 1; fi
  fi
  git push -q -u origin "$BRANCH" >> "$LOG/driver.log" 2>&1 || echo "push failed after $id" >> "$LOG/driver.log"
  st done "$id"; st last_commit "$(git rev-parse --short HEAD)"
  echo "=== $(date '+%F %T %Z') DONE $id $(git rev-parse --short HEAD)" >> "$LOG/driver.log"
done
st status finished; st current none
