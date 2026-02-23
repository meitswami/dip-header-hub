import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cases from "./pages/Cases";
import NewCase from "./pages/NewCase";
import CaseDetail from "./pages/CaseDetail";
import CaseRecords from "./pages/CaseRecords";
import DataUpload from "./pages/DataUpload";
import AIChat from "./pages/AIChat";
import Reports from "./pages/Reports";
import LegalReference from "./pages/LegalReference";
import KnowledgeBase from "./pages/KnowledgeBase";
import CaseDocuments from "./pages/CaseDocuments";
import AdminUsers from "./pages/AdminUsers";
import ProfileSettings from "./pages/ProfileSettings";
import CaseComparison from "./pages/CaseComparison";
import DataCleanup from "./pages/DataCleanup";
import DataExport from "./pages/DataExport";
import NotFound from "./pages/NotFound";

import { Loader2 } from "lucide-react";

const queryClient = new QueryClient(); // init

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
              <Route path="/cases/new" element={<ProtectedRoute><NewCase /></ProtectedRoute>} />
              <Route path="/cases/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
              <Route path="/cases/:id/records" element={<ProtectedRoute><CaseRecords /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><DataUpload /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/legal" element={<ProtectedRoute><LegalReference /></ProtectedRoute>} />
              <Route path="/knowledge-base" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><CaseDocuments /></ProtectedRoute>} />
              <Route path="/compare" element={<ProtectedRoute><CaseComparison /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/cleanup" element={<ProtectedRoute><DataCleanup /></ProtectedRoute>} />
              <Route path="/admin/export" element={<ProtectedRoute><DataExport /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
