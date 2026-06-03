"use client";

import { useEffect, useState } from "react";
import { Moon, Palette, Sun } from "lucide-react";

type Theme = "light" | "dark";
type ColorPlate = "indigo" | "teal" | "blue" | "green";

const COLOR_PLATES: Array<{ id: ColorPlate; label: string }> = [
  { id: "indigo", label: "Indigo" },
  { id: "teal", label: "Teal" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [colorPlate, setColorPlate] = useState<ColorPlate>("indigo");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const savedPlate = localStorage.getItem("color-plate") as ColorPlate | null;
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initial = saved ?? sys;
    const initialPlate = COLOR_PLATES.some((plate) => plate.id === savedPlate) ? savedPlate! : "indigo";
    setTheme(initial);
    setColorPlate(initialPlate);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.dataset.colorPlate = initialPlate;
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  function changeColorPlate(next: ColorPlate) {
    setColorPlate(next);
    localStorage.setItem("color-plate", next);
    document.documentElement.dataset.colorPlate = next;
  }

  return (
    <div className="flex items-center gap-1">
      <label className="relative flex items-center" title="Choose platform color plate">
        <Palette className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-500 dark:text-slate-300" />
        <select
          aria-label="Platform color plate"
          value={colorPlate}
          onChange={(event) => changeColorPlate(event.target.value as ColorPlate)}
          className="h-7 w-[82px] appearance-none rounded-md border border-white/10 bg-white/5 py-1 pl-7 pr-2 text-[11px] font-medium text-white/80 outline-none hover:bg-white/10 focus:border-white/20"
          className="h-8 appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          {COLOR_PLATES.map((plate) => <option key={plate.id} value={plate.id}>{plate.label}</option>)}
        </select>
      </label>
      <button onClick={toggle} aria-label="Toggle theme"
        className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </div>
  );
}
