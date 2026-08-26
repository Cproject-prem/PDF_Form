import React, { useState, useRef, useEffect, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchableDropdown({
  options = [],
  value = "",
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
  style,
  testId,
  fontSize,
  fontColor,
  textAlign,
  multi = false,
  allowClear = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open]);

  // Case-insensitive filtering of options based on search query
  const filteredOptions = useMemo(() => {
    const list = Array.isArray(options) ? options : [];
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter((opt) => {
      const text = typeof opt === "object" && opt !== null ? String(opt.label || opt.value || "") : String(opt ?? "");
      return text.toLowerCase().includes(q);
    });
  }, [options, search]);

  const getOptValue = (opt) => typeof opt === "object" && opt !== null ? String(opt.value) : String(opt);
  const getOptLabel = (opt) => typeof opt === "object" && opt !== null ? String(opt.label || opt.value) : String(opt);

  const selectedText = useMemo(() => {
    if (multi) {
      if (!Array.isArray(value) || value.length === 0) return "";
      return value.map(v => {
        const found = (Array.isArray(options) ? options : []).find(o => getOptValue(o) === String(v));
        return found ? getOptLabel(found) : String(v);
      }).join(", ");
    }
    if (value === null || value === undefined || value === "") return "";
    const found = (Array.isArray(options) ? options : []).find(o => getOptValue(o) === String(value));
    return found ? getOptLabel(found) : String(value);
  }, [value, multi, options]);

  const fontColorClean = (fontColor || "").trim().toLowerCase();
  const isDefaultDarkColor = !fontColorClean || ["#000000", "#000", "#111827", "#1e293b", "#0f172a", "black"].includes(fontColorClean);
  const effectiveFontColor = !isDefaultDarkColor ? fontColor : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          style={style}
          className={cn(
            "w-full h-full bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 flex items-center justify-between gap-1 text-left select-none overflow-hidden text-slate-900 dark:text-slate-100",
            disabled && "opacity-60 cursor-not-allowed pointer-events-none",
            className
          )}
        >
          <span
            className={cn(
              "truncate flex-1",
              selectedText ? "text-slate-900 dark:text-slate-100 font-medium" : "text-slate-500 dark:text-slate-300"
            )}
            style={{
              fontSize: fontSize || "12px",
              color: effectiveFontColor,
              textAlign: textAlign || "left",
            }}
          >
            {selectedText || placeholder}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-300" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 rounded-lg z-[100] flex flex-col gap-2 text-slate-900 dark:text-slate-100"
        style={{ minWidth: "220px" }}
      >
        {/* Search Input Filter */}
        <div className="relative flex items-center border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50 dark:bg-slate-800 px-2 py-1 focus-within:ring-1 focus-within:ring-blue-500 focus-within:bg-white dark:focus-within:bg-slate-900">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Scrollable Options List */}
        <div className="max-h-60 overflow-y-auto pr-1 space-y-0.5 nice-scroll">
          {/* Reset / Select... option (Only rendered if allowClear is explicitly true) */}
          {allowClear && !multi && (
            <div
              className={cn(
                "px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center justify-between text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100",
                !selectedText && "font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/30"
              )}
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
            >
              <span>{placeholder}</span>
              {!selectedText && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-xs text-slate-400 text-center italic">
              No matching options found.
            </div>
          ) : (
            filteredOptions.map((opt, i) => {
              const strVal = getOptValue(opt);
              const strLbl = getOptLabel(opt);
              const isSelected = multi ? (Array.isArray(value) && value.includes(strVal)) : selectedText === strLbl;
              return (
                <div
                  key={i}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center justify-between text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                    isSelected && "font-semibold bg-blue-50 text-blue-700"
                  )}
                  onClick={() => {
                    if (multi) {
                      const arr = Array.isArray(value) ? [...value] : [];
                      if (arr.includes(strVal)) {
                        onChange?.(arr.filter(x => x !== strVal));
                      } else {
                        onChange?.([...arr, strVal]);
                      }
                    } else {
                      onChange?.(strVal);
                      setOpen(false);
                    }
                  }}
                >
                  <span className="truncate flex-1 mr-2">{strLbl}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
