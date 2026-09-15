"use client";

import { useEffect, useState } from "react";

import HomeHero from "@/components/home/HomeHero";
import HomeFeaturedCards from "@/components/home/HomeFeaturedCards";
import HomeWhyGachard from "@/components/home/HomeWhyGachard";
import HomeCoreLoop from "@/components/home/HomeCoreLoop";
import HomeCtaBand from "@/components/home/HomeCtaBand";
// Mounted here rather than in layout.tsx so it appears on the homepage only —
// which also stops its supporter-count fetch from firing on every route.
import SupportGachard from "@/components/support/SupportGachard";

interface SessionUser {
  user_id: string;
  username: string;
}

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (!stored) return;
    try {
      setUser(JSON.parse(stored) as SessionUser);
    } catch {
      /* corrupt session — ignore */
    }
  }, []);

  return (
    <div data-testid="home-page">
      <HomeHero isAuthenticated={!!user} />
      <HomeWhyGachard />
      <HomeCoreLoop />
      <HomeFeaturedCards />
      <HomeCtaBand />
      <SupportGachard />
    </div>
  );
}
