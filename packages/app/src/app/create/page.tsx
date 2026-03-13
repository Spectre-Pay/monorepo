import { PageHeader } from "@/components/page-header";
import { InvoiceForm } from "@/components/create/invoice-form";

export default function CreateInvoicePage() {
  return (
    <>
      <PageHeader
        title="Create Invoice"
        description="Generate a new privacy-preserving invoice"
      />
      <InvoiceForm />
    </>
  );
}
