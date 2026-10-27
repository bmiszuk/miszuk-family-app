# Miszuk Family Website Development Instructions

- Inspect the existing code, architecture, and relevant documentation before making changes.
- Prefer simple, reliable, maintainable solutions that fit the current application. Investigate existing implementations before adding dependencies or introducing architectural changes.
- Implement straightforward requests directly; ask clarifying questions only when needed to prevent a material error or resolve an important design decision.
- Preserve existing production data, relationships, authentication, authorization, and feature behavior unless the requested change explicitly requires otherwise.
- Add focused regression tests when appropriate. Run the relevant tests, lint, and production build before release, and report anything not verified.
- Use the established deployment workflow: `node ../deploy.mjs`.
- For routine, low-risk changes, commit, push, and deploy after successful verification unless the user explicitly says otherwise.
- Request approval before destructive database migrations, significant security or authentication changes, or other high-risk production operations.
- Back up production data before migrations, use the established safe migration procedure, and verify the result afterward.
- Report the changes made, test/lint/build results, deployment status, and any remaining limitations or verification gaps.
