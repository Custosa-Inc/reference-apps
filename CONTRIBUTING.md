# Contributing

Thanks for helping. You can:

- work on an open issue
- close a gap in an app's compliance page, such as the clinic's [HIPAA.md](clinic/HIPAA.md)
- report something that doesn't match how the real systems or standards work
- propose a new app or a new service for an existing app (open an issue first so we can agree on
  scope)

## Picking an issue

We don't assign issues. To claim one, open a draft pull request that links it. That holds the issue
for a week, and each new commit extends the hold by a week. If nobody holds an issue, we merge the
first pull request that passes review and meets the issue's "done when" list.

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

## Compliance and vendors

- Describe what the code does. Don't claim an app is compliant with anything, since no software is
  compliant on its own.
- If your change affects a safeguard, update the app's compliance page, such as `clinic/HIPAA.md`, in
  the same pull request.
- The apps don't depend on or favor any vendor's product. Connect a product through the app's plug-in
  point instead of changing the app to fit it. Pull requests that tie an app to one vendor won't be
  merged.

## Adding an app

Each app is a folder at the root of the repo with its own README, ARCHITECTURE.md, DECISIONS.md,
`compose.yaml`, tests and CI workflow in `.github/workflows/`, plus a page for each rule its
industry is held to, like the clinic's HIPAA.md. Open an issue to discuss a new app before you start.

## Code of conduct

Everyone who takes part follows our [code of conduct](CODE_OF_CONDUCT.md).

## Reporting a security problem

See [SECURITY.md](SECURITY.md).
