# Doclane Frontend Agent Instructions

## Frontend Conventions

- Use React Query for server-state and query/mutation lifecycle management.
- Use Axios for HTTP transport.
- Keep API request functions separate from React components.
- Do not call `fetch` directly from UI components for backend API access.
- Query keys must be centralized or colocated in typed query modules, not repeated ad hoc across components.
- Mutations must invalidate or update related React Query cache entries explicitly.

## shadcn/ui

- Use the shadcn CLI to add and maintain shared shadcn/ui components.
- Keep generated shadcn components under the configured shared UI component directory.
- Do not manually recreate shadcn components when the CLI can add them.
- Do not apply feature-specific styling directly inside shadcn shared components.
- Treat shadcn shared components as reusable primitives.
- Apply feature-specific layout and styling through wrapper components, page components, or feature components.

## Component Structure

- Split components by responsibility.
- Do not place page orchestration, API calls, forms, table/list rendering, and low-level UI primitives in one large file.
- Pages should compose feature components and avoid owning detailed UI implementation.
- Feature components should live under feature-oriented folders.
- Shared reusable components should live under shared component folders.
- Keep files small enough that one file has one clear reason to change.

## File Layout

- Keep backend API clients and query hooks outside page files.
- Prefer typed folders for non-page code, for example:
  - `src/lib/api/*.ts`
  - `src/lib/query/*.ts`
  - `src/features/documents/components/*.tsx`
  - `src/features/documents/queries/*.ts`
  - `src/features/documents/types/*.ts`
  - `src/components/ui/*.tsx`
- Do not put feature DTOs, API clients, query hooks, and components together in a single root file.

## Styling

- Do not style shadcn shared components directly for one feature.
- Keep shared UI primitive styling generic.
- Use composition and wrapper components for feature-specific appearance.
- Avoid oversized marketing-style layouts for the reader app; prioritize dense, clear document workflows.

## Verification

- After frontend changes, run:
  - `pnpm lint`
  - `pnpm build`
- When adding interactive or visual flows, run the app locally and verify the affected screen in a browser.
