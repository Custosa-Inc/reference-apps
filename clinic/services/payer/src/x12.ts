// A small reader and writer for X12 interchanges, enough for 270 eligibility requests and
// 271 responses (implementation guide 005010X279A1).
//
// This is simplified. It has not been checked against the official X12 guide, which is a paid
// license. Corrections from people who work with these files are welcome.

/** Splits an X12 interchange into segments and elements, using the separators its ISA declares. */
export function parseX12(text: string): string[][] {
  const raw = text.replace(/^\s+/, "");
  if (!raw.startsWith("ISA") || raw.length < 106) {
    throw new Error("Expected an X12 interchange that starts with an ISA segment");
  }
  // ISA is fixed width: the element separator is its 4th character and the segment terminator its
  // 106th.
  const elementSeparator = raw[3];
  const segmentTerminator = raw[105];
  return raw
    .split(segmentTerminator)
    .map((segment) => segment.replace(/^[\r\n]+/, ""))
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.split(elementSeparator));
}

export function findSegment(
  segments: string[][],
  id: string,
  test: (segment: string[]) => boolean = () => true,
): string[] | undefined {
  return segments.find((segment) => segment[0] === id && test(segment));
}

const pad = (value: string, length: number) => value.slice(0, length).padEnd(length, " ");

/**
 * Writes one transaction set (ST to SE) inside its envelope: ISA and GS before, GE and IEA after.
 * `date` is CCYYMMDD and `time` is HHMM. The ISA is fixed width, so IDs are padded to 15 characters.
 */
export function writeX12(
  envelope: {
    sender: string;
    receiver: string;
    controlNumber: number;
    functionalId: string;
    version: string;
    date: string;
    time: string;
  },
  transaction: string[][],
): string {
  const { sender, receiver, functionalId, version, date, time } = envelope;
  const control = String(envelope.controlNumber);
  const segments = [
    [
      "ISA",
      "00",
      pad("", 10),
      "00",
      pad("", 10),
      "ZZ",
      pad(sender, 15),
      "ZZ",
      pad(receiver, 15),
      date.slice(2),
      time,
      "^",
      "00501",
      control.padStart(9, "0"),
      "0",
      "T",
      ":",
    ],
    ["GS", functionalId, sender, receiver, date, time, control, "X", version],
    ...transaction,
    ["GE", "1", control],
    ["IEA", "1", control.padStart(9, "0")],
  ];
  return segments.map((segment) => segment.join("*") + "~").join("");
}
