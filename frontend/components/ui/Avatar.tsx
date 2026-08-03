"use client";
import Image from "next/image";
import { colorFor, initials } from "@/lib/avatar";

interface Props {
  id: string;
  name: string;
  avatarUrl?: string | null;
  size?: number;
}

import { motion } from "framer-motion";

export function Avatar({ id, name, avatarUrl, size = 56 }: Props) {
  // MOCK: Checking if this is the reigning champion (production API not deployed)
  const isChampion = id === "itssxjae.blacksky.app" || id === "did:plc:feg3vkiuvs54g5a7xxkl4n5c";
  
  const crown = isChampion && (
    <div 
      className="pointer-events-none absolute z-20 text-[var(--color-gold)] drop-shadow-md"
      style={{
        top: -size * 0.15,
        right: -size * 0.08,
        transform: "rotate(15deg)",
      }}
    >
      <svg width={Math.max(16, size * 0.4)} height={Math.max(16, size * 0.4)} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
      </svg>
    </div>
  );

  const championRing = isChampion ? "ring-2 ring-[var(--color-gold)] ring-offset-[1.5px] ring-offset-[#05060a]" : "";

  if (avatarUrl) {
    return (
      <div className="relative inline-flex items-center justify-center">
        {crown}
        <Image
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          className={`rounded-full object-cover ${championRing}`}
          style={{ width: size, height: size }}
          unoptimized
        />
      </div>
    );
  }
  const bg = colorFor(id);
  return (
    <div className="relative inline-flex items-center justify-center">
      {crown}
      <div
        className={`flex items-center justify-center rounded-full font-[var(--font-display)] font-bold text-white ${championRing}`}
        style={{
          width: size,
          height: size,
          background: bg,
          fontSize: size * 0.38,
        }}
        aria-label={name}
      >
        {initials(name)}
      </div>
    </div>
  );
}
