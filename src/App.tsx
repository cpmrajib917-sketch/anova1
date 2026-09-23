// @ts-nocheck
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { TopProgress } from "./components/TopProgress";
import { Footer } from "./components/Footer";
import { Landing } from "./pages/Landing";
import { Home } from "./pages/Home";
import { Search } from "./pages/Search";
import { Detail } from "./pages/Detail";
import { Watch } from "./pages/Watch";
import { Profile } from "./pages/Profile";
import { Discover } from "./pages/Discover";
import { Admin } from "./pages/Admin";
import { AiAssistant } from "./components/ai/AiAssistant";
import { useAppStore } from "./store";
import { syncComments, trackUserLogin, trackUserHeartbeat, trackUserLogout } from "./lib/firebaseSync";

function AppSyncWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    // 1. Live Sync Comments from Firebase RTDB
    const unsubscribe = syncComments((comments) => {
      useAppStore.getState().setComments(comments);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const email = localStorage.getItem("userEmail");
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

    if (isLoggedIn && email) {
      // Load user profile & sync lists
      trackUserLogin(email).then(() => {
        useAppStore.getState().loadUserFirebaseData(email);
      });

      // Periodic online heartbeat
      trackUserHeartbeat(email, location.pathname);
      const interval = setInterval(() => {
        trackUserHeartbeat(email, location.pathname);
      }, 15000);

      return () => {
        clearInterval(interval);
        trackUserLogout();
      };
    } else {
      // Guest online tracking
      trackUserHeartbeat("", location.pathname);
      const interval = setInterval(() => {
        trackUserHeartbeat("", location.pathname);
      }, 15000);

      return () => {
        clearInterval(interval);
        trackUserLogout();
      };
    }
  }, [location.pathname]);

  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MainLayout() {
  const location = useLocation();
  const isLanding = location.pathname === "/landing";

  return (
    <div className="min-h-screen bg-bg text-white selection:bg-primary selection:text-black flex flex-col justify-between w-full max-w-full">
      <TopProgress />
      {!isLanding && <Navigation />}
      <main className={isLanding ? "flex-1 w-full max-w-full" : "pb-12 pt-20 flex-1 w-full max-w-full"}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/search" element={<Search />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/library" element={<Navigate to="/profile" replace />} />
          <Route path="/anime/:id" element={<Detail />} />
          <Route path="/watch/:id" element={<Watch />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <AiAssistant />
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppSyncWrapper>
        <MainLayout />
      </AppSyncWrapper>
    </BrowserRouter>
  );
}
