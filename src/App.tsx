import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "./pages/HomePage";
import AddArticlePage from "./pages/AddArticlePage";
import PlayerPage from "./pages/PlayerPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import PublicProfilePage from "./pages/PublicProfilePage";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<AddArticlePage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/:username" element={<PublicProfilePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
