import { describe, expect, it } from "vitest";
import {
  APTS_FORMAT,
  FVR_COMPANY_NAME,
  FVR_COMPANY_STRAPLINE,
  FVR_DOCUMENT_TITLE,
  FVR_PARTICULARS,
  FVR_SHEET_HEADERS,
  PAYMENT_FORMAT,
  TRANSFER_FORMAT,
  sheetAmount,
  sheetDate,
  sheetDateShort,
  sheetDateTime,
  sheetTime,
  sheetTitleBand,
  sheetWeekday,
} from "./formats";
import { buildFvrCsv, buildSheetCsv } from "./export";
import type { FvrRow, SheetRow } from "./types";

/**
 * THE SCREENSHOT-FIDELITY GATE. Task MM-1, D-095.
 *
 * The four manager sheets are acceptance criteria, not decoration. Every
 * expectation below is TRANSCRIBED INDEPENDENTLY from the supplied screenshots
 * rather than imported from `formats.ts` — importing the thing under test and
 * comparing it to itself would pass whatever the file happened to say.
 *
 * So if someone "tidies" a heading, this fails. That is the point: management
 * reads these words, and `SI.NO` is not `Sl No`.
 */

/* ── Transcribed from the screenshots. Do not edit to match the code. ─────── */

/** Image 2/4 — WPS "Book1", columns A–M. ALL CAPS except column J. */
const TRANSFER_HEADINGS_FROM_SCREENSHOT = [
  "SI.NO",
  "DATE",
  "CUSTOMER NAME",
  "MOBILE NUMBER",
  "REGION NAME",
  "AREA NAME",
  "BRANCH",
  "BT LEAD ID",
  "MANAGER NAME",
  "Loan Disbursed YES/NO",
  "TRANSFER AMOUNT",
  "UTR NUMBER",
  "REMARK",
];

/** Image 3 — the APTS sheet. Note `Fund Credited Customer`, with no "to". */
const APTS_HEADINGS_FROM_SCREENSHOT = [
  "Sl No",
  "Date",
  "Customer Name",
  "Transfer Amount",
  "Branch Name",
  "Fund Credited Customer",
];

/** Image 5 — the Payment sheet. `Branch Name` precedes `Transfer Amount` here,
 *  the reverse of APTS, and the serial column is spelled `SI.NO`. */
const PAYMENT_HEADINGS_FROM_SCREENSHOT = [
  "SI.NO",
  "Date",
  "Customer Name",
  "Branch Name",
  "Transfer Amount",
  "Fund Credited to Customer",
  "Payment Status",
];

/** Image 1 — the FVR checklist, in the order the form lists its particulars. */
const FVR_PARTICULARS_FROM_SCREENSHOT = [
  "Customer Name",
  "Loan Amount",
  "Takeover From (Existing Lender Name)",
  "FVR Done By (Name & Designation)",
  "Customer Profile (Occupation / Business / Employment)",
  "House Confirmation (Owned / Rented)",
  "Annual Income",
  "Any Existing Relationship with Chola (Yes / No)",
  "New KYC /Customer (Yes / No)",
  "Remarks (if Any)",
  "Zensify RM Signature",
  "Sharvika RM Signature",
  "Chola RM/BM/ARBM Sign",
];

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const row = (overrides: Partial<SheetRow> = {}): SheetRow => ({
  id: "d1",
  code: "DSB-5001",
  date: "2026-07-01T06:30:00.000Z",
  loanId: "l1",
  customerId: "c1",
  customerName: "Yata mahesh",
  customerMobile: "9848000000",
  regionName: "Telangana",
  areaName: "HYDERABAD",
  branchName: "OMKAR NAGAR",
  btLeadId: "BTOMKA250626053704",
  managerName: "Ravichandar",
  loanStatus: "Disbursed",
  transferAmount: "300000.00",
  utr: "UTR0001",
  remark: null,
  disbursementStatus: "Credited",
  fundCreditedAt: "2026-08-01T05:20:00.000Z",
  paymentStatus: "Not Received",
  ...overrides,
});

const fvr = (overrides: Partial<FvrRow> = {}): FvrRow => ({
  id: "v1",
  loanId: "l1",
  customerId: "c1",
  bankId: "b1",
  loanCode: "LN-1001",
  customerName: "Yata mahesh",
  customerMobile: "9848000000",
  loanAmount: "300000.00",
  customerProfile: "Business",
  verificationStatus: "Verified",
  providerName: null,
  fvrDate: "2026-07-01T06:30:00.000Z",
  takeoverFromLender: null,
  fvrDoneByName: null,
  fvrDoneByDesignation: null,
  houseConfirmation: null,
  annualIncome: null,
  cholaRelationship: null,
  cholaOutstandingDetails: null,
  newKycCustomer: null,
  remarks: null,
  zensifyRmSignature: null,
  sharvikaRmSignature: null,
  cholaSign: null,
  ...overrides,
});

/**
 * A real CSV field splitter.
 *
 * `split(",")` is wrong here and the reason is the subject of half this file:
 * `3,00,000.00` is ONE field containing commas, quoted by the exporter. Naively
 * splitting turns it into three, which is exactly the corruption a manager
 * would see if a spreadsheet opened the file with the wrong delimiter.
 */
function fields(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

const headersOf = (csv: string) => fields(csv.split("\n")[0]!);

/* ══ A — the headings are the manager's, exactly ═══════════════════════════ */

describe("A · heading text and heading order match the screenshots", () => {
  it("1. Transfer — thirteen columns, in order", () => {
    expect(TRANSFER_FORMAT.columns.map((c) => c.header)).toEqual(
      TRANSFER_HEADINGS_FROM_SCREENSHOT,
    );
  });

  it("2. APTS — six columns, in order", () => {
    expect(APTS_FORMAT.columns.map((c) => c.header)).toEqual(APTS_HEADINGS_FROM_SCREENSHOT);
  });

  it("3. Payment — seven columns, in order", () => {
    expect(PAYMENT_FORMAT.columns.map((c) => c.header)).toEqual(PAYMENT_HEADINGS_FROM_SCREENSHOT);
  });

  it("4. FVR — thirteen particulars, in order", () => {
    expect(FVR_PARTICULARS.map((p) => p.label)).toEqual(FVR_PARTICULARS_FROM_SCREENSHOT);
  });

  it("5. the FVR table is Sl No / Particulars / Details", () => {
    expect([...FVR_SHEET_HEADERS]).toEqual(["Sl No", "Particulars", "Details"]);
  });

  it("6. the FVR letterhead is reproduced verbatim, typo and all", () => {
    expect(FVR_COMPANY_NAME).toBe("Sharvika Financial Services Pvt Ltd");
    // The firm's own strapline. Not ours to correct.
    expect(FVR_COMPANY_STRAPLINE).toBe("We Belive You Belive");
    expect(FVR_DOCUMENT_TITLE).toBe("FIELD VERIFICATION REPORT (FVR) CHECKLIST");
  });

  it("7. the per-sheet spelling differences are preserved, not normalised", () => {
    // The single most likely "helpful" regression: making these agree.
    expect(TRANSFER_FORMAT.columns[0]!.header).toBe("SI.NO");
    expect(PAYMENT_FORMAT.columns[0]!.header).toBe("SI.NO");
    expect(APTS_FORMAT.columns[0]!.header).toBe("Sl No");

    expect(APTS_FORMAT.columns[5]!.header).toBe("Fund Credited Customer");
    expect(PAYMENT_FORMAT.columns[5]!.header).toBe("Fund Credited to Customer");
  });

  it("8. APTS and Payment order Transfer Amount and Branch Name differently", () => {
    const apts = APTS_FORMAT.columns.map((c) => c.header);
    const payment = PAYMENT_FORMAT.columns.map((c) => c.header);
    expect(apts.indexOf("Transfer Amount")).toBeLessThan(apts.indexOf("Branch Name"));
    expect(payment.indexOf("Branch Name")).toBeLessThan(payment.indexOf("Transfer Amount"));
  });

  it("9. no technical column was slipped in between the manager's columns", () => {
    // Instruction §19: the main table is the manager's table and nothing else.
    for (const format of [TRANSFER_FORMAT, APTS_FORMAT, PAYMENT_FORMAT]) {
      const headers = format.columns.map((c) => c.header);
      for (const banned of ["id", "Id", "ID", "Actions", "Status", "Code", "Bank"]) {
        expect(headers, `${format.slug} must not carry a ${banned} column`).not.toContain(banned);
      }
    }
  });
});

/* ══ B — the export is the screen ══════════════════════════════════════════ */

describe("B · screen and export share one definition", () => {
  it("10. every export's header line IS the format's column headers", () => {
    for (const format of [TRANSFER_FORMAT, APTS_FORMAT, PAYMENT_FORMAT]) {
      const csv = buildSheetCsv(format, [row()] as never[]);
      expect(headersOf(csv)).toEqual(format.columns.map((c) => c.header));
    }
  });

  it("11. every exported cell IS the value the screen renders", () => {
    const sample = row();
    for (const format of [TRANSFER_FORMAT, APTS_FORMAT, PAYMENT_FORMAT]) {
      const csv = buildSheetCsv(format, [sample] as never[]);
      const cells = fields(csv.split("\n")[1]!);
      format.columns.forEach((column, index) => {
        // `column.value` is what the table cell renders, so equality here is
        // the guarantee that the two can never drift.
        const expected = (column.value as (r: SheetRow, i: number) => string)(sample, 0);
        expect(cells[index]).toBe(expected);
      });
    }
  });

  it("12. an empty sheet still exports its headings, not a zero-byte file", () => {
    const csv = buildSheetCsv(APTS_FORMAT, []);
    expect(csv).toBe(APTS_HEADINGS_FROM_SCREENSHOT.join(","));
  });

  it("13. the FVR exports vertically — one row per particular", () => {
    const csv = buildFvrCsv(fvr());
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Sl No,Particulars,Details");
    // Thirteen particulars plus the header line.
    expect(lines).toHaveLength(FVR_PARTICULARS_FROM_SCREENSHOT.length + 1);
  });

  it("14. the FVR serial numbers run 1..13 — the source document's `11,11,12` typo is not reproduced", () => {
    const csv = buildFvrCsv(fvr());
    const serials = csv
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[0]);
    expect(serials).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1)));
  });

  it("15. the FVR carries the form's own sub-line with its particular", () => {
    const csv = buildFvrCsv(fvr());
    expect(csv).toContain("If yes, specify details outstanding loan amount");
  });
});

/* ══ C — the totals band ═══════════════════════════════════════════════════ */

describe("C · the totals row", () => {
  it("16. APTS and Payment total; Transfer does not", () => {
    expect(APTS_FORMAT.hasTotals).toBe(true);
    expect(PAYMENT_FORMAT.hasTotals).toBe(true);
    expect(TRANSFER_FORMAT.hasTotals).toBe(false);
  });

  it("17. it totals Transfer Amount and leaves every other cell blank", () => {
    const csv = buildSheetCsv(APTS_FORMAT, [
      row({ id: "a", transferAmount: "1350000" }),
      row({ id: "b", transferAmount: "1100000" }),
    ] as never[]);
    const last = fields(csv.split("\n").at(-1)!);
    const amountIndex = APTS_FORMAT.columns.findIndex((c) => c.header === "Transfer Amount");

    expect(last[amountIndex]).toBe("24,50,000.00");
    last.forEach((cell, index) => {
      if (index !== amountIndex) expect(cell).toBe("");
    });
  });

  it("18. a sheet with no amounts reports no total rather than 0.00", () => {
    const csv = buildSheetCsv(APTS_FORMAT, [row({ transferAmount: null })] as never[]);
    // Header + the one data row, and NO totals band: there is nothing to total,
    // and `0.00` would assert that the rows add up to nothing.
    expect(csv.split("\n")).toHaveLength(2);
    const amountIndex = APTS_FORMAT.columns.findIndex((c) => c.header === "Transfer Amount");
    expect(fields(csv.split("\n")[1]!)[amountIndex]).toBe("");
  });

  it("19. an empty sheet gets no totals band either — headings only", () => {
    expect(buildSheetCsv(PAYMENT_FORMAT, []).split("\n")).toHaveLength(1);
  });
});

/* ══ D — formatting matches the sheets ═════════════════════════════════════ */

describe("D · the values are formatted the way the sheets write them", () => {
  it("19. amounts use Indian grouping with two decimals and no symbol", () => {
    expect(sheetAmount("300000")).toBe("3,00,000.00");
    expect(sheetAmount("53014500")).toBe("5,30,14,500.00");
    expect(sheetAmount("163000")).toBe("1,63,000.00");
  });

  it("20. dates use each sheet's own format", () => {
    const at = "2026-07-01T06:30:00.000Z";
    expect(sheetDate(at)).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(sheetDateShort(at)).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{2}$/);
    expect(sheetTime(at)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    expect(sheetDateTime(at)).toMatch(/^\d{2}-\d{2}-\d{4} \(\d{1,2}:\d{2} (AM|PM)\)$/);
  });

  it("21. every formatter returns blank for an absent value — never 0 or a dash", () => {
    for (const formatter of [sheetDate, sheetDateShort, sheetTime, sheetDateTime]) {
      expect(formatter(null)).toBe("");
      expect(formatter(undefined)).toBe("");
    }
    expect(sheetAmount(null)).toBe("");
    expect(sheetAmount(undefined)).toBe("");
    // A zero we do not have must not be printed as one.
    expect(sheetAmount("")).toBe("");
  });

  it("22. a malformed timestamp formats blank rather than `Invalid Date`", () => {
    expect(sheetDate("not-a-date")).toBe("");
    expect(sheetDateTime("not-a-date")).toBe("");
  });
});

/* ══ E — nothing is fabricated ═════════════════════════════════════════════ */

describe("E · absent data stays absent", () => {
  it("23. an unplaced file reports blank Region, Area, Branch, BT lead and manager", () => {
    const blank = row({
      regionName: null,
      areaName: null,
      branchName: null,
      btLeadId: null,
      managerName: null,
    });
    const byHeader = Object.fromEntries(
      TRANSFER_FORMAT.columns.map((c) => [c.header, c.value(blank, 0)]),
    );
    expect(byHeader["REGION NAME"]).toBe("");
    expect(byHeader["AREA NAME"]).toBe("");
    expect(byHeader["BRANCH"]).toBe("");
    expect(byHeader["BT LEAD ID"]).toBe("");
    expect(byHeader["MANAGER NAME"]).toBe("");
  });

  it("24. `Loan Disbursed YES/NO` is derived from the loan status", () => {
    const column = TRANSFER_FORMAT.columns.find((c) => c.header === "Loan Disbursed YES/NO")!;
    expect(column.value(row({ loanStatus: "Disbursed" }), 0)).toBe("YES");
    expect(column.value(row({ loanStatus: "Approved" }), 0)).toBe("NO");
    // Unknown is neither. `NO` is an assertion and we do not have one to make.
    expect(column.value(row({ loanStatus: null }), 0)).toBe("");
  });

  it("25. `Payment Status` is blank until a manager records it — never defaulted", () => {
    const column = PAYMENT_FORMAT.columns.find((c) => c.header === "Payment Status")!;
    expect(column.value(row({ paymentStatus: null }), 0)).toBe("");
    expect(column.value(row({ paymentStatus: "Not Received" }), 0)).toBe("Not Received");
  });

  it("26. `Fund Credited` is blank when the server reports no credit", () => {
    for (const [format, index] of [
      [APTS_FORMAT, 5],
      [PAYMENT_FORMAT, 5],
    ] as const) {
      const column = format.columns[index]!;
      expect(column.value(row({ fundCreditedAt: null }), 0)).toBe("");
    }
  });

  it("27. every FVR particular is blank on a fresh checklist", () => {
    const fresh = fvr();
    const blanks = FVR_PARTICULARS.filter((p) => p.value(fresh) === "").map((p) => p.key);
    // Customer name, loan amount and customer profile come from the CRM and are
    // populated; the eleven recorded findings are not.
    expect(blanks).toContain("takeoverFromLender");
    expect(blanks).toContain("houseConfirmation");
    expect(blanks).toContain("annualIncome");
    expect(blanks).toContain("zensifyRmSignature");
    expect(blanks).toContain("sharvikaRmSignature");
    expect(blanks).toContain("cholaSign");
  });

  it("28. the three signature lines are plain text and are marked as signatures", () => {
    const signatures = FVR_PARTICULARS.filter((p) => p.signature).map((p) => p.label);
    expect(signatures).toEqual([
      "Zensify RM Signature",
      "Sharvika RM Signature",
      "Chola RM/BM/ARBM Sign",
    ]);
    // A populated line renders the typed name and nothing that reads as an
    // executed signature — no "Signed", no tick, no boolean.
    const signed = fvr({ zensifyRmSignature: "A. Kumar" });
    const line = FVR_PARTICULARS.find((p) => p.key === "zensifyRmSignature")!;
    expect(line.value(signed)).toBe("A. Kumar");
    expect(line.value(signed)).not.toMatch(/signed|✓|true/i);
  });
});

/* ══ F — the Payment sheet's title band ════════════════════════════════════ */

describe("F · the title band reproduces the Payment sheet's heading line", () => {
  it("29b. it matches the screenshot's shape, irregular spacing included", () => {
    // Image 5 heads its sheet: `29-08-2026 (Saturday) / APTS /HYDERABAD ( RAMUDU )`
    const band = sheetTitleBand({
      date: "2026-08-29T06:00:00.000Z",
      sheet: "APTS",
      area: "HYDERABAD",
      manager: "RAMUDU",
    });
    expect(band).toMatch(/^\d{2}-\d{2}-\d{4} \([A-Za-z]+\) \/ APTS \/HYDERABAD \( RAMUDU \)$/);
  });

  it("30b. each segment appears ONLY when that filter is set", () => {
    // A band naming an area nobody chose would be a caption asserting something
    // untrue, so absent filters produce absent segments.
    expect(sheetTitleBand({ sheet: "Payment" })).toBe("Payment");
    expect(sheetTitleBand({ sheet: "Payment", area: "HYDERABAD" })).toBe("Payment /HYDERABAD");
    expect(sheetTitleBand({ sheet: "Payment", manager: "RAMUDU" })).toBe("Payment ( RAMUDU )");
  });

  it("31b. a weekday is rendered for a real date and blank for nothing", () => {
    expect(sheetWeekday("2026-08-29T06:00:00.000Z")).toMatch(/^[A-Za-z]+$/);
    expect(sheetWeekday(null)).toBe("");
  });
});
