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

- Keep private account identifiers stable and map visible names through `src/lib/chat-accounts.ts`; renaming must not create users or break existing account-linked data.
- Provision or change account credentials only through trusted administrative tools, never through a public seed endpoint or hardcoded source values.
