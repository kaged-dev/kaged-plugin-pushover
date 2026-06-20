<div align="center">

<img src="https://kaged.dev/hero.svg" alt="kaged" width="100%" />

# 影 @kaged/plugin-pushover

**shadow ops for your `[attention]`**

A [kaged](https://kaged.dev) system plugin that delivers session notifications to [Pushover](https://pushover.net) — `attention.required` and `run.completed` events routed through kaged's notification pipeline when the operator has zero live WebSocket connections.

[![npm](https://img.shields.io/npm/v/@kaged/plugin-pushover?color=FFB000&label=npm&labelColor=0A0A0B)](https://www.npmjs.com/package/@kaged/plugin-pushover)
[![license](https://img.shields.io/badge/license-MIT-FF2E63?labelColor=0A0A0B)](#license)
[![plugin](https://img.shields.io/badge/plugin-system-00E0FF&labelColor=0A0A0B)](#what-it-is)

</div>

---

## what it is

kaged emits two notification event classes per [ADR-0047](https://github.com/kaged-dev/monorepo/blob/main/docs/adr/0047-session-notifications.md): `attention.required` (checkpoint / ask / approval gate) and `run.completed`. When the operator has no live WebSocket connection, those events fan out to **tier-3 channels**. This plugin registers a Pushover channel via the `notification.channel.register` system-plugin hook.

`@kaged/plugin-ntfy` is the recommended primary (self-hostable, fits the ethos). This package is the hosted alternative — reliable iOS/Android delivery via Pushover's managed service, in exchange for a one-time Pushover licence fee.

- **Per-user + per-app credentials** — `user_key` and `api_token` resolved via env var indirection or inline.
- **Priority mapping** — `attention.required` defaults to `1` (high), `run.completed` to `-1` (low). Override per config; emergency priority (`2`) emits `retry`/`expire` extras.
- **Per-project credential override** — routing-channel config can override any field per project without running a second plugin instance.
- **Retry with backoff** — 429 / 5xx / network failures retry up to `retry_count` times.

## configure

In the daemon's `local.toml`:

```toml
[system_plugins."@kaged/plugin-pushover"]
enabled = true

[system_plugins."@kaged/plugin-pushover".config]
user_key_env   = "PUSHOVER_USER_KEY"
api_token_env  = "PUSHOVER_API_TOKEN"
```

Per ADR-0047, declare pushover as eligible for whichever event classes you want pushed:

```toml
[notifications.routing.attention_required.pushover]
priority_attention = 2        # emergency: retries until acknowledged

[notifications.routing.run_completed.pushover]
# opt into run-completion pushes
```

| Field | Type | Default | Description |
|---|---|---|---|
| `user_key_env` | string | — (one of) | env var name holding the user key |
| `user_key` | string | — (one of) | inline user key (prefer `*_env`) |
| `api_token_env` | string | — (one of) | env var name holding the application API token |
| `api_token` | string | — (one of) | inline API token (prefer `*_env`) |
| `priority_attention` | integer -2..2 | `1` | Pushover priority for `attention.required` |
| `priority_completion` | integer -2..2 | `-1` | Pushover priority for `run.completed` |
| `sound_attention` | string | `"siren"` | Pushover sound for `attention.required` |
| `sound_completion` | string | `"pushover"` | Pushover sound for `run.completed` |
| `click_base_url` | string | — | origin prepended to event `deep_link` |
| `device` | string | — | target a specific device name |
| `timeout_ms` | integer | `5000` (clamped 1000–30000) | per-request timeout |
| `retry_count` | integer | `2` (clamped 0–5) | retries on transient failure |
| `retry_delay_ms` | integer | `1000` (clamped 100–10000) | base retry delay |

⚠️ Emergency priority (`2`) automatically includes `retry: 60` and `expire: 600` per the Pushover API.

Full spec: [`docs/specs/plugins/pushover.md`](https://github.com/kaged-dev/monorepo/blob/main/docs/specs/plugins/pushover.md).

## development

```bash
bun install
bun test
bun run typecheck
bun run format      # biome
```

Type imports come from [`@kaged/plugin-types`](https://www.npmjs.com/package/@kaged/plugin-types) (devDependency — erased at runtime).

## release

Bump `version` in `package.json`, tag `v<version>`, push the tag. CI verifies the tag matches, runs the suite, and publishes to npm with provenance.

---

## license

MIT © the kaged project

<div align="center">

`[kaged]` · [kaged.dev](https://kaged.dev) · *sanctioned edge, sacred code*

</div>
