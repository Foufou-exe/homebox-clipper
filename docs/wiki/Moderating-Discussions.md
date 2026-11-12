# Moderating Discussions

How to look after the repository's [Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions). Keep it light: the project is maintained on spare time, and a friendly, tidy space matters more than fast answers.

## Categories

The repository uses GitHub's default categories. The names must stay as they are: the forms and the release announcement depend on their slugs and names.

| Category (slug) | Use |
|-----------------|-----|
| Announcements (`announcements`) | Maintainer only: releases and news. Each release opens a post here automatically (see [Releasing](Releasing.md)) |
| General (`general`) | Anything else |
| Ideas (`ideas`) | Suggestions, discussed before becoming an issue |
| Polls (`polls`) | Maintainer polls, for example the next store to support |
| Q&A (`q-a`) | Help requests; answers can be marked |
| Show and tell (`show-and-tell`) | Setups, tips, results |

## Mark an answer

In a Q&A discussion, open the comment that solves the question and use **Mark as answer** (the check icon under the comment). The question author or anyone with triage access can do it. Marking answers makes the Q&A searchable.

## Convert between discussions and issues

- **Discussion to issue**: when an Ideas or Q&A post turns out to be a confirmed bug or a clear feature, use **Create issue from discussion** in the right sidebar. Choose the matching issue form, add the labels (`bug`, `enhancement`, `needs-triage`) and link back to the discussion.
- **Issue to discussion**: when an issue is really a question or an open idea, use **Convert to discussion** in the right sidebar of the issue, then pick the category (usually Q&A or Ideas). The issue is closed and its history is kept.
- **Move between categories**: use the pencil icon next to the category name of a discussion.

## Lock and pin

- **Lock** a discussion that is resolved, off topic or heated (*Lock conversation* in the right sidebar). Give a short, kind reason.
- **Pin** up to four discussions to the top of the list (*Pin discussion*). The welcome post is the natural first one.
- Hide spam or off-topic comments with *Hide*, and delete anything that exposes personal data, an API key or a real instance address (then tell the author to revoke the key).
- Reports of misbehavior follow the [Code of Conduct](https://github.com/Foufou-exe/homebox-clipper/blob/main/CODE_OF_CONDUCT.md).

## Update the forms

Discussion forms are YAML files in `.github/DISCUSSION_TEMPLATE/`, one per category, named after the category slug (`q-a.yml`, `ideas.yml`, `show-and-tell.yml`, `general.yml`). There is no form for Announcements (maintainer only) nor for Polls (not supported by GitHub).

1. Edit the file in a pull request, like any other file. Syntax: [Syntax for discussion category forms](https://docs.github.com/en/discussions/managing-discussions-for-your-community/syntax-for-discussion-category-forms).
2. Keep the privacy warning word for word: *Never attach raw store pages, API keys, real instance addresses (public or local) or personal data.*
3. Run `bun run check:config`: it validates the schema, the ids, the privacy warning and the labels. These files do not trigger GitHub CI, so `bun run ci` locally is their only guard.
4. Forms apply once merged into `main` (the default branch).

Related files: `SUPPORT.md` (where to ask what) and `.github/ISSUE_TEMPLATE/config.yml` (links to the Discussions from the new-issue page).
