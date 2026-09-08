import AppShell from "../app-shell";
import { ForecastClient } from "./forecast-client";

export default function ForecastPage() {
  return (
    <AppShell>
      <ForecastClient />
    </AppShell>
  );
}
