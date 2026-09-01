import { AccessibleDialogBoundary } from "@/components/accessible-dialog-boundary";
import "../module-surfaces.css";
import "../editor-dialog.css";
import "../forecast.css";
import "../forecast-ledger.css";
import "../forecast-liquidity.css";

export default function Layout({children}:{children:React.ReactNode}){return <AccessibleDialogBoundary>{children}</AccessibleDialogBoundary>}
