const STORAGE_KEY = "gachard_wishlist";

export function getWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function toggleWishlist(cardId: string): string[] {
  const list = getWishlist();
  const index = list.indexOf(cardId);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(cardId);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function isInWishlist(cardId: string): boolean {
  return getWishlist().includes(cardId);
}
