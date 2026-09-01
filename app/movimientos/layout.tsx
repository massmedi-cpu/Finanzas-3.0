import { AccessibleDialogBoundary } from "@/components/accessible-dialog-boundary";
import "./tablet.css";
import "../detail-dialog.css";
import "../movements.css";
import "../document-linking.css";
import "./movement-documents.css";
import "./bulk-operations.css";
import "./conciliacion/reconciliation-workbench.css";

export default function Layout({children}:{children:React.ReactNode}){return <AccessibleDialogBoundary>{children}</AccessibleDialogBoundary>}
