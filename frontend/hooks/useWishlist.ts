"use client";
import { useState, useEffect, useCallback } from "react";
import { getWishlist, toggleWishlist as toggle } from "@/lib/wishlist";

export function useWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    setWishlist(getWishlist());
  }, []);

  const toggleWishlist = useCallback((cardId: string) => {
    const wasWishlisted = getWishlist().includes(cardId);
    const updated = toggle(cardId);
    setWishlist([...updated]);

    // Update backend count
    const action = wasWishlisted ? "remove" : "add";
    fetch("/api/marketplace/wishlist-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cardId, action }),
    }).catch(() => {});
  }, []);

  const isWishlisted = useCallback((cardId: string) => {
    return wishlist.includes(cardId);
  }, [wishlist]);

  return { wishlist, toggleWishlist, isWishlisted, count: wishlist.length };
}
