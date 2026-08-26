import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("ff_theme") || "light";
  });

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (targetTheme) => {
      let activeDark = false;
      if (targetTheme === "system") {
        activeDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      } else {
        activeDark = targetTheme === "dark";
      }

      setIsDark(activeDark);
      if (activeDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyTheme(theme);
    localStorage.setItem("ff_theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const setTheme = (mode) => {
    setThemeState(mode);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
