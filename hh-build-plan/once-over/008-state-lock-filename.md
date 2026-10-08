# 008. Lock file name differs from v2

Status: **proposed**. Not applied.

## Miss

v2 §4 says the spine is written under `STATE.md.lock` (exclusive create, stale after a dead pid).

`packages/engine/src/lock.ts` exports `STATE_LOCK_NAME = "state.lock"` and holds `.hitchhiker/state.lock`. The exclusive create and the stale-pid release are implemented. Review 008 recorded the difference: prompt 007 named `state.lock`, Matt and `DECISIONS.md` are silent, and v2 §10.1 says `STATE.md.lock`.

The behavior is present. The filename is not the one v2 names.

## Fix

Either rename the constant to `STATE.md.lock` and update every test that joins that path, or amend v2 to the shipped name. Do both in one change so writers and the spec match. Do not take the lock out.

## Why this pass did not do it

The name is pinned across the engine tests. A rename is a coordinated contract change, not a one-line fix.
