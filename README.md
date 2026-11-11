# 衡川 · Rhetrion

Rhetrion is a private, local usage dashboard for Codex subscription users on
Windows x64. It shows recorded usage, quota movement, cache behavior, and work
estimates with their coverage and freshness.

The project is in development. See the [current status](docs/current-status.md)
for development and release information, and the [user guide](docs/user-guide.md)
for dashboard features and settings.

## Usage and refresh

- Recorded usage includes token and cache breakdowns, API-price-equivalent costs,
  model activity, and project/thread views. Cost figures express usage at
  reference API prices for comparison.
- Subscription statistics use session metadata to filter explicit API-key and
  custom-provider sessions. Historical sessions with unspecified authentication
  retain the local subscription model.
- Incremental refreshes reuse verified local data, revalidate changed sources,
  and count each usage record once.
- Quota observations, estimated remaining work and actual/expected consumption
  have separate coverage. The interface labels stale, partial and unavailable
  results; estimates depend on the available evidence.

## Local behavior and privacy

Usage analysis runs offline, and the companion serves the dashboard over
loopback. Local inputs include Codex session files, thread and project metadata,
speed configuration, and bounded runtime model evidence. Account and quota
observations use the Codex app-server.

Reports, exports and diagnostics use privacy-filtered projections. Private source
paths stay in protected local state, including the index and explicitly created
export workspaces. Display windows preserve retained history.

The optional X reader uses a separate protected browser session. Local usage
data stays on the device.

See [local data and privacy](docs/reference/local-data-and-privacy.md),
[security policy](SECURITY.md), and [safe recovery](docs/runbooks/local-index-recovery.md).

## Develop and verify

Root tooling needs Node.js 22.13 or newer and pnpm 11. Production Electron source
preparation requires exactly Node.js 26.2.0. Native packaging and desktop validation
require a supported interactive Windows x64 host.
Local source runs also require a compatible Windows native binding and verified
adjacent manifest.
See the [native adapter prerequisites](native/windows-filesystem/README.md).

```sh
pnpm install --frozen-lockfile
pnpm run product:local
```

Use a backed-up copy of application data for candidate testing. Existing profiles
use `%APPDATA%/UsageMonitor/profiles/<profile>`; data cutover follows the
[controlled migration workflow](docs/decisions/2026-10-27-pre-release-state-migration.md).

Use focused tests first, then the relevant checks:

```sh
pnpm run test:preflight
pnpm run architecture:check
pnpm run product:ui:test
pnpm run product:electron:test
pnpm run product:local:test
```

`pnpm run check` composes the broad source checks. See
[contributing](CONTRIBUTING.md) and the
[documentation index](docs/README.md) for maintained contracts.

## Local usage coaching

`node ./src/cli.js explain-usage-plans` lists the bounded, deterministic local
analysis plans. The [agent protocol](docs/reference/usage-explainer-agent-protocol.md)
defines pagination, evidence selection and interpretation boundaries. The
repository's usage-coaching skill uses this CLI.

## Repository layout

The source layout follows `src/` for domain behavior, `apps/local` for the companion,
`apps/web` for the dashboard, `apps/electron` for the shell, `packages/` for neutral
public APIs, and `native/windows-filesystem` for the Windows security boundary.

## Support and language

The interface supports English, Simplified Chinese and Spanish. For
troubleshooting, review [support guidance](SUPPORT.md).
