# Security Policy

## Supported versions

The latest release on the `main` branch is the only supported version.

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, report them
privately through GitHub's [security advisories](https://github.com/a-y-ibrahim/after-effects-mcp/security/advisories/new)
for this repository. You can expect an initial response within a few days.

## Scope worth knowing about

This server exposes an `execute-script` tool that runs arbitrary ExtendScript
inside After Effects, and the AE panel requires the "Allow Scripts to Write Files
and Access Network" permission to function. That is by design: the whole point is
to give an AI assistant programmatic control of After Effects. Treat the MCP
server the same way you would treat a local shell. Only connect it to clients you
trust, and be aware that any prompt able to reach the server can, in principle,
run scripts and read or write files that After Effects can.
