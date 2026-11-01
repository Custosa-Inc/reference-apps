# Reference Apps

Runnable mock apps for regulated industries, built in the open. Each app is shaped like the systems
the industry really runs on and speaks the standards those systems use. All data is synthetic.

Use them to:

- test a product against something shaped like the real thing, without a vendor license or a sandbox
  account
- learn the standards an industry runs on by reading and running working code
- build on: every app is Apache-2.0, and each one has a place to plug your own service in

Each app lives in its own folder with its own README, setup and tests, and runs on its own.

## Before you start

- [Docker](https://docs.docker.com/get-docker/) with Compose, to run a whole app with one command
- [Node.js 22](https://nodejs.org/) or later, to work on a single service

## Healthcare

| App | What it shows | Status |
| --- | --- | --- |
| [clinic](clinic) | An outpatient clinic's front desk: patient search, appointment booking, an audit log of who saw which patient, a FHIR R4 API and a mock insurer that answers X12 eligibility checks | Early |

## Contributing

Pick an issue, fix something that doesn't match how the real systems work, or propose a new app. Read
[CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[Apache-2.0](LICENSE).
