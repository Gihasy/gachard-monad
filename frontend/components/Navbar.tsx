"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { useCart } from "@/hooks/useCart";
import CartDropdown from "@/components/CartDropdown";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/collect", label: "Collect" },
  { href: "/play", label: "Play" },
  { href: "/trade", label: "Trade" },
  { href: "/scan", label: "Scan" },
  { href: "/profile", label: "Profile" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username?: string; user_id?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showCartDropdown, setShowCartDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [crystal, setCrystal] = useState<number | null>(null);
  const { count: cartCount, cart, removeFromCart } = useCart();

  const refreshBalance = () => {
    fetch("/api/credits", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCredits(d.balance ?? 0))
      .catch(() => {});
    fetch("/api/crystal", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCrystal(d.balance ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    const readUser = () => {
      const stored = localStorage.getItem("user");
      const parsed = stored ? JSON.parse(stored) : null;
      setUser(parsed);
      if (parsed?.user_id) {
        refreshBalance();
      }
    };
    readUser();

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 12);
          ticking = false;
        });
        ticking = true;
      }
    };
    let ticking = false;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("auth-change", readUser);
    window.addEventListener("balance-change", readUser);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("auth-change", readUser);
      window.removeEventListener("balance-change", readUser);
    };
  }, []);

  // Close the mobile drawer, cart dropdown, and user menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
    setShowCartDropdown(false);
    setShowUserMenu(false);
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-50 w-full"
      data-testid="site-navbar"
      style={{
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        background: scrolled
          ? "rgba(11, 14, 26, 0.72)"
          : "rgba(11, 14, 26, 0.35)",
        borderBottom: scrolled
          ? "1px solid rgba(230,232,240,0.08)"
          : "1px solid transparent",
        transition: "background 220ms ease, border-color 220ms ease",
      }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between h-[76px]">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 group"
            data-testid="nav-logo-link"
          >
            <Logo size={48} showWordmark priority className="drop-shadow-[0_0_18px_rgba(184,172,255,0.5)]" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="relative px-4 py-2 text-[0.78rem] font-medium uppercase tracking-[0.14em] transition-colors"
                  style={{
                    color: active ? "#FFFFFF" : "rgba(230,232,240,0.72)",
                  }}
                >
                  <span className="relative z-10">{item.label}</span>
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-[22px] h-[2px] rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--cosmic-violet), var(--aurora-pink), var(--electric-blue))",
                        boxShadow: "0 0 12px rgba(184,172,255,0.6)",
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Wishlist */}
            <Link
              href="/wishlist"
              className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center transition-all hover:brightness-125"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              title="Wishlist"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--silver-mist-dim)" }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>

            {/* Cart */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowCartDropdown(!showCartDropdown)}
                className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all hover:brightness-125"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                title="Cart"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--silver-mist-dim)" }}>
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                {cartCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: "var(--aurora-pink)", color: "white" }}
                  >
                    {cartCount}
                  </span>
                )}
              </button>
              {showCartDropdown && (
                <CartDropdown
                  cartIds={cart}
                  onRemove={removeFromCart}
                  onClose={() => setShowCartDropdown(false)}
                />
              )}
            </div>

            {user ? (
              <>
                {/* Admin Console Link */}
                <Link
                  href="/admin"
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.7rem] font-bold uppercase tracking-[0.12em] transition-all hover:brightness-110 hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #FF4D6D, #FF6BBA)",
                    border: "1px solid rgba(255,77,109,0.4)",
                    color: "white",
                    boxShadow: "0 0 12px rgba(255,77,109,0.3), 0 0 24px rgba(255,107,186,0.15)",
                    textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  }}
                  data-testid="nav-admin-link"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Admin
                </Link>

                <div
                  className="relative hidden sm:block"
                  onMouseEnter={() => { setShowUserMenu(true); refreshBalance(); }}
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full cursor-pointer transition-all hover:brightness-125"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                    data-testid="nav-user-chip"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: "var(--aurora-gold)",
                        boxShadow: "0 0 8px var(--aurora-gold)",
                      }}
                    />
                    <span className="text-xs font-medium text-white/85">
                      @{user.username}
                    </span>
                  </div>

                {/* Invisible bridge to prevent hover gap */}
                {showUserMenu && <div className="absolute right-0 w-full h-2" style={{ top: "100%" }} />}

                {/* User dropdown */}
                {showUserMenu && (
                  <div
                    className="absolute right-0 top-full w-60 rounded-2xl overflow-hidden z-50"
                    style={{
                      background: "rgba(15, 19, 36, 0.97)",
                      border: "1px solid rgba(230,232,240,0.1)",
                      backdropFilter: "blur(20px)",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                    }}
                  >
                    {/* Credits — matches profile page style */}
                    <div
                      className="p-4 flex items-center justify-between gap-3"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,196,102,0.12), rgba(255,107,186,0.06))",
                        borderBottom: "1px solid rgba(255,196,102,0.15)",
                      }}
                    >
                      <div>
                        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/50 mb-0.5">
                          Credits
                        </p>
                        <p
                          className="font-display text-lg"
                          style={{ color: "var(--aurora-gold)" }}
                        >
                          {(credits ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        href="/topup"
                        className="btn-gold !py-1.5 !px-3 !text-[0.6rem] whitespace-nowrap"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Top Up
                      </Link>
                    </div>

                    {/* Crystal — matches profile page style */}
                    <div
                      className="p-4 flex items-center justify-between gap-3"
                      style={{
                        background: "linear-gradient(135deg, rgba(125,249,255,0.12), rgba(184,172,255,0.06))",
                      }}
                    >
                      <div>
                        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/50 mb-0.5">
                          Crystal
                        </p>
                        <p
                          className="font-display text-lg"
                          style={{ color: "var(--crystal)" }}
                        >
                          {(crystal ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        href="/dismantle"
                        className="btn-crystal !py-1.5 !px-3 !text-[0.6rem] whitespace-nowrap"
                        onClick={() => setShowUserMenu(false)}
                      >
                        Dismantle
                      </Link>
                    </div>
                  </div>
                )}
              </div>
              </>
            ) : (
              <Link
                href="/login"
                className="btn-primary hidden sm:inline-flex"
                data-testid="nav-login-btn"
              >
                Login
              </Link>
            )}

            <button
              className="lg:hidden relative w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              data-testid="nav-mobile-toggle"
            >
              <span className="sr-only">Menu</span>
              <div className="flex flex-col gap-[5px]">
                <span
                  className="block h-[1.5px] w-4 bg-white transition-transform"
                  style={{
                    transform: open
                      ? "rotate(45deg) translate(2px, 4px)"
                      : "none",
                  }}
                />
                <span
                  className="block h-[1.5px] w-4 bg-white transition-opacity"
                  style={{ opacity: open ? 0 : 1 }}
                />
                <span
                  className="block h-[1.5px] w-4 bg-white transition-transform"
                  style={{
                    transform: open
                      ? "rotate(-45deg) translate(2px, -4px)"
                      : "none",
                  }}
                />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className="lg:hidden overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: open ? "520px" : "0px" }}
        data-testid="nav-mobile-menu"
      >
        <div
          className="mx-5 mb-4 rounded-2xl p-4"
          style={{
            background: "rgba(15, 19, 36, 0.85)",
            border: "1px solid rgba(230,232,240,0.08)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex flex-col">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="flex items-center justify-between py-3 px-3 rounded-xl text-sm font-medium uppercase tracking-[0.14em] transition-colors"
                  style={{
                    color: active ? "#FFFFFF" : "rgba(230,232,240,0.72)",
                    background: active
                      ? "rgba(184,172,255,0.1)"
                      : "transparent",
                  }}
                >
                  <span>{item.label}</span>
                  <span
                    aria-hidden
                    style={{ color: "rgba(184,172,255,0.7)" }}
                  >
                    →
                  </span>
                </Link>
              );
            })}
            <div className="mt-3 pt-3 border-t border-white/10">
              {user ? (
                <>
                  <div className="text-sm text-white/70 px-3 py-2">
                    Signed in as{" "}
                    <span className="text-white font-semibold">
                      @{user.username}
                    </span>
                  </div>
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 py-3 px-3 rounded-xl text-sm font-bold uppercase tracking-[0.14em] transition-all hover:brightness-110"
                    style={{
                      color: "white",
                      background: "linear-gradient(135deg, #FF4D6D, #FF6BBA)",
                      boxShadow: "0 0 12px rgba(255,77,109,0.3)",
                      textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    }}
                    data-testid="mobile-nav-admin"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                    Admin Console
                  </Link>
                </>
              ) : (
                <Link
                  href="/login"
                  className="btn-primary w-full"
                  data-testid="mobile-nav-login-btn"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
