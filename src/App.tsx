import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cases from "./pages/Cases";
import NewCase from "./pages/NewCase";
import CaseDetail from "./pages/CaseDetail";
import CaseEdit from "./pages/CaseEdit";
import CaseRecords from "./pages/CaseRecords";
import DataUpload from "./pages/DataUpload";
import AIChat from "./pages/AIChat";
import Reports from "./pages/Reports";
import CaseDocuments from "./pages/CaseDocuments";
import KnowledgeBase from "./pages/KnowledgeBase";
import LegalReference from "./pages/LegalReference";
import CaseComparison from "./pages/CaseComparison";
import DataCleanup from "./pages/DataCleanup";
import DataExport from "./pages/DataExport";
import ProfileSettings from "./pages/ProfileSettings";
import Settings from "./pages/Settings";
import MysqlConnections from "./pages/MysqlConnections";
import StaffMessages from "./pages/StaffMessages";
import StaffManagement from "./pages/StaffManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

/** Wraps a route element with module permission check. Redirects to / if denied. */
function RequireModule({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { isModuleAllowed, loading } = useModulePermissions();
  const { role } = useAuth();
  // Admins bypass, and don't block while loading
  if (role === 'admin' || loading) return <>{children}</>;
  if (!isModuleAllowed(moduleKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/cases" element={<RequireAuth><Cases /></RequireAuth>} />
      <Route path="/cases/new" element={<RequireAuth><NewCase /></RequireAuth>} />
      <Route path="/cases/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
      <Route path="/cases/:id/edit" element={<RequireAuth><CaseEdit /></RequireAuth>} />
      <Route path="/cases/:id/records" element={<RequireAuth><CaseRecords /></RequireAuth>} />
      <Route path="/upload" element={<RequireAuth><RequireModule moduleKey="data_upload"><DataUpload /></RequireModule></RequireAuth>} />
      <Route path="/chat" element={<RequireAuth><RequireModule moduleKey="ai_chat"><AIChat /></RequireModule></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><RequireModule moduleKey="reports"><Reports /></RequireModule></RequireAuth>} />
      <Route path="/documents" element={<RequireAuth><RequireModule moduleKey="documents"><CaseDocuments /></RequireModule></RequireAuth>} />
      <Route path="/knowledge-base" element={<RequireAuth><RequireModule moduleKey="knowledge_base"><KnowledgeBase /></RequireModule></RequireAuth>} />
      <Route path="/legal" element={<RequireAuth><RequireModule moduleKey="legal_reference"><LegalReference /></RequireModule></RequireAuth>} />
      <Route path="/compare" element={<RequireAuth><RequireModule moduleKey="case_compare"><CaseComparison /></RequireModule></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth><StaffManagement /></RequireAuth>} />
      <Route path="/admin/staff" element={<RequireAuth><StaffManagement /></RequireAuth>} />
      <Route path="/admin/cleanup" element={<RequireAuth><DataCleanup /></RequireAuth>} />
      <Route path="/admin/export" element={<RequireAuth><DataExport /></RequireAuth>} />
      <Route path="/admin/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/admin/mysql" element={<RequireAuth><MysqlConnections /></RequireAuth>} />
      <Route path="/messages" element={<RequireAuth><StaffMessages /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfileSettings /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
