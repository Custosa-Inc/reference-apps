# HIPAA

The clinic is a place to see what HIPAA's technical safeguards look like in working code, and to test
products against an app that holds health records. This page lists each safeguard, what the clinic
does about it today and what's missing. Every gap is open work.

**What this page isn't.** Running the clinic doesn't make anyone HIPAA compliant. HIPAA applies to
organizations, such as clinics, insurers and the companies that handle health data for them, and most
of it covers how they work: risk analysis, policies, training and business associate agreements. No
software is compliant on its own, and there is no official HIPAA certification. This page isn't legal
advice. All data in the clinic is synthetic, so none of it is protected health information.

## Technical safeguards

These are the safeguards in [45 CFR 164.312](https://www.law.cornell.edu/cfr/text/45/164.312), the
part of the Security Rule that applies most directly to code. "Required" and "addressable" are the
rule's own labels. Addressable doesn't mean optional: an organization has to put the safeguard in
place where reasonable, or record why not and what it does instead.

| Safeguard | In the clinic today | Status |
| --- | --- | --- |
| **Access control**, (a)(1). Only people and software given access can reach health data. | No sign-in. Every screen acts as one demo user and the FHIR API is open. The ports listen on this computer only. | Not yet |
| **Unique user identification**, (a)(2)(i), required | Every read and change takes an actor, and the audit log records it ([`context.ts`](services/core/src/context.ts)). But each entry point has a single shared user: `demo-front-desk` for the screens and `fhir-api-client` for the API. | Not yet |
| **Emergency access procedure**, (a)(2)(ii), required | Nothing yet. It matters once users have different access. | Not yet |
| **Automatic logoff**, (a)(2)(iii), addressable | There are no sign-in sessions to end. | Not yet |
| **Encryption and decryption**, (a)(2)(iv), addressable | Data is stored unencrypted in Postgres. | Not yet |
| **Audit controls**, (b) | Every read and change of a patient or appointment, from the screens or the FHIR API, writes an audit event in the same database transaction, so one is never saved without the other. Each event records who, what, which patient, from where and when ([`audit/`](services/core/src/audit)). There's no screen to review them yet, but you can [see them with one command](README.md#see-the-audit-log). | Partly |
| **Integrity**, (c)(1) | The database rejects bad data: coded fields only take listed values, records must point at real patients and practitioners, and a practitioner can't be double booked even when two bookings race ([`0001_no_double_booking.sql`](services/core/drizzle/0001_no_double_booking.sql)). But anyone with database access can edit or delete audit events. | Partly |
| **Mechanism to authenticate electronic protected health information**, (c)(2), addressable | Nothing detects a change made straight in the database. | Not yet |
| **Person or entity authentication**, (d) | Nobody signs in, neither staff nor apps calling the FHIR API. | Not yet |
| **Transmission security**, (e)(1), with integrity controls (e)(2)(i) and encryption (e)(2)(ii), both addressable | Plain HTTP between the services and to the browser. | Not yet |

## Other parts of HIPAA that reach the code

The Privacy Rule mostly governs how an organization uses and shares health data, but a few parts need
support in the software.

| Rule | What the software needs | Status |
| --- | --- | --- |
| **Minimum necessary**, [164.502(b)](https://www.law.cornell.edu/cfr/text/45/164.502) and [164.514(d)](https://www.law.cornell.edu/cfr/text/45/164.514) | Show each role only the data its job needs. Today everyone sees everything. | Not yet |
| **Right of access**, [164.524](https://www.law.cornell.edu/cfr/text/45/164.524) | Give a patient a copy of their records. | Not yet |
| **Accounting of disclosures**, [164.528](https://www.law.cornell.edu/cfr/text/45/164.528) | List what was shared outside the clinic, and with whom. The audit log shows which reads came through the FHIR API, but not which app made them. | Not yet |
| **De-identification**, [164.514(b)](https://www.law.cornell.edu/cfr/text/45/164.514) | Export data with identifiers removed, for example the 18 that the Safe Harbor method lists. | Not yet |

## The rule may change

In January 2025, HHS proposed a large update to the Security Rule. Among other changes, it would make
encryption and multi-factor sign-in required in almost all cases. As of November 2026 it isn't final.
This page follows the rule in force today and will change if a final rule is published.

## Test your product against it

Compliance, security and privacy tools are welcome to test against the clinic. Nothing in it depends
on or favors any vendor's product. Plug yours in through
[`compose.override.yaml`](README.md#plug-in-your-own-service). If your tool finds a gap this page
doesn't list, open an issue.

## Close a gap

Every row that isn't done has an open issue with the
[`hipaa` label](https://github.com/Custosa-Inc/reference-apps/issues?q=is%3Aissue+is%3Aopen+label%3Ahipaa).
When your pull request changes a row, update this page in the same pull request. Describe what the
code does, and don't claim it makes the clinic compliant.
