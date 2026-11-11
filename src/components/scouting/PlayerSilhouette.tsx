import React from "react";

export function PlayerSilhouette({
  className = "w-full h-full text-slate-400/80",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="10 8 44 48"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Silueta femenina de busto/cabeza con coleta recogida ocupando el encuadre completo */}
      {/* Coleta / ponytail lateral recogida */}
      <path
        d="M23 20 C18 19, 14 24, 15 31 C15.5 35, 18 39, 21 42 C20 38, 20.5 31, 23 27 Z"
        opacity="0.85"
      />
      {/* Cabeza y cuello contorno femenino */}
      <path d="M32 10 C24 10, 20 16, 20 23 C20 27, 22 30, 24 33 C25.5 35, 27 38, 28 40 C27 42, 23 44, 20 46 C16 48.5, 12 52, 11 56 L53 56 C52 52, 48 48.5, 44 46 C41 44, 37 42, 36 40 C37 38, 38.5 35, 40 33 C42 30, 44 27, 44 23 C44 16, 40 10, 32 10 Z" />
    </svg>
  );
}
