import type { Invoice, InvoiceStatus, DashboardStats } from "./types";

function makeFlowSteps(completedUpTo: number, baseDate: string) {
  const labels = [
    { label: "Invoice", description: "Invoice created and sent to payer" },
    { label: "Notify", description: "Chainlink CRE TEE notifies recipient" },
    { label: "Consent", description: "Recipient reviews and approves" },
    { label: "Deploy", description: "TEE deploys Stealth Safe with guard" },
    { label: "Attest", description: "Payer receives TEE attestation" },
    { label: "Settle", description: "Payment sent with TEE signature" },
  ];

  const base = new Date(baseDate);
  return labels.map((s, i) => ({
    step: i + 1,
    label: s.label,
    description: s.description,
    completed: i < completedUpTo,
    timestamp: i < completedUpTo
      ? new Date(base.getTime() + i * 3600000).toISOString()
      : undefined,
  }));
}

const statusToSteps: Record<InvoiceStatus, number> = {
  draft: 1,
  pending: 3,
  attested: 5,
  settled: 6,
  withdrawn: 6,
};

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "INV-001",
    invoiceId: "0x7a3b...f291",
    amount: "2.5",
    payerWorldId: "0x1a2b...3c4d",
    recipientWorldId: "0x5e6f...7a8b",
    status: "settled",
    createdAt: "2025-03-01T10:00:00Z",
    updatedAt: "2025-03-01T16:00:00Z",
    description: "Q1 consulting payment",
    safeAddress: "0x1aA9...8e46",
    guardAddress: "0x8C87...3260",
    teeSignerAddress: "0x9d0e...1f2a",
    teeAttestationStatus: "verified",
    flowSteps: makeFlowSteps(statusToSteps.settled, "2025-03-01T10:00:00Z"),
    txHash: "0xabc1...def2",
  },
  {
    id: "INV-002",
    invoiceId: "0x8b4c...e382",
    amount: "0.75",
    payerWorldId: "0x2b3c...4d5e",
    recipientWorldId: "0x5e6f...7a8b",
    status: "attested",
    createdAt: "2025-03-02T09:00:00Z",
    updatedAt: "2025-03-02T14:00:00Z",
    description: "Logo design payment",
    safeAddress: "0x2bB0...9f57",
    guardAddress: "0x9D98...4371",
    teeSignerAddress: "0x9d0e...1f2a",
    teeAttestationStatus: "verified",
    flowSteps: makeFlowSteps(statusToSteps.attested, "2025-03-02T09:00:00Z"),
  },
  {
    id: "INV-003",
    invoiceId: "0x9c5d...d473",
    amount: "1.2",
    payerWorldId: "0x3c4d...5e6f",
    recipientWorldId: "0x5e6f...7a8b",
    status: "pending",
    createdAt: "2025-03-03T08:00:00Z",
    updatedAt: "2025-03-03T10:00:00Z",
    description: "Smart contract audit",
    teeAttestationStatus: "none",
    flowSteps: makeFlowSteps(statusToSteps.pending, "2025-03-03T08:00:00Z"),
  },
  {
    id: "INV-004",
    invoiceId: "0xad6e...c564",
    amount: "5.0",
    payerWorldId: "0x4d5e...6f7a",
    recipientWorldId: "0x5e6f...7a8b",
    status: "settled",
    createdAt: "2025-02-28T12:00:00Z",
    updatedAt: "2025-02-28T18:00:00Z",
    description: "Protocol integration fee",
    safeAddress: "0x3cC1...0a68",
    guardAddress: "0xAE09...5482",
    teeSignerAddress: "0x9d0e...1f2a",
    teeAttestationStatus: "verified",
    flowSteps: makeFlowSteps(statusToSteps.settled, "2025-02-28T12:00:00Z"),
    txHash: "0xdef3...abc4",
  },
  {
    id: "INV-005",
    invoiceId: "0xbe7f...b655",
    amount: "0.3",
    payerWorldId: "0x5e6f...7a8b",
    recipientWorldId: "0x6f7a...8b9c",
    status: "draft",
    createdAt: "2025-03-04T07:00:00Z",
    updatedAt: "2025-03-04T07:00:00Z",
    description: "Freelance dev work",
    teeAttestationStatus: "none",
    flowSteps: makeFlowSteps(statusToSteps.draft, "2025-03-04T07:00:00Z"),
  },
  {
    id: "INV-006",
    invoiceId: "0xcf80...a746",
    amount: "10.0",
    payerWorldId: "0x7a8b...9c0d",
    recipientWorldId: "0x5e6f...7a8b",
    status: "withdrawn",
    createdAt: "2025-02-25T14:00:00Z",
    updatedAt: "2025-02-26T09:00:00Z",
    description: "Infrastructure setup",
    safeAddress: "0x4dD2...1b79",
    guardAddress: "0xBF1A...6593",
    teeSignerAddress: "0x9d0e...1f2a",
    teeAttestationStatus: "verified",
    flowSteps: makeFlowSteps(statusToSteps.withdrawn, "2025-02-25T14:00:00Z"),
    txHash: "0x1234...5678",
  },
  {
    id: "INV-007",
    invoiceId: "0xd091...9837",
    amount: "0.15",
    payerWorldId: "0x8b9c...0d1e",
    recipientWorldId: "0x5e6f...7a8b",
    status: "pending",
    createdAt: "2025-03-04T06:00:00Z",
    updatedAt: "2025-03-04T07:30:00Z",
    description: "Bug bounty reward",
    teeAttestationStatus: "pending",
    flowSteps: makeFlowSteps(statusToSteps.pending, "2025-03-04T06:00:00Z"),
  },
];

export function getInvoiceById(id: string): Invoice | undefined {
  return MOCK_INVOICES.find((inv) => inv.id === id);
}

export function getStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "text-muted-foreground bg-muted";
    case "pending":
      return "text-yellow-400 bg-yellow-400/10";
    case "attested":
      return "text-sp bg-sp/10";
    case "settled":
      return "text-sp bg-sp/10";
    case "withdrawn":
      return "text-muted-foreground bg-muted";
  }
}

export const DASHBOARD_STATS: DashboardStats = {
  totalInvoices: MOCK_INVOICES.length,
  totalVolume: MOCK_INVOICES.reduce((sum, inv) => sum + parseFloat(inv.amount), 0).toFixed(2),
  pendingCount: MOCK_INVOICES.filter((inv) => inv.status === "pending").length,
  settledCount: MOCK_INVOICES.filter(
    (inv) => inv.status === "settled" || inv.status === "withdrawn"
  ).length,
};
