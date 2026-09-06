/**
 * Static demo dataset.
 *
 * Entirely fictional records shaped exactly like the API responses in
 * `lib/types`, so every existing page renders them without modification. Money
 * is a string and nullable columns are null, matching Postgres numeric and the
 * real payloads.
 *
 * Built lazily rather than at module scope: the timestamps are relative to the
 * moment the walkthrough starts, so "3 days ago" stays true whenever the demo
 * is shown, and nothing here is evaluated during server rendering.
 */

import type {
  Bank,
  BankOrder,
  Customer,
  Disbursement,
  DocumentRecord,
  Employee,
  Loan,
  NotificationItem,
  ServiceProvider,
  Team,
  Transaction,
  Verification,
} from "@/lib/types";
import { DEMO_BANK_IDS, DEMO_EMAIL, DEMO_USER_ID } from "./config";

export interface DemoDataset {
  banks: Bank[];
  customers: Customer[];
  loans: Loan[];
  /**
   * TASK 5.6. `GET /verifications` used to fall through the demo router's
   * `default` branch: the Executive holds `verification.view`, so the
   * permission gate passed and the request ended in `notFound("Resource")` —
   * a **404 on a list this role is entitled to read**. The loan dialog's
   * verification panel would have reported that as a load failure for every
   * loan in the walkthrough.
   */
  verifications: Verification[];
  /**
   * The provider directory. The demo Executive does **not** hold
   * `service_providers.view`, so this is never served — the handler refuses
   * with the same 403 the API would (`operations.routes.ts:607`). It is
   * fixtured anyway so the refusal comes from the permission check rather than
   * from there being nothing behind it, and so the shape is right if the demo
   * role ever changes.
   */
  serviceProviders: ServiceProvider[];
  bankOrders: BankOrder[];
  disbursements: Disbursement[];
  transactions: Transaction[];
  documents: DocumentRecord[];
  notifications: NotificationItem[];
  employees: Employee[];
  teams: Team[];
  /** Next value for each generated code series, so new records keep counting up. */
  sequence: Record<string, number>;
}

const HDFC = DEMO_BANK_IDS[0];
const ICICI = DEMO_BANK_IDS[1];

const COLLEAGUE_ID = "9f2c1d40-6b31-4c2a-9d55-11a0f4c7b302";
const TEAM_LEAD_ID = "9f2c1d40-6b31-4c2a-9d55-11a0f4c7b303";
const TEAM_ID = "6b8e2a90-77c1-4f0b-8b3d-2e91a4d5c701";

const DAY = 24 * 60 * 60 * 1000;

const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
const days = (count: number) => iso(count * DAY);
const hours = (count: number) => iso(count * 60 * 60 * 1000);
/** Dates in the future — SLA and due dates. */
const inDays = (count: number) => iso(-count * DAY);

/** EMI on a reducing-balance loan, rounded to the rupee like the backend. */
function emi(principal: number, annualRate: number, months: number): string {
  const r = annualRate / 12 / 100;
  const value = (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  return String(Math.round(value));
}

export function buildDemoDataset(): DemoDataset {
  const banks: Bank[] = [
    {
      id: HDFC,
      code: "HDFC",
      name: "HDFC Bank",
      shortName: "HDFC",
      vendorId: "DSA-HDFC-TS-4471",
      portalUrl: "https://partners.hdfcbank.example",
      logoText: "HD",
      accentColor: "#0a4b9c",
      status: "Active",
      commissionRate: "1.35",
      settlementCycle: "Monthly",
      spocName: "Rajesh Menon",
      spocPhone: "+91 98490 22118",
      productsOffered: ["Personal Loan", "Home Loan", "Loan Against Property"],
      onboardedOn: days(612),
      createdAt: days(612),
    },
    {
      id: ICICI,
      code: "ICICI",
      name: "ICICI Bank",
      shortName: "ICICI",
      vendorId: "DSA-ICICI-TS-9026",
      portalUrl: "https://dsa.icicibank.example",
      logoText: "IC",
      accentColor: "#b02a30",
      status: "Active",
      commissionRate: "1.10",
      settlementCycle: "Fortnightly",
      spocName: "Sneha Kulkarni",
      spocPhone: "+91 90000 71453",
      productsOffered: ["Personal Loan", "Business Loan", "Vehicle Loan"],
      onboardedOn: days(438),
      createdAt: days(438),
    },
  ];

  const customers: Customer[] = [
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f101",
      code: "CUS-10012",
      bankId: HDFC,
      bankReferenceId: "HDFC-TS-88214",
      name: "Arvind Reddy Kolla",
      fatherName: "Narasimha Reddy Kolla",
      motherName: "Padmavathi Kolla",
      dob: "1986-04-17",
      gender: "Male",
      maritalStatus: "Married",
      occupation: "Senior Software Engineer",
      monthlyIncome: "148000",
      mobile: "9848012214",
      altMobile: "9100224417",
      email: "arvind.kolla@example.in",
      address: "Flat 704, Aparna Sarovar, Nallagandla",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500019",
      pan: "AKQPK4471M",
      aadhaarLast4: "4412",
      kyc: "Verified",
      cibil: 784,
      accountNo: "50100244178821",
      ifsc: "HDFC0001284",
      branch: "Gachibowli",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Active",
      createdAt: days(41),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f102",
      code: "CUS-10018",
      bankId: HDFC,
      bankReferenceId: "HDFC-TS-88407",
      name: "Sridevi Anumolu",
      fatherName: "Venkat Rao Anumolu",
      motherName: "Lakshmi Anumolu",
      dob: "1991-11-02",
      gender: "Female",
      maritalStatus: "Married",
      occupation: "Pharmacist",
      monthlyIncome: "72000",
      mobile: "9885543310",
      altMobile: null,
      email: "sridevi.anumolu@example.in",
      address: "Plot 22, Kavuri Hills Phase 2",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500033",
      pan: "BQTPA9021L",
      aadhaarLast4: "7739",
      kyc: "Verified",
      cibil: 751,
      accountNo: "50100311902244",
      ifsc: "HDFC0000521",
      branch: "Madhapur",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Active",
      createdAt: days(33),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f103",
      code: "CUS-10024",
      bankId: ICICI,
      bankReferenceId: "ICICI-TS-51196",
      name: "Mohammed Irfan Baig",
      fatherName: "Mohammed Yousuf Baig",
      motherName: "Ayesha Begum",
      dob: "1983-07-28",
      gender: "Male",
      maritalStatus: "Married",
      occupation: "Proprietor — Baig Auto Spares",
      monthlyIncome: "215000",
      mobile: "9391104472",
      altMobile: "8790012245",
      email: "irfan.baig@example.in",
      address: "12-2-417, Mehdipatnam Main Road",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500028",
      pan: "CDLPB1174K",
      aadhaarLast4: "2208",
      kyc: "Verified",
      cibil: 726,
      accountNo: "002401544712",
      ifsc: "ICIC0000024",
      branch: "Mehdipatnam",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Active",
      createdAt: days(27),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f104",
      code: "CUS-10031",
      bankId: ICICI,
      bankReferenceId: "ICICI-TS-51280",
      name: "Priyanka Deshmukh",
      fatherName: "Sanjay Deshmukh",
      motherName: "Vaishali Deshmukh",
      dob: "1994-02-09",
      gender: "Female",
      maritalStatus: "Single",
      occupation: "Assistant Manager — Logistics",
      monthlyIncome: "64000",
      mobile: "7013348825",
      altMobile: null,
      email: "priyanka.deshmukh@example.in",
      address: "Sai Enclave, Beeramguda",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "502032",
      pan: "DKRPD5583J",
      aadhaarLast4: "9014",
      kyc: "Pending",
      cibil: 703,
      accountNo: "002401601187",
      ifsc: "ICIC0000112",
      branch: "Miyapur",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Follow Up",
      createdAt: days(19),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f105",
      code: "CUS-10036",
      bankId: HDFC,
      bankReferenceId: "HDFC-TS-88592",
      name: "Ganesh Prasad Bhatt",
      fatherName: "Shivram Bhatt",
      motherName: "Sarojini Bhatt",
      dob: "1979-09-14",
      gender: "Male",
      maritalStatus: "Married",
      occupation: "Government Employee — TSRTC",
      monthlyIncome: "58000",
      mobile: "9440027716",
      altMobile: null,
      email: null,
      address: "H.No 6-3-249, Bapu Nagar, Uppal",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500039",
      pan: "EPHPB2264N",
      aadhaarLast4: "5527",
      kyc: "Verified",
      cibil: 689,
      accountNo: "50100377214490",
      ifsc: "HDFC0002214",
      branch: "Uppal",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Active",
      createdAt: days(14),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f106",
      code: "CUS-10042",
      bankId: ICICI,
      bankReferenceId: "ICICI-TS-51344",
      name: "Naveen Kumar Sadula",
      fatherName: "Rajaiah Sadula",
      motherName: "Swaroopa Sadula",
      dob: "1990-06-21",
      gender: "Male",
      maritalStatus: "Single",
      occupation: "Fleet Owner",
      monthlyIncome: "96000",
      mobile: "9959771402",
      altMobile: "8106642219",
      email: "naveen.sadula@example.in",
      address: "Road No 5, Vivekananda Nagar, Kukatpally",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500072",
      pan: "FRTPS8890Q",
      aadhaarLast4: "1163",
      kyc: "Pending",
      cibil: 668,
      accountNo: "002401688204",
      ifsc: "ICIC0000045",
      branch: "Kukatpally",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Follow Up",
      createdAt: days(8),
    },
    {
      id: "3a51c8e0-1f42-4a67-9c18-70b2d9e4f107",
      code: "CUS-10047",
      bankId: HDFC,
      bankReferenceId: "HDFC-TS-88701",
      name: "Lavanya Chintalapudi",
      fatherName: "Ramakrishna Chintalapudi",
      motherName: "Bhavani Chintalapudi",
      dob: "1988-12-30",
      gender: "Female",
      maritalStatus: "Married",
      occupation: "Chartered Accountant",
      monthlyIncome: "182000",
      mobile: "9701123380",
      altMobile: null,
      email: "lavanya.c@example.in",
      address: "Villa 18, My Home Ankura, Tellapur",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "502032",
      pan: "GHYPC3312R",
      aadhaarLast4: "8845",
      kyc: "Verified",
      cibil: 812,
      accountNo: "50100422071163",
      ifsc: "HDFC0001284",
      branch: "Gachibowli",
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      status: "Active",
      createdAt: days(4),
    },
  ];

  const loans: Loan[] = [
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a201",
      code: "LN-1042",
      applicationNo: "HDFCPL2400188214",
      customerId: customers[0].id,
      bankId: HDFC,
      loanType: "Home Loan",
      amountRequested: "6500000",
      amountApproved: "6200000",
      interestRate: "8.6",
      tenureMonths: 240,
      emi: emi(6200000, 8.6, 240),
      processingFee: "18500",
      commission: "83700",
      status: "Disbursed",
      appliedOn: days(38),
      verificationRequired: true,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "Normal",
      dueDate: null,
      notes: "Sanction letter signed. Property papers lodged with the branch.",
      createdAt: days(38),
      updatedAt: days(6),
    },
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a202",
      code: "LN-1049",
      applicationNo: "HDFCPL2400188407",
      customerId: customers[1].id,
      bankId: HDFC,
      loanType: "Personal Loan",
      amountRequested: "900000",
      amountApproved: "850000",
      interestRate: "12.4",
      tenureMonths: 60,
      emi: emi(850000, 12.4, 60),
      processingFee: "9500",
      commission: "11475",
      status: "Approved",
      appliedOn: days(30),
      verificationRequired: false,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "High",
      dueDate: inDays(3),
      notes: "Awaiting disbursal instruction from the customer.",
      createdAt: days(30),
      updatedAt: days(2),
    },
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a203",
      code: "LN-1054",
      applicationNo: "ICICBL2400511960",
      customerId: customers[2].id,
      bankId: ICICI,
      loanType: "Business Loan",
      amountRequested: "2500000",
      amountApproved: "2500000",
      interestRate: "14.25",
      tenureMonths: 84,
      emi: emi(2500000, 14.25, 84),
      processingFee: "27500",
      commission: "27500",
      status: "Disbursed",
      appliedOn: days(25),
      verificationRequired: true,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "Normal",
      dueDate: null,
      notes: "GST returns and three-year ITR accepted without query.",
      createdAt: days(25),
      updatedAt: days(9),
    },
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a204",
      code: "LN-1061",
      applicationNo: "ICICPL2400512804",
      customerId: customers[3].id,
      bankId: ICICI,
      loanType: "Personal Loan",
      amountRequested: "600000",
      amountApproved: "0",
      interestRate: "13.9",
      tenureMonths: 48,
      emi: "0",
      processingFee: "0",
      commission: "0",
      status: "Under Review",
      appliedOn: days(16),
      verificationRequired: true,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "Urgent",
      dueDate: inDays(1),
      notes: "Credit has asked for the latest six months of salary credits.",
      createdAt: days(16),
      updatedAt: hours(20),
    },
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a205",
      code: "LN-1068",
      applicationNo: "HDFCLAP2400188592",
      customerId: customers[4].id,
      bankId: HDFC,
      loanType: "Loan Against Property",
      amountRequested: "1800000",
      amountApproved: "0",
      interestRate: "10.75",
      tenureMonths: 120,
      emi: "0",
      processingFee: "0",
      commission: "0",
      status: "Submitted",
      appliedOn: days(11),
      verificationRequired: true,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "Normal",
      dueDate: inDays(5),
      notes: "Legal and valuation reports commissioned by the branch.",
      createdAt: days(11),
      updatedAt: days(3),
    },
    {
      id: "8d40b2f1-a934-4e5c-b7d2-c61e08f9a206",
      code: "LN-1074",
      applicationNo: "ICICVL2400513441",
      customerId: customers[5].id,
      bankId: ICICI,
      loanType: "Vehicle Loan",
      amountRequested: "1450000",
      amountApproved: "0",
      interestRate: "11.5",
      tenureMonths: 72,
      emi: "0",
      processingFee: "0",
      commission: "0",
      status: "Draft",
      appliedOn: days(5),
      verificationRequired: false,
      fundingSourceId: null,
      assignedUserId: DEMO_USER_ID,
      assignedTeamId: TEAM_ID,
      priority: "Low",
      dueDate: inDays(9),
      notes: "Proforma invoice from the dealer still pending.",
      createdAt: days(5),
      updatedAt: days(1),
    },
  ];

  /**
   * TASK 5.6 — the provider directory the demo Executive may not read.
   *
   * These exist so the 403 the demo returns for `/service-providers` is the
   * permission refusal it is on the real API, not an artefact of an empty
   * fixture set. Nothing in the demo walkthrough renders them today.
   */
  const serviceProviders: ServiceProvider[] = [
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b01",
      name: "Sentinel Field Services",
      providerType: "Field Verification",
      contactName: "Ravi Teja",
      contactPhone: "+91 90000 11223",
      contactEmail: "ops@sentinel-demo.example",
      status: "Active",
    },
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b02",
      name: "Meridian Legal & Valuation",
      providerType: "Legal Opinion",
      contactName: "Anjali Prasad",
      contactPhone: "+91 90000 44556",
      contactEmail: "desk@meridian-demo.example",
      status: "Active",
    },
    {
      id: "c48d1e70-9a55-4b21-8e07-2f61d3a09b03",
      name: "Northline Verification (retired)",
      providerType: "Field Verification",
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      // Inactive on purpose: the picker filters on `status === "Active"`
      // client-side, because the route offers no status filter.
      status: "Inactive",
    },
  ];

  /**
   * TASK 5.6 — verification records for four of the six demo loans.
   *
   * Two loans are left **without** one deliberately, so the panel's empty state
   * — "No verification recorded for this loan." — is reachable in the
   * walkthrough and is visibly different from a failed load.
   *
   * Every row here is shaped the way the loan sub-route would have written it
   * (`operations.routes.ts:228-245`), which is the only writer the product has:
   *
   *   - `required: true`  → `handledByBank: false`, `requestedAt` set, and
   *     `completedAt`/`result` populated only once a provider came back;
   *   - `required: false` → `handledByBank: true`, `status: "Verified"`,
   *     `result: "Handled by the requesting bank"`, `completedAt` stamped at
   *     creation and `requestedAt` left null.
   *
   * `serviceProviderId` points at the fixtures above, which the demo Executive
   * cannot resolve to a name — so the panel falls back to `providerReference`.
   * That is the honest outcome for this role and the reason the references
   * below read like real work-order numbers rather than filler.
   */
  const verifications: Verification[] = [
    {
      id: "e91b6d24-7c30-4f58-9a12-0d4e8b3f7a01",
      loanId: loans[0].id,
      customerId: customers[0].id,
      bankId: HDFC,
      required: true,
      handledByBank: false,
      serviceProviderId: serviceProviders[1].id,
      providerReference: "MER-LV-88214",
      status: "Verified",
      result: "Title clear. Valuation report accepted at ₹78,00,000.",
      requestedAt: days(34),
      completedAt: days(27),
      notes: "Legal opinion and valuation filed with the sanction note.",
    },
    {
      id: "e91b6d24-7c30-4f58-9a12-0d4e8b3f7a02",
      loanId: loans[1].id,
      customerId: customers[1].id,
      bankId: HDFC,
      required: false,
      handledByBank: true,
      serviceProviderId: null,
      providerReference: null,
      status: "Verified",
      result: "Handled by the requesting bank",
      requestedAt: null,
      completedAt: days(28),
      notes: "Existing salary account holder; branch verified in person.",
    },
    {
      id: "e91b6d24-7c30-4f58-9a12-0d4e8b3f7a03",
      loanId: loans[2].id,
      customerId: customers[2].id,
      bankId: ICICI,
      required: true,
      handledByBank: false,
      serviceProviderId: serviceProviders[0].id,
      providerReference: "SEN-FV-40917",
      status: "Verified",
      result: "Business premises and stock confirmed at the registered address.",
      requestedAt: days(23),
      completedAt: days(19),
      notes: null,
    },
    {
      id: "e91b6d24-7c30-4f58-9a12-0d4e8b3f7a04",
      loanId: loans[3].id,
      customerId: customers[3].id,
      bankId: ICICI,
      required: true,
      handledByBank: false,
      serviceProviderId: serviceProviders[0].id,
      providerReference: "SEN-FV-41266",
      // Still open, so no result and no completion — the shape the route writes
      // on creation when `required` is true.
      status: "Requested",
      result: null,
      requestedAt: days(14),
      completedAt: null,
      notes: "Residence visit scheduled; office address pending confirmation.",
    },
  ];

  const bankOrders: BankOrder[] = [
    {
      id: "b71f4c05-2e88-4a19-9f63-30d5c7ea6301",
      code: "BO-2417",
      loanId: loans[1].id,
      bankId: HDFC,
      customerId: customers[1].id,
      submittedOn: days(9),
      sla: inDays(2),
      stage: "Disbursal Queue",
      status: "In Progress",
      officer: "Rajesh Menon",
      remarks: "Queued for the next disbursal batch at the Madhapur branch.",
    },
    {
      id: "b71f4c05-2e88-4a19-9f63-30d5c7ea6302",
      code: "BO-2423",
      loanId: loans[3].id,
      bankId: ICICI,
      customerId: customers[3].id,
      submittedOn: days(14),
      sla: inDays(1),
      stage: "Credit Check",
      status: "On Hold",
      officer: "Sneha Kulkarni",
      remarks: "Held pending salary credit statement for the last six months.",
    },
    {
      id: "b71f4c05-2e88-4a19-9f63-30d5c7ea6303",
      code: "BO-2429",
      loanId: loans[4].id,
      bankId: HDFC,
      customerId: customers[4].id,
      submittedOn: days(7),
      sla: inDays(4),
      stage: "Field Verification",
      status: "In Progress",
      officer: "Aditya Varma",
      remarks: "Residence verification scheduled; office visit already cleared.",
    },
  ];

  const disbursements: Disbursement[] = [
    {
      id: "c58a3d72-9014-4d6b-bb27-4f1e90c8d401",
      code: "DSB-5028",
      loanId: loans[0].id,
      customerId: customers[0].id,
      bankId: HDFC,
      fundingSourceId: null,
      amount: "6200000",
      utr: "HDFCN52400714822",
      mode: "RTGS",
      disbursedOn: days(6),
      status: "Credited",
      creditedTo: "Aparna Constructions Escrow A/c",
      notes: "Full sanction released against the tripartite agreement.",
    },
    {
      id: "c58a3d72-9014-4d6b-bb27-4f1e90c8d402",
      code: "DSB-5034",
      loanId: loans[2].id,
      customerId: customers[2].id,
      bankId: ICICI,
      fundingSourceId: null,
      amount: "2500000",
      utr: "ICICN22400339107",
      mode: "NEFT",
      disbursedOn: days(2),
      status: "In Transit",
      creditedTo: "Baig Auto Spares — Current A/c 002401544712",
      notes: "Awaiting credit confirmation in the next settlement file.",
    },
  ];

  const transactions: Transaction[] = [
    {
      id: "d92b6e14-70a3-4c58-8e91-1c4d7fb20501",
      code: "TXN-77104",
      customerId: customers[0].id,
      bankId: HDFC,
      loanId: loans[0].id,
      amount: "6200000",
      commission: "83700",
      txnType: "Disbursement",
      status: "Success",
      reference: "HDFCN52400714822",
      occurredAt: days(6),
    },
    {
      id: "d92b6e14-70a3-4c58-8e91-1c4d7fb20502",
      code: "TXN-77118",
      customerId: customers[0].id,
      bankId: HDFC,
      loanId: loans[0].id,
      amount: emi(6200000, 8.6, 240),
      commission: "0",
      txnType: "EMI Collection",
      status: "Success",
      reference: "ACH/HDFC/EMI/0042118",
      occurredAt: days(3),
    },
    {
      id: "d92b6e14-70a3-4c58-8e91-1c4d7fb20503",
      code: "TXN-77126",
      customerId: customers[2].id,
      bankId: ICICI,
      loanId: loans[2].id,
      amount: "2500000",
      commission: "27500",
      txnType: "Disbursement",
      status: "Pending",
      reference: "ICICN22400339107",
      occurredAt: days(2),
    },
    {
      id: "d92b6e14-70a3-4c58-8e91-1c4d7fb20504",
      code: "TXN-77131",
      customerId: customers[1].id,
      bankId: HDFC,
      loanId: loans[1].id,
      amount: "9500",
      commission: "0",
      txnType: "Commission",
      status: "Success",
      reference: "PF/HDFC/LN-1049",
      occurredAt: hours(30),
    },
  ];

  const documents: DocumentRecord[] = [
    {
      id: "e13c8a56-4b27-4f90-9d61-8a05e2c7f601",
      customerId: customers[0].id,
      loanId: loans[0].id,
      bankId: HDFC,
      docType: "Sale Agreement",
      fileName: "arvind-kolla-sale-agreement.pdf",
      fileSize: 2841600,
      mimeType: "application/pdf",
      status: "Verified",
      uploadedBy: DEMO_USER_ID,
      // Demo stores metadata and NO bytes, so there is nothing to point at.
      // The UI reads this and does not offer a download (D-004).
      storageKey: null,
      checksum: null,
      verifiedBy: null,
      createdAt: days(35),
    },
    {
      id: "e13c8a56-4b27-4f90-9d61-8a05e2c7f602",
      customerId: customers[1].id,
      loanId: loans[1].id,
      bankId: HDFC,
      docType: "Bank Statement",
      fileName: "sridevi-anumolu-statement-6m.pdf",
      fileSize: 1174016,
      mimeType: "application/pdf",
      status: "Verified",
      uploadedBy: DEMO_USER_ID,
      // Demo stores metadata and NO bytes, so there is nothing to point at.
      // The UI reads this and does not offer a download (D-004).
      storageKey: null,
      checksum: null,
      verifiedBy: null,
      createdAt: days(28),
    },
    {
      id: "e13c8a56-4b27-4f90-9d61-8a05e2c7f603",
      customerId: customers[2].id,
      loanId: loans[2].id,
      bankId: ICICI,
      docType: "ITR",
      fileName: "baig-auto-spares-itr-fy24.pdf",
      fileSize: 986112,
      mimeType: "application/pdf",
      status: "Verified",
      uploadedBy: DEMO_USER_ID,
      // Demo stores metadata and NO bytes, so there is nothing to point at.
      // The UI reads this and does not offer a download (D-004).
      storageKey: null,
      checksum: null,
      verifiedBy: null,
      createdAt: days(23),
    },
    {
      id: "e13c8a56-4b27-4f90-9d61-8a05e2c7f604",
      customerId: customers[3].id,
      loanId: loans[3].id,
      bankId: ICICI,
      docType: "Salary Slip",
      fileName: "priyanka-deshmukh-payslip-latest.pdf",
      fileSize: 412672,
      mimeType: "application/pdf",
      status: "Rejected",
      uploadedBy: DEMO_USER_ID,
      // Demo stores metadata and NO bytes, so there is nothing to point at.
      // The UI reads this and does not offer a download (D-004).
      storageKey: null,
      checksum: null,
      verifiedBy: null,
      createdAt: days(12),
    },
    {
      id: "e13c8a56-4b27-4f90-9d61-8a05e2c7f605",
      customerId: customers[6].id,
      loanId: null,
      bankId: HDFC,
      docType: "PAN Card",
      fileName: "lavanya-chintalapudi-pan.jpg",
      fileSize: 268288,
      mimeType: "image/jpeg",
      status: "Pending",
      uploadedBy: DEMO_USER_ID,
      // Demo stores metadata and NO bytes, so there is nothing to point at.
      // The UI reads this and does not offer a download (D-004).
      storageKey: null,
      checksum: null,
      verifiedBy: null,
      createdAt: days(3),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: "f47d9b28-5c31-4e08-a172-9b6c30e4d701",
      title: "SLA breach approaching",
      message:
        "BO-2423 (Priyanka Deshmukh · ICICI Bank) breaches its credit-check SLA in under 24 hours.",
      severity: "danger",
      read: false,
      createdAt: hours(2),
      linkHref: "/bank-orders",
    },
    {
      id: "f47d9b28-5c31-4e08-a172-9b6c30e4d702",
      title: "Document rejected by lender",
      message:
        "ICICI Bank rejected the salary slip on LN-1061. A fresh payslip with the employer seal is required.",
      severity: "warning",
      read: false,
      createdAt: hours(9),
      linkHref: "/documents",
    },
    {
      id: "f47d9b28-5c31-4e08-a172-9b6c30e4d703",
      title: "Disbursal in transit",
      message: "DSB-5034 for ₹25,00,000 has left ICICI Bank. UTR ICICN22400339107.",
      severity: "info",
      read: false,
      createdAt: days(2),
      linkHref: "/disbursement",
    },
    {
      id: "f47d9b28-5c31-4e08-a172-9b6c30e4d704",
      title: "Sanction letter issued",
      message: "HDFC Bank sanctioned ₹8,50,000 on LN-1049 for Sridevi Anumolu.",
      severity: "success",
      read: true,
      createdAt: days(4),
      linkHref: "/loans",
    },
    {
      id: "f47d9b28-5c31-4e08-a172-9b6c30e4d705",
      title: "KYC pending",
      message: "Two customers in your book are still awaiting KYC verification.",
      severity: "warning",
      read: true,
      createdAt: days(7),
      linkHref: "/customers",
    },
  ];

  /**
   * A minimal colleague directory. It exists only so foreign keys resolve to
   * names on the screens the executive can already open — the Employees screen
   * and every user-management action stay out of reach.
   */
  const employees: Employee[] = [
    {
      id: DEMO_USER_ID,
      employeeCode: "RN-EX-0148",
      name: "Karthik Rao",
      email: DEMO_EMAIL,
      phone: "+91 98495 60142",
      branch: "Hyderabad — Gachibowli",
      status: "Active",
      joinedOn: days(305),
      target: 12000000,
      achieved: 8700000,
      avatarColor: "#0a4b9c",
      lastLoginAt: hours(1),
      roleId: "role-executive",
      roleKey: "executive",
      roleName: "Executive",
      roleLevel: 40,
      assignedBanks: DEMO_BANK_IDS,
      // Task 3.7 added these to Employee. Demo colleagues are fully set up.
      invitedAt: null,
      inviteAcceptedAt: null,
    },
    {
      id: COLLEAGUE_ID,
      employeeCode: "RN-EX-0152",
      name: "Aditya Varma",
      email: "aditya.varma@risenext.com",
      phone: "+91 90300 71128",
      branch: "Hyderabad — Gachibowli",
      status: "Active",
      joinedOn: days(214),
      target: 10000000,
      achieved: 6400000,
      avatarColor: "#0f766e",
      lastLoginAt: hours(5),
      roleId: "role-executive",
      roleKey: "executive",
      roleName: "Executive",
      roleLevel: 40,
      assignedBanks: DEMO_BANK_IDS,
      // Task 3.7 added these to Employee. Demo colleagues are fully set up.
      invitedAt: null,
      inviteAcceptedAt: null,
    },
    {
      id: TEAM_LEAD_ID,
      employeeCode: "RN-TL-0044",
      name: "Meera Iyer",
      email: "meera.iyer@risenext.com",
      phone: "+91 98660 21107",
      branch: "Hyderabad — Gachibowli",
      status: "Active",
      joinedOn: days(742),
      target: 30000000,
      achieved: 24100000,
      avatarColor: "#b45309",
      lastLoginAt: hours(3),
      roleId: "role-team-leader",
      roleKey: "team_leader",
      roleName: "Team Leader",
      roleLevel: 30,
      assignedBanks: DEMO_BANK_IDS,
      // Task 3.7 added these to Employee. Demo colleagues are fully set up.
      invitedAt: null,
      inviteAcceptedAt: null,
    },
  ];

  const teams: Team[] = [
    {
      id: TEAM_ID,
      name: "Hyderabad West — Retail",
      description: "Retail and secured lending desk for the western corridor.",
      leaderId: TEAM_LEAD_ID,
      status: "Active",
      members: [
        { teamId: TEAM_ID, userId: DEMO_USER_ID, name: "Karthik Rao" },
        { teamId: TEAM_ID, userId: COLLEAGUE_ID, name: "Aditya Varma" },
        { teamId: TEAM_ID, userId: TEAM_LEAD_ID, name: "Meera Iyer" },
      ],
    },
  ];

  return {
    banks,
    customers,
    loans,
    verifications,
    serviceProviders,
    bankOrders,
    disbursements,
    transactions,
    documents,
    notifications,
    employees,
    teams,
    sequence: {
      customer: 10048,
      loan: 1075,
      bankOrder: 2430,
      disbursement: 5035,
      transaction: 77132,
    },
  };
}
