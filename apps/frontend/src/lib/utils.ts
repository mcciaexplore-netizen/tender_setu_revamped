import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Untyped JSON returned by the API. The backend responses are not modelled
 * with shared types yet, so this keeps that looseness explicit in one place.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRecord = any;

/** Safely reads a message from a caught value of unknown type. */
export function getErrorMessage(err: unknown, fallback = ""): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
