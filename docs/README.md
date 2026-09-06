# Documentation — CMBFRONTEND

This directory holds the **frontend-owned** documentation and the two interface
contracts the client is written against.

> ## THE OPERATIONS HOME IS THE OTHER REPOSITORY
>
> Deployment, secrets, migrations, bootstrap, the runbook, the security audit,
> the decision log (`D-xxx`), the roadmap, the changelog and the go-live
> checklist all live in **CMBBACKEND `docs/`**:
>
> <https://github.com/RiseNext/CMBBACKEND/tree/main/docs>
>
> They were not duplicated here on purpose. Two copies of a 2,300-line decision
> log drift, and a drifted operational document is worse than a link.

---

## HERE

| Document | What it answers |
|---|---|
| [INTEGRATION_MAP.md](INTEGRATION_MAP.md) | **Screen by screen: does this control reach the database?** The most useful file in this directory |
| [API_OVERVIEW.md](API_OVERVIEW.md) | All 96 backend endpoints with permission, validation, DB effect and caller — the contract this client consumes |
| [ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md) | The 5 roles, 76 permissions, and a per-role capability matrix. What permission-aware navigation is derived from |
| [REPOSITORY_SPLIT.md](REPOSITORY_SPLIT.md) | What moved where when the monorepo was split, and what to do about a path that no longer resolves |
| [FRONTEND_ANALYSIS.md](FRONTEND_ANALYSIS.md) | Pre-backend reconnaissance from the first commit. **Superseded** — its §2 missing-UI list and §8 product question are still live |
| [LEGACY_README.md](LEGACY_README.md) | The original standalone-mock README. **Historical and known false**; it carries its own list of what it gets wrong |

## THERE — CMBBACKEND `docs/`

| Document | What it answers |
|---|---|
| `GO_LIVE_CHECKLIST.md` | The ordered list of what remains, who owns each row, 72-hour hypercare |
| `DEPLOYMENT.md` | Platforms, the migration release step, rollback, backup/restore, the smoke test |
| `SECRETS.md` | Every environment variable, classified, with generator commands |
| `DECISIONS.md` | Why things are the way they are — every `D-xxx` referenced from this repository |
| `SECURITY_AUDIT.md` | Every confirmed security finding — every `SEC-xxx` referenced from this repository |
| `BUGS_AND_ISSUES.md` | Every confirmed bug — every `BUG-xxx` referenced from this repository |
| `CURRENT_STATE.md` · `FEATURE_STATUS.md` | What actually works, verified by tracing code |
| `ARCHITECTURE.md` · `DATA_MODEL.md` · `BUSINESS_FLOW.md` · `PRD.md` | Reference |
| `TESTING_STRATEGY.md` | What is tested, what gives false confidence, what to add |
| `CHANGELOG.md` · `PRODUCTION_ROADMAP.md` · `PRODUCTION_READINESS.md` | History and plan |

---

## GROUND RULES

1. **Trace before you claim.** A page, button, type or route existing proves
   nothing. Cite `file:line` for every link in the chain.
2. **The backend is the only authority.** Anything enforced only in React is not
   enforced.
3. **Never create fake functionality.** No success toast without an awaited
   request. Disable it or remove it instead — `zero-fake-sweep.test.tsx` fails
   the build otherwise.
4. **Keep demo mode; isolate it.** It must never touch real authentication, and
   it must never enter a production bundle.
5. **Never print a secret value.** File and variable name only.
6. **If the documentation and the code disagree, the code wins** — fix the
   documentation in the same session.
