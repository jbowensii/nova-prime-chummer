# Gates: accessory-association audit + fix (CL6 slot model → catalog fits), picker leak, reimport

OWNS: src/sr6/runner-builder/ui/**, src/sr6/catalog/**, importer/sr6/**, tests/**, docs/reviews/**

Scope (owner, full thorough path, "override with CL6 data if necessary"): cross-reference every equipment/enhancement
type's accessory list (CommLink6 vs ours), fix the systemic association so only CL6-valid accessories are offered per host
(via the CL6 slot model applied to the catalog) and fix the picker's host-agnostic Part-B leak, report per-type diffs,
pass the CL6 replay/accuracy gates, deploy and reimport on tower04, verify in-app. CL6 is the override authority.

## Audit (the comparison, finished first — it defines the fix)

- [ ] G1: authoritative CL6 association map extracted — every host slot and the accessories that embed in it — for all
      equipment types (weapons, armor, cyberware eyes/ears/limbs/headware, electronics/commlink/cyberdeck, vehicles,
      implant weapons, misc).
  CHECK: node -e "const fs=require('fs');const t=fs.readFileSync('docs/reviews/sr6-accessory-cl6-audit.md','utf8');process.stdout.write(/CYBEREYE_IMPLANT/.test(t)&&/CYBEREAR_IMPLANT/.test(t)&&/BARREL/.test(t)&&/VEHICLE_/.test(t)?'AUDIT_OK':'AUDIT_MISSING')"
  EXPECT: AUDIT_OK

- [ ] G2: per-type diff (CL6 vs ours) written to the audit doc, naming the leaks (weapon/armor accessories on cyberware)
      and the gaps (missing eye/ear/limb/electronics enhancements).
  CHECK: node -e "const t=require('fs').readFileSync('docs/reviews/sr6-accessory-cl6-audit.md','utf8');process.stdout.write(/Cyberears/.test(t)&&/leak/i.test(t)?'DIFF_OK':'DIFF_MISSING')"
  EXPECT: DIFF_OK

## Diagnosis (measured — verified by cl6check's own matcher)

**Verified count: 128 entries / 147 missing items** (39 entries/50 host-slots; 92 entries/97 accessory-fits; 3 need
both). (The earlier "~165" was an ad-hoc name-match; superseded.) 61/128 are low-confidence matches to verify.

**Root cause (deeper than overrides being incomplete):** `canon._own()` (tools/cl6check/canon.py:230-232) and the
override generator `familymap.structure()` (familymap.py:73-94) both **skip `<variant>` children**, so CL6's
variant-level associations (the `cybereye`/`cyberear` variants that add CYBEREYE_IMPLANT/CYBEREAR_IMPLANT) are invisible
to both the generator and the gate. Plus: the gate's family check passes if ANY matched sibling holds it
(__main__.py:188-195), and `ours.families` invents a fit from the printed MOUNT column (ours.py:134-138) the runtime
ignores. That's how we read 100% with 147 real gaps. Record-level: 23 entries (rated cybereyes/cyberears hosts;
bipod/tripod/periscope/gas-vent/laser-sight weapon fits; hs cases; etc.). Variant-level: 106 entries (eyeware/earware
fits, cyberlimb, weapon under-mount/internal, armor, vehicles, nanites×23).

**Also found — real value bug:** existing rated-host rows use `value:"$RATING"` (overrides/crb.json:257-258, + nf),
which yields capacity 5 instead of 16 at rating 5 because familymap drops CL6's `table="1,4,8,12,16"`. Fix alongside.

**Fill = generator fix (read variants) + a class rule (host slot by capacity; weapon fits from mount column) + a few
owner rows for ambiguous ids.** Stage the fills BEFORE grading (accuracy would drop ~3pts otherwise), and ship host
slots + accessory fits together (fitsHost goes slot-strict once an accessory has any `<fits>`).

## Fix (finished before build/deploy)

- [ ] G3: picker Part-B host-agnostic leak closed — an accessory with no category record is no longer offered to an
      arbitrary host; the category-less fallback is host-aware.
  CHECK: npx vitest run tests/sr6/runner-builder --reporter=dot 2>&1 | tail -3
  EXPECT: passed

- [ ] G4: the catalog carries the CL6 slot model (host `<slot>` + accessory `<fits slot>`) so fitsHost matches the
      CL6-valid set — cybereyes offers eye enhancements, cyberears offers ear enhancements, and neither offers weapon/
      armor accessories. Covered by a new unit test over a fixture.
  CHECK: npx vitest run tests/sr6/catalog --reporter=dot 2>&1 | tail -3
  EXPECT: passed

- [ ] G5: TypeScript compiles clean.
  CHECK: npx tsc -b 2>&1 | tail -3; echo TSC_DONE
  EXPECT: TSC_DONE

- [ ] G6: eslint clean.
  CHECK: npm run lint 2>&1 | tail -3
  EXPECT: (exit 0, no error)

- [ ] G7: prettier format clean.
  CHECK: npm run format:check 2>&1 | tail -3
  EXPECT: (exit 0)

- [ ] G8: full vitest suite passes.
  CHECK: npx vitest run 2>&1 | tail -4
  EXPECT: passed

- [ ] G9: Playwright e2e passes (incl. the accessories spec).
  CHECK: npm run e2e 2>&1 | tail -5
  EXPECT: passed

- [ ] G10: Python importer tests pass (CI-equivalent).
  CHECK: npm run test:py 2>&1 | tail -5
  EXPECT: (OK / only pre-existing LOCAL_CORE skips)

- [ ] G11: CL6 replay + accuracy gates hold (importer/override change must not regress CL6). main-vs-branch replay
      1079/1079 0 diffs; fresh production import effects 1079/1079, completeness 4474/4474, accuracy ≥ prior.
  CHECK: (owner PDFs + jar; docs/cl6check.md commands) — MANUAL until run
  EXPECT: parity 1079/1079, 0 differing rows; accuracy not regressed

## Build / deploy / reimport

- [ ] G12: image built + published to ghcr for the shipped commit (publish workflow).
  CHECK: gh api "user/packages/container/nova-prime-chummer/versions" --jq ".[0].metadata.container.tags"
  EXPECT: the shipped short-sha + latest

- [ ] G13: tower04 recreated from :latest, reimport of all books completed, and cybereyes/cyberears pickers verified
      correct in-app (eye/ear enhancements present, weapon/armor accessories gone).
  CHECK: (in-app via Chrome) — MANUAL
  EXPECT: version bumped; cyberears offers Audio enhancement/Select sound filter/etc.; no FN P93 Flashlight on cyberware
