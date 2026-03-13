import { getInvoiceById } from "@/lib/mock-data";
import { PaymentFlow } from "@/components/pay/payment-flow";
import { notFound } from "next/navigation";

export default async function PayInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = getInvoiceById(id);
  if (!invoice) notFound();

  return (
    <div className="flex justify-center pt-8">
      <PaymentFlow invoice={invoice} />
    </div>
  );
}
