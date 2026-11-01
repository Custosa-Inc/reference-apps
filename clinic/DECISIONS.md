# Decisions

Choices that shape the clinic app, newest last. To change one, explain why in a thread in
[Ideas](https://github.com/Custosa-Inc/reference-apps/discussions/categories/ideas). If it's
accepted, add a new entry rather than editing the old one.

## 1. Written from scratch (2026-11-01)

We didn't fork an existing health app. OpenEMR is GPL-3.0, so its code can't go into an Apache-2.0
repo. The Apache-licensed options depend on hosted services or are much larger than a reference app
needs. We borrow ideas and small solved pieces, and credit them.

## 2. Separate services only where real healthcare splits (2026-11-01)

Epic, Oracle Health, athenahealth and the dental systems each run on one database. Separate systems
appear where another organization or vendor starts: insurers, clearinghouses, labs, pharmacies,
phone and fax. We split the same way. `core` is one app with strict modules, and each outside system
is its own service that speaks its real standard. Splitting `core` itself would scatter one patient
record across services and make the app harder to run.

## 3. Relational tables shaped like FHIR (2026-11-01)

Real practice systems keep data in relational tables and offer FHIR at the edge. We do the same, and
borrow FHIR's field names and codes wherever FHIR has a match. We don't store FHIR JSON documents.

## 4. TypeScript, Next.js, Postgres and Drizzle (2026-11-01)

The stack is widely known, has one language from screen to database, and runs on any laptop. Each
service may pick its own stack if the system it stands in for calls for one, for example Python for a
phone service.

## 5. Our own synthetic seed data (2026-11-01)

A small seed generator in `src/db/seed.ts` keeps setup to one step and makes every record obviously
fake. Importing Synthea patients is planned as an addition.

## 6. PGlite for tests and for running without Docker (2026-11-01)

PGlite is Postgres compiled to run inside Node. Tests use it, so `npm test` needs no database server.
The app falls back to it when `DATABASE_URL` is not set.

## 7. Prettier from the first commit (2026-11-01)

Turning on a formatter later would reformat every file and clash with every open pull request.

## 8. No sign-in yet (2026-11-01)

The app uses a fixed demo user, and the FHIR API is open. Both are fine for synthetic data and are
listed as open work.

## 9. Built around HIPAA (2026-11-01)

Buyers of health software ask vendors how they protect health data under HIPAA, and developers rarely
get to see HIPAA's safeguards in working code. So the clinic tracks those safeguards in
[HIPAA.md](HIPAA.md) and builds toward them in the open. Outside products, compliance tools included,
connect through the plug-in point rather than being built into the app.
