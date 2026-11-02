# Reference Apps

[![clinic](https://github.com/Custosa-Inc/reference-apps/actions/workflows/clinic.yml/badge.svg)](https://github.com/Custosa-Inc/reference-apps/actions/workflows/clinic.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Mock apps for regulated industries that anyone can run, build on and improve, starting with an
outpatient clinic. All data is synthetic.

[Try it](#try-it) · [HIPAA.md](clinic/HIPAA.md) ·
[Good first issues](https://github.com/Custosa-Inc/reference-apps/contribute) ·
[Discussions](https://github.com/Custosa-Inc/reference-apps/discussions)

![What docker compose up starts: the clinic practice system with front desk screens, a FHIR R4 API at /fhir and an audit log of every read and change; Postgres with 60 synthetic patients, 4 practitioners and two weeks of visits; and a mock insurer that answers X12 270/271 eligibility checks. Your product connects over FHIR R4 and X12.](clinic/diagram.png)

![The clinic's front desk schedule](clinic/front-desk.png)

| You want to | Start here |
| --- | --- |
| Test an agent or app against a clinic's FHIR API | [FHIR API](clinic/README.md#fhir-api) |
| Test a security or compliance tool against patient records | [HIPAA.md](clinic/HIPAA.md) |
| Learn FHIR R4 and X12 by running them | [Try it](#try-it) |
| Help build it | [Good first issues](https://github.com/Custosa-Inc/reference-apps/contribute) |

Each app is shaped like the systems the industry really runs on, speaks the standards those systems
use, and shows the rules the industry is held to, such as HIPAA, in working code.

The apps show what rules ask of code. Running them doesn't make anyone compliant, and nothing here is
legal advice.

Each app lives in its own folder with its own README, setup and tests, and runs on its own.

## Try it

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
git clone https://github.com/Custosa-Inc/reference-apps.git
cd reference-apps/clinic
docker compose up --build
```

Then open http://localhost:3000.

To work on a single service without Docker, you need [Node.js 22](https://nodejs.org/) or later. Each
app's README explains how.

## Healthcare

| App | What it shows | Rules | Status |
| --- | --- | --- | --- |
| [clinic](clinic) | An outpatient clinic's front desk: patient search, appointment booking, an audit log of who saw which patient, a FHIR R4 API that can book, cancel and move appointments, and a mock insurer that answers X12 eligibility checks | [HIPAA](clinic/HIPAA.md) | Early |

## Contributing

Pick an issue, close a gap in an app's compliance page, fix something that doesn't match how the real
systems work, or propose a new app. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and ask
questions in [Discussions](https://github.com/Custosa-Inc/reference-apps/discussions).

## Who maintains this

Reference Apps is maintained by [Custosa](https://custosa.com), which builds a permission and
compliance layer for enterprise AI. The apps don't need Custosa's product or any other vendor's to
run. We merge pull requests that close a gap by any approach.

## License

[Apache-2.0](LICENSE).
