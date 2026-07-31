# Security Policy

## Supported versions

StackForge is currently in MVP development. Security fixes are applied to the
latest release and the current `main` branch. Older releases may not receive
backported fixes.

## Reporting a vulnerability

Please do not publicly disclose an exploitable vulnerability before there has
been a reasonable opportunity to investigate and coordinate a fix.

Use GitHub's private vulnerability reporting form:

<https://github.com/Mide6x/StackForge/security/advisories/new>

Include:

- The affected version or commit.
- A clear description of the issue and its impact.
- Reproduction steps or a minimal proof of concept.
- Any suggested mitigation.

Do not include credentials, access tokens, personal data, or unrelated private
information.

If private vulnerability reporting is unavailable, the repository owner must
enable it under **Settings → Security → Code security and analysis → Private
vulnerability reporting**. Do not publish exploit details in a public issue.

The maintainer will acknowledge a complete report when practical, investigate
it, and coordinate disclosure based on the severity and complexity of the
issue.

## Destination-path safety

Project destination input is security-sensitive in StackForge because it
controls where generated files are inspected, created, or removed.

Current policy:

- The CLI accepts `.` and nested relative destination paths under the command's
  invocation directory.
- Absolute destination input and parent-directory escapes such as `../outside`
  are rejected.
- StackForge canonicalizes the approved destination before generation.
- Generated files are constrained to the approved project root.
- Writes through symlinked paths inside the destination are rejected.
- Managed cleanup only removes paths proven to be inside the project root.

Relevant validation lives in the normal repository test suite. Local CodeQL
analysis is not available in this repository environment, so a clean GitHub
CodeQL run is still required before making CodeQL a required status check on
`main`.
