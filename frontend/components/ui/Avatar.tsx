"use client";
import Image from "next/image";
import { colorFor, initials } from "@/lib/avatar";

interface Props {
  id: string;
  name: string;
  avatarUrl?: string | null;
  size?: number;
}

export function Avatar({ id, name, avatarUrl, size = 56 }: Props) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  const bg = colorFor(id);
  return (
    <div
      className="flex items-center justify-center rounded-full font-[var(--font-display)] font-bold text-white"
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
  );
}
