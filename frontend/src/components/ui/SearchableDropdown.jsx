import React, { useState, useRef, useEffect, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchableDropdown({
  options = [],
  value = "",
  onChange,
  placeholder = "Select…",
  disabled = false,
  className,
  style,
  testId,
  fontSize,
  fontColor,
  textAlign,
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
    return list.filter((opt) => String(opt ?? "").toLowerCase().includes(q));
  }, [options, search]);

  const selectedText = value !== null && value !== undefined && value !== "" ? String(value) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          style={style}
          className={cn(
            "w-full h-full bg-white border border-blue-500 rounded px-1.5 outline-none focus:ring-2 focus:ring-blue-300 flex items-center justify-between gap-1 text-left select-none overflow-hidden",
            disabled && "opacity-60 cursor-not-allowed pointer-events-none",
            className
          )}
        >
          <span
            className="truncate flex-1"
            style={{
              fontSize: fontSize || undefined,
              color: selectedText ? (fontColor || "#111827") : "#9CA3AF",
              textAlign: textAlign || "left",
            }}
          >
            {selectedText || placeholder}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2 bg-white shadow-xl border border-slate-200 rounded-lg z-[100] flex flex-col gap-2"
        style={{ minWidth: "220px" }}
      >
        {/* Search Input Filter */}
        <div className="relative flex items-center border border-slate-200 rounded-md bg-slate-50 px-2 py-1 focus-within:ring-1 focus-within:ring-blue-500 focus-within:bg-white">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="Type 2-3 letters to search…"
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
              className="text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Scrollable Options List */}
        <div className="max-h-60 overflow-y-auto pr-1 space-y-0.5 nice-scroll">
          {/* Reset / Select... option */}
          <div
            className={cn(
              "px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center justify-between text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              !selectedText && "font-semibold text-blue-600 bg-blue-50/50"
            )}
            onClick={() => {
              onChange?.("");
              setOpen(false);
            }}
          >
            <span>{placeholder}</span>
            {!selectedText && <Check className="w-3.5 h-3.5 text-blue-600" />}
          </div>

          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-xs text-slate-400 text-center italic">
              No matching options found.
            </div>
          ) : (
            filteredOptions.map((opt, i) => {
              const isSelected = selectedText === String(opt);
              return (
                <div
                  key={i}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center justify-between text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                    isSelected && "font-semibold bg-blue-50 text-blue-700"
                  )}
                  onClick={() => {
                    onChange?.(String(opt));
                    setOpen(false);
                  }}
                >
                  <span className="truncate flex-1 mr-2">{String(opt)}</span>
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
