"use client";
import { useState, useEffect, useCallback } from "react";
import { getCart, addToCart as add, removeFromCart as remove, clearCart as clear } from "@/lib/cart";

const CART_EVENT = "gachard-cart-change";

function notifyCartChange() {
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function useCart() {
  const [cart, setCart] = useState<string[]>([]);

  useEffect(() => {
    setCart(getCart());
    const handler = () => setCart(getCart());
    window.addEventListener(CART_EVENT, handler);
    return () => window.removeEventListener(CART_EVENT, handler);
  }, []);

  const addToCart = useCallback((listingId: string) => {
    add(listingId);
    notifyCartChange();
  }, []);

  const removeFromCart = useCallback((listingId: string) => {
    remove(listingId);
    notifyCartChange();
  }, []);

  const clearCart = useCallback(() => {
    clear();
    notifyCartChange();
  }, []);

  const isInCartFn = useCallback((listingId: string) => {
    return cart.includes(listingId);
  }, [cart]);

  return { cart, addToCart, removeFromCart, clearCart, isInCart: isInCartFn, count: cart.length };
}
