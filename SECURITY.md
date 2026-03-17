# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
responsibly by opening a private security advisory rather than a public issue.

## Scope

This is a browser extension that runs entirely in the client. The primary
security considerations are:

- **Content scripts** — The extension injects content scripts into LinkedIn
  pages. These scripts should never exfiltrate user data or make requests
  to third-party services.
- **Permissions** — The extension requests only the minimum permissions
  needed to function. Any PR that broadens permissions requires justification.
- **DOM interaction** — Content scripts read and manipulate the LinkedIn DOM.
  Input from the page should be treated as untrusted.

## Best Practices

- Never store or transmit user credentials or session tokens
- Validate all data read from the page DOM before processing
- Keep the manifest permissions as narrow as possible
