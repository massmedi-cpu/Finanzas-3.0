import {
  recurrenceContextFromSearchParams,
  type FlowSearchParams,
} from "../../src/application/forecast/recurrence-flow";
import RecurrencesClient from "./recurrences-client";

export default async function RecurrencesPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}) {
  const forecastContext = recurrenceContextFromSearchParams(await searchParams);

  return <RecurrencesClient forecastContext={forecastContext} />;
}
