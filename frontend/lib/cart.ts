const STORAGE_KEY = "gachard_cart";

export function getCart(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToCart(listingId: string): string[] {
  const cart = getCart();
  if (!cart.includes(listingId)) {
    cart.push(listingId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }
  return cart;
}

export function removeFromCart(listingId: string): string[] {
  let cart = getCart();
  cart = cart.filter((id) => id !== listingId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  return cart;
}

export function clearCart(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isInCart(listingId: string): boolean {
  return getCart().includes(listingId);
}
