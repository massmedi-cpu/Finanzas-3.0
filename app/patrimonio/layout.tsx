import { AccessibleDialogBoundary } from "@/components/accessible-dialog-boundary";
import "../detail-dialog.css";
import "../net-worth.css";

export default function Layout({children}:{children:React.ReactNode}){return <AccessibleDialogBoundary>{children}</AccessibleDialogBoundary>}
