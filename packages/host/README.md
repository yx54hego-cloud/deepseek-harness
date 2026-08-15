# host/ — web-GUI host half

English | [中文](README.zh.md)

The host side of the dsh browser and mobile surfaces: the API gateway every client shape shares, the plain HTTP server the browser rides on, and the separately authenticated mobile carrier. The browser side lives in [`client/`](../client/README.md); the mobile app lives in [`apps/mobile`](../../apps/mobile/). All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`apiproxy/`](apiproxy/README.md) | Shared host API gateway and wire contract | `ctx.apiProxy` |
| [`webserver/`](webserver/README.md) | HTTP route carrier | `ctx.webServer` |
| [`mobile-access/`](mobile-access/README.md) | Authenticated encrypted mobile Session carrier | `ctx.mobileAccess` |
| [`frontend-static/`](frontend-static/README.md) | SPA dist server on the webserver fallback seat | consumes `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.md) | Workspace-directory picking seam | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.md) | Native directory-picker backend and browser interaction | registers `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.md) | In-app directory-browser backend and interaction | registers `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.md) | Host-adaptive picker composition | mounts a backend |
| [`plugin-inventory/`](plugin-inventory/README.md) | Read-only projection of current Loader entries | Remote `pluginInventory/list` |

`apiproxy` remains transport-independent; [`client/connection`](../client/connection/README.md) supplies the browser/HTTP carrier, while `mobile-access` supplies a smaller authenticated allowlist over a separate listener. Picker implementations replace one another behind the shared seam.

The subsystem references: [web-server.md](../../docs/subsystems/web-server.md) and [workspace.md](../../docs/subsystems/workspace.md) (the picker seam).
