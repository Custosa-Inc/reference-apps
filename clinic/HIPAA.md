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
| **Emergency access procedure**, (a)(2)(ii), required | Nothing yet. The rule covers getting needed health data during any emergency, including an outage of the app itself. | Not yet |
| **Automatic logoff**, (a)(2)(iii), addressable | There are no sign-in sessions to end. | Not yet |
| **Encryption and decryption**, (a)(2)(iv), addressable | Data is stored unencrypted in Postgres. | Not yet |
| **Audit controls**, (b) | Every read and change of a patient or appointment, from the screens or the FHIR API, writes an audit event in the same database transaction, so one is never saved without the other ([a test checks this](services/core/test/patients.test.ts)). Each event records the user, the action, the record, the patient, the entry point (screen or API) and the time ([`audit/`](services/core/src/audit)). Not recorded yet: lookups that find nothing, and what was searched for. Patient search also puts names in the page address, where they can end up in browser history and server logs. There's no screen to review events yet, but you can [see them with one command](README.md#see-the-audit-log). | Partly |
| **Integrity**, (c)(1) | Nothing protects data from improper change or deletion yet: records don't keep their history, anyone with database access can edit or delete audit events, and nothing is backed up. The database does reject invalid data, such as unknown codes, records that point at missing patients and double bookings ([`0001_no_double_booking.sql`](services/core/drizzle/0001_no_double_booking.sql)), but that's data quality, not this safeguard. | Not yet |
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
| **Accounting of disclosures**, [164.528](https://www.law.cornell.edu/cfr/text/45/164.528) | On request, list a patient's disclosures from the past six years: the date, who received the data, what was shared and why. Disclosures for treatment, payment and health care operations are exempt, which covers most scheduling and billing apps. The audit log has no recipient, description or purpose fields, and every API caller shares one identity. | Not yet |
| **De-identification**, [164.514(b)](https://www.law.cornell.edu/cfr/text/45/164.514) | Export de-identified data. Under the Safe Harbor method that means removing all 18 listed identifiers and having no actual knowledge that what's left could identify someone. | Not yet |
| **Confidential communications**, [164.522(b)](https://www.law.cornell.edu/cfr/text/45/164.522) | Let a patient ask to be contacted by other means or at another address, and honor reasonable requests in every call, text and letter. | Not yet |
| **Amendment**, [164.526](https://www.law.cornell.edu/cfr/text/45/164.526) | Let a patient ask to correct their record, and track the request, the decision and any statement of disagreement. | Not yet |

## The rule may change

In January 2025, HHS proposed a large update to the Security Rule
([90 FR 898](https://www.federalregister.gov/d/2024-30983)). Among other changes, it would make
encryption and multi-factor sign-in required in almost all cases. It isn't final: HHS's regulatory
agenda lists it as a long-term action with a July 2027 target. This page follows the rule in force
today and will change if a final rule is published. Last checked November 1, 2026.

## Test your product against it

Compliance, security and privacy tools are welcome to test against the clinic. The project doesn't
review or endorse any tool, so results you publish are your own. Plug yours in through
[`compose.override.yaml`](README.md#plug-in-your-own-service). If your tool finds a gap this page
doesn't list, open an issue.

## Close a gap

Every row that isn't done has an open issue with the
[`hipaa` label](https://github.com/Custosa-Inc/reference-apps/issues?q=is%3Aissue+is%3Aopen+label%3Ahipaa).
When your pull request changes a row, update this page in the same pull request. Describe what the
code does, and don't claim it makes the clinic compliant.
