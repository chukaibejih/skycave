"use client";
import { useEffect } from "react";
import { useChampion } from "@/lib/store";

/**
 * Hydrates the reigning-champion store once, app-wide. Mounted in the root
 * layout so the crown the Avatar draws is correct on every page without each
 * page having to fetch it. Renders nothing.
 */
export function ChampionInit() {
  useEffect(() => {
    useChampion.getState().hydrate();
  }, []);
  return null;
}
