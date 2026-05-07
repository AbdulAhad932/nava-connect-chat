import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { CallProvider } from "@/contexts/CallContext";
import { CallScreen } from "@/components/CallScreen";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import ProfileSetup from "./pages/ProfileSetup.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Chat from "./pages/Chat.tsx";
import CreateGroup from "./pages/CreateGroup.tsx";
import GroupChat from "./pages/GroupChat.tsx";
import GroupInfo from "./pages/GroupInfo.tsx";
import StatusViewer from "./pages/StatusViewer.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const AppShell = () => {
  const { user } = useAuth();
  useGlobalNotifications(user?.id);
  return (
    <CallProvider>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/chat/:userId" element={<Chat />} />
        <Route path="/new-group" element={<CreateGroup />} />
        <Route path="/group/:groupId" element={<GroupChat />} />
        <Route path="/group/:groupId/info" element={<GroupInfo />} />
        <Route path="/status/:userId" element={<StatusViewer />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <CallScreen />
    </CallProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
