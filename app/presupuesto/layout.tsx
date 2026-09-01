import { AccessibleDialogBoundary } from "@/components/accessible-dialog-boundary";
import "../editor-dialog.css";
import "../budget.css";

export default function Layout({children}:{children:React.ReactNode}){return <AccessibleDialogBoundary>{children}</AccessibleDialogBoundary>}
