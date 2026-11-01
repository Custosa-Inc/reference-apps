# Contributing

Thanks for helping. You can:

- work on an open issue
- report something that doesn't match how the real systems or standards work
- propose a new app or a new service for an existing app (open an issue first so we can agree on
  scope)

## Picking an issue

We don't assign issues. When you're ready, open a pull request that links the issue. Opening a draft
pull request early lets others see you're working on it. If more than one pull request solves the
same issue, we merge the first one that passes review and meets the issue's "done when" list.

Issues labelled `good first issue` are small and self-contained.

## Running an app

Every app's README explains how to run it. For example, for the clinic:

```bash
cd clinic
docker compose up --build
```

To work on one service without Docker, go to its folder under `services/` and follow the app's README.

## Before you open a pull request

Run these in the folder of each service you changed:

```bash
npm run format
npm run typecheck
npm test
```

- Keep each pull request to one issue or one change.
- Add or update tests for what you change.
- Follow the app's ARCHITECTURE.md. For the clinic, `npm test` also checks the module rules.
- If you change a decision recorded in an app's DECISIONS.md, add a new entry that explains why.

## Sign your commits

We use the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). It says you
wrote the change, or otherwise have the right to submit it under the project's license. Sign off each
commit:

```bash
git commit -s
```

This adds a `Signed-off-by` line with your name and email. A check on every pull request makes sure
each commit has one. To sign off commits you've already made, run `git rebase --signoff main`.

## Using AI tools

You're welcome to use AI coding tools. You are responsible for every line you submit: read it, test
it, and be ready to explain it in review. Say in the pull request if an AI tool wrote a large part of
it.

## Data rules

- Use synthetic data only. Never add real patient, customer or employee data, or anything copied from
  a production system.
- Use fictional contact details: phone numbers in the 555-01xx range and email addresses at
  example.com.
- Don't add licensed code sets such as CPT or CDT, or text copied from paid standards documents.

## Adding an app

Each app is a folder at the root of the repo with its own README, ARCHITECTURE.md, DECISIONS.md,
`compose.yaml`, tests and CI workflow in `.github/workflows/`. Open an issue to discuss a new app
before you start.

## Reporting a security problem

Please don't open a public issue. Use "Report a vulnerability" on the repo's Security tab.
