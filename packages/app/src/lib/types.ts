export type InvoiceStatus =
  | "draft"
  | "pending"
  | "attested"
  | "settled"
  | "withdrawn";

export type FlowStep = {
  step: number;
  label: string;
  description: string;
  completed: boolean;
  timestamp?: string;
};

export type Invoice = {
  id: string;
  invoiceId: string;
  amount: string;
  payerWorldId: string;
  recipientWorldId: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
  description: string;
  safeAddress?: string;
  guardAddress?: string;
  teeSignerAddress?: string;
  teeAttestationStatus: "none" | "pending" | "verified";
  flowSteps: FlowStep[];
  txHash?: string;
};

export type DashboardStats = {
  totalInvoices: number;
  totalVolume: string;
  pendingCount: number;
  settledCount: number;
};
