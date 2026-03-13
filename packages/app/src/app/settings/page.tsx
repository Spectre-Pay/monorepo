import { PageHeader } from "@/components/page-header";
import { SettingsSections } from "@/components/settings/settings-sections";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account and protocol configuration"
      />
      <SettingsSections />
    </>
  );
}
