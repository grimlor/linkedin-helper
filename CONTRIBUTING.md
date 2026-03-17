# Contributing

Thanks for your interest in contributing to linkedin-helper. This
document covers the development setup, coding standards, testing philosophy,
and PR process.

---

## Development Setup

```bash
# Clone
git clone https://github.com/grimlor/linkedin-helper.git
cd linkedin-helper

# Install dependencies
npm ci
```

## Running Checks

All checks must pass before submitting a PR:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript strict mode
npm test            # Jest tests
npm run test:coverage  # Tests with coverage report
```

## Code Style

- **TypeScript** with strict mode enabled.
- **ESLint** handles linting. Don't fight it.
- **No `any`** unless you have a good reason and document it.

## Testing Standards

Tests are the living specification. Every test class documents a behavioral
requirement, not a code structure.

### Test Structure

```typescript
describe('YourFeature', () => {
  // REQUIREMENT: One-sentence summary of the behavioral contract.
  // WHO: Who depends on this behavior
  // WHAT: What the behavior is
  // WHY: What breaks if this contract is violated

  it('should do something specific', () => {
    // Given some precondition
    // When an action is taken
    // Then an observable outcome occurs
  });
});
```

### Key Principles

1. **Mock I/O boundaries, not implementation.**
2. **Failure specs matter.** For every happy path, ask: what goes wrong?
3. **Missing spec = missing requirement.** If you find a bug, the first
   step is adding the test that should have caught it.
4. **Every assertion includes a diagnostic message.**

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add video filtering by duration

- Filter controls in the Videos tab
- Persists selection across page navigation
```

Common prefixes: `feat:`, `fix:`, `test:`, `docs:`, `build:`, `refactor:`,
`style:`, `ci:`, `chore:`.

## Pull Requests

1. **Branch from `main`.**
2. **All checks must pass** — lint, typecheck, and tests.
3. **Include tests** for any new behavior or bug fix.
4. **One concern per PR** — don't mix a new feature with unrelated refactoring.
5. **Describe what and why** in the PR description.

## Reporting Issues

When filing an issue:

- **Bug:** Include the browser and version, what you expected, and steps to
  reproduce.
- **Feature request:** Describe the problem you're trying to solve, not
  just the solution you have in mind.
