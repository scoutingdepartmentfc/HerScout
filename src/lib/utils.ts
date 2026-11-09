import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Soccerdonna "End of career": pipeline/traducciones.py stores it as the player's current club
export const isRetired = (player?: { fm_team_name?: string | null } | null) => player?.fm_team_name === "Retired";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
