import { AccessibleDialogBoundary } from "@/components/accessible-dialog-boundary";
import "../budget.css";

export default function Layout({children}:{children:React.ReactNode}){return <AccessibleDialogBoundary>{children}</AccessibleDialogBoundary>}
