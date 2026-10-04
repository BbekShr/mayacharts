# Security policy

## Supported versions

| Version | Status |
| ------- | ------ |
| 0.0.x   | Active |

Security fixes for the latest minor version only.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on the repository. Go to the Security tab and select "Report a vulnerability". Do not open a public issue.

Expected acknowledgement: within 72 hours.

## Scope and practices

- Every spec value is escaped during rendering
- Theme and color values validated against an allowlist
- No external fetches or code evaluation
- Works under strict Content-Security-Policy with Trusted Types (policy name `mayacharts`)
- `renderShell` embeds only the data fields a spec references
- No telemetry
- Published package carries npm provenance
- Global IIFE build SRI hash is in README.md
