"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SupportFloatingButton from "./SupportFloatingButton";
import SupportPanel from "./SupportPanel";
import SupportForm from "./SupportForm";
import SupportSuccess from "./SupportSuccess";
import { getSupporterCount, submitSupporter } from "@/lib/supporters";

type ViewState = "form" | "success" | "duplicate";

export default function SupportGachard() {
  const [count, setCount] = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("form");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getSupporterCount().then((c) => {
      setCount(c);
      setCountLoaded(true);
    });
  }, []);

  const handleSubmit = useCallback(
    async (email: string, message: string, honeypot: string) => {
      setIsLoading(true);
      setError(null);
      const result = await submitSupporter(email, message, honeypot);
      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setCount(result.count);
      if (result.duplicate) {
        setIsDuplicate(true);
        setViewState("duplicate");
      } else {
        setIsDuplicate(false);
        setViewState("success");
      }
    },
    []
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      setViewState("form");
      setError(null);
      buttonRef.current?.focus();
    }, 300);
  }, []);

  const handleDone = useCallback(() => {
    handleClose();
  }, [handleClose]);

  return (
    <>
      <SupportFloatingButton
        ref={buttonRef}
        count={count}
        countLoaded={countLoaded}
        onClick={() => setIsOpen(true)}
      />
      <SupportPanel isOpen={isOpen} onClose={handleClose}>
        {viewState === "form" && (
          <SupportForm
            count={count}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />
        )}
        {(viewState === "success" || viewState === "duplicate") && (
          <SupportSuccess
            count={count}
            isDuplicate={isDuplicate}
            onDone={handleDone}
          />
        )}
      </SupportPanel>
    </>
  );
}
