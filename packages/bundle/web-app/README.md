# `@deepseek-ai/dsh-web-app`

English | [中文](README.zh.md)

The dsh browser-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md): it sets the coding persona, inserts the Web host rows (webserver, API gateway, workspace, projection cache, storage) and browser plugin roster, and mounts this package's `web-runtime` glue. It also carries the disabled-by-default [`mobile-access`](../../host/mobile-access/README.md) row. The ordinary `web-startup` provider parses `--host`, `--port`, repeatable `--trusted-host`, `--mobile`, and the app's `--help`, then provides `webStartup`; `--mobile` activates only the separate authenticated encrypted carrier and never changes the loopback browser bind. Flag-configured rows read the service from lazy config, so no server binds before argument resolution and `dsh --profile web --help` starts no server. The always-on client HMR chain remains idle until a rebuild watcher rewrites client bundles. [`dsh-headless`](../headless/README.md) is a sibling surface over the same base and mounts neither browser nor mobile carrier.

## Model Experience

### Harness-source and Web-surface context

#### What the model sees

When `surfaceContext` is true, the `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:web-surface` global section (order −98) orients the model to the GUI: the canonical local URL, the "this page" referent, the update contract (the reload receiver is always on; no-refresh reloads additionally need the `pnpm run dev:web` watcher), and the instruction not to start replacement servers. `DSH_WEB_URL` additionally appears in the managed bash environment with its description, resolved per invocation from the live server. When it is false, neither section nor the variable is registered.

#### Token effect

One source line and one prompt paragraph per session plus two managed-environment variable lines; constant per process.

#### KV Cache effect

The prompt section sits near the system prompt's head and is stable for the life of the process (the port is a boot fact), so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **The frontend dist must be built** — `require.resolve` of the dist fails loud at activation with a build hint; there is no source-serving fallback.
- **`lanAddresses` is a boot-time snapshot** — interface changes after boot are not re-advertised; the printed LAN URL always matches the configured trust fence.
