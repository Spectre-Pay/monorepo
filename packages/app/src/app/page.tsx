import { PageHeader } from "@/components/page-header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { InvoiceTable } from "@/components/dashboard/invoice-table";
import { MOCK_INVOICES, DASHBOARD_STATS } from "@/lib/mock-data";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <StatsCards stats={DASHBOARD_STATS} />
      <InvoiceTable invoices={MOCK_INVOICES} />
    </>
  );
}
