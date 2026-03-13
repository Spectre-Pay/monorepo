import { getInvoiceById } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { DetailCard } from "@/components/invoice/detail-card";
import { StatusTimeline } from "@/components/invoice/status-timeline";
import { notFound } from "next/navigation";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = getInvoiceById(id);
  if (!invoice) notFound();

  return (
    <>
      <PageHeader title={invoice.id} description={invoice.description} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-16">
        <div className="lg:col-span-3">
          <DetailCard invoice={invoice} />
        </div>
        <div className="lg:col-span-2">
          <StatusTimeline steps={invoice.flowSteps} />
        </div>
      </div>
    </>
  );
}
