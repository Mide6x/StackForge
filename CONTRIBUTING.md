# Contributing to StackForge

Thanks for helping improve StackForge. Focused bug fixes, documentation,
providers, integrations, tests, and developer-experience improvements are
welcome.

## Contribution licence

By submitting a contribution to StackForge, you agree that your contribution
is licensed under the Mozilla Public License 2.0.

You retain copyright in your contribution. No Contributor Licence Agreement is
currently required, and you are not assigning your copyright to Olumide
Adewole. You must have the right to submit the contribution and must not include
code copied from incompatible or unauthorised sources.

## Development setup

StackForge requires Node.js 20 or newer.

```bash
git clone https://github.com/Mide6x/StackForge.git
cd StackForge
npm install
npm run build
npm test
```

Use `npm ci` when validating a clean checkout against the committed lockfile.
Additional opt-in validation commands are documented in the README.

## Contribution workflow

1. Fork the repository.
2. Create a focused feature branch from the latest `main`.
3. Make your changes without unrelated formatting or refactoring.
4. Add or update tests for functional changes.
5. Run the build and test suites.
6. Push the branch to your fork.
7. Open a pull request against `Mide6x/StackForge:main`.

Useful branch names include:

```text
feat/testing-support
feat/fastapi-postgres
fix/summary-paths
docs/provider-guide
```

## Pull-request expectations

Pull requests should:

- Have a focused scope and a clear explanation.
- Include tests for functional behaviour.
- Update documentation when behaviour or support claims change.
- Avoid unrelated formatting changes.
- Contain no credentials, tokens, private keys, or personal data.
- Pass all required CI checks.
- Resolve review conversations before merge.
- Describe generated-project impact where applicable.

Approval is not guaranteed. The maintainer may request changes, narrow the
scope, or decline changes that do not fit StackForge's direction.

## Commit messages

Conventional-style messages are recommended:

```text
feat: add FastAPI PostgreSQL connector
fix: preserve destination in environment copy command
test: validate generated Express projects
docs: clarify Docker support
chore: update dependencies
```

Commit-message formatting is not automatically enforced.

## Governance

The `main` branch is protected and is intended to remain stable and
release-ready. Direct pushes are not accepted. Changes must arrive through pull
requests, pass required checks, receive the required review, and resolve open
review conversations.

`@Mide6x` is the sole CODEOWNER and performs official merges. Public
contributors do not need repository write access; fork-based pull requests are
the normal contribution path.

StackForge does not currently maintain a separate code of conduct. Be
respectful, constructive, and focused on the project when participating.
