<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Stock is never stored as a number: balances are derived from `movements` (per school, product, origin) via `src/lib/estoque.ts`; DB triggers block negative stock and edits in closed months. Why: a single source of truth keeps reports and carry-over consistent.
- Monthly closings store a frozen snapshot in `monthly_closings`; reopening (admin) deletes it and is audited via `audit_log` triggers. Why: closed months must stay reproducible.
- Roles live in `user_roles` (admin, estoquista, diretor); school scoping is enforced by RLS helpers `can_view_school`/`can_write_school`.
- Shared visual styling is defined by semantic tokens in `src/styles.css` and the shared shell/UI kit; the public entry remains the authentication page. Why: visual changes stay consistent without altering stock or authentication rules.
- Content routes declare their own metadata; internal pages use `src/lib/page-meta.ts`. Why: each page has complete, distinct sharing and search descriptions.
