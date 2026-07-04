# Security Policy

## Supported versions

The latest release on the `main` branch is the only supported version.

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, report them
privately through GitHub's [security advisories](https://github.com/a-y-ibrahim/after-effects-mcp/security/advisories/new)
for this repository. You can expect an initial response within a few days.

## Known advisories in the MCP SDK's HTTP transport

`npm audit` currently reports advisories in `@modelcontextprotocol/sdk` and its
Express dependency chain (`express`, `body-parser`, `path-to-regexp`, `qs`). Every
one of these is in the SDK's **Streamable HTTP / SSE transport**.

This server uses **`StdioServerTransport` only** (see `src/index.ts`). It never
starts an HTTP server, so Express and its dependencies are installed but never
loaded or reachable. The DNS-rebinding advisory is HTTP-transport-specific by
definition, and the ReDoS/DoS advisories live in HTTP request-parsing code paths
this server does not execute.

The SDK versions that patch these advisories currently trigger a TypeScript
compiler regression (unbounded type inference across this server's tool
registrations) that fails the build, so the dependency is pinned to a version
that builds. This is tracked, and the pin will be lifted once a patched SDK
release compiles cleanly. If you expose this server over HTTP by modifying it,
re-evaluate these advisories first.

## Scope worth knowing about

This server exposes an `execute-script` tool that runs arbitrary ExtendScript
inside After Effects, and the AE panel requires the "Allow Scripts to Write Files
and Access Network" permission to function. That is by design: the whole point is
to give an AI assistant programmatic control of After Effects. Treat the MCP
server the same way you would treat a local shell. Only connect it to clients you
trust, and be aware that any prompt able to reach the server can, in principle,
run scripts and read or write files that After Effects can.
