# DSH Desktop

The Windows build starts the bundled DSH web server on `0.0.0.0`, preferring
port 3080 and falling back to an OS-selected free port when Windows reports
`EACCES` or `EADDRINUSE`. The Electron window uses the same HTTP/WebSocket
endpoint as LAN clients.

Build from the repository root:

```text
pnpm install --frozen-lockfile
pnpm build
node --import tsx/esm scripts/desktop-stage.ts
pnpm --filter @deepseek-ai/dsh-desktop dist
```

API keys are read from environment variables only; see the repository
`SECURITY.md`.
