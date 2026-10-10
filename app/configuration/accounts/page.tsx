import { redirect } from "next/navigation";

// Preserve existing links while keeping a single configuration editor.
export default function ConfigurationAccountsPage() {
  redirect("/configuration?tab=accounts");
}
