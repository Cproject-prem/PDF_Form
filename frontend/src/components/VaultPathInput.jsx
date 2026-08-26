import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FolderPlus, AlertCircle, CheckCircle2 } from "lucide-react";

export default function VaultPathInput({ value, onChange, placeholder = "/Reports/TBT", labelClass="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" }) {
  const [path, setPath] = useState(value || "");
  const [status, setStatus] = useState("idle"); // idle, checking, exists, missing, creating, error
  const [lastChecked, setLastChecked] = useState("");

  useEffect(() => {
    setPath(value || "");
  }, [value]);

  useEffect(() => {
    const p = path.trim();
    if (!p) {
      setStatus("idle");
      return;
    }
    if (p === lastChecked) return;

    const timer = setTimeout(() => {
      checkPath(p);
    }, 500);
    return () => clearTimeout(timer);
  }, [path, lastChecked]);

  const checkPath = async (p) => {
    setStatus("checking");
    try {
      const res = await api.get(`/plant-docs/plants/check-vault-path?path=${encodeURIComponent(p)}`);
      setStatus(res.data.exists ? "exists" : "missing");
      setLastChecked(p);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  const handleCreate = async () => {
    setStatus("creating");
    try {
      const res = await api.post(`/plant-docs/plants/ensure-vault-path`, { path: path.trim() });
      toast.success(`Created ${res.data.path} in ${res.data.plants_updated} plant(s)`);
      setStatus("exists");
      setLastChecked(path.trim());
    } catch (e) {
      const msg = e.response?.data?.detail || "Failed to create folder";
      toast.error(msg);
      setStatus("error");
    }
  };

  const handleChange = (e) => {
    const newVal = e.target.value;
    setPath(newVal);
    if (onChange) onChange(newVal);
  };

  return (
    <div className="space-y-2">
      <Label className={labelClass}>Document Vault Path (Auto-save)</Label>
      <div className="relative">
        <Input
          value={path}
          onChange={handleChange}
          placeholder={placeholder}
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          {status === "checking" && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-slate-500"></span></span>}
          {status === "exists" && <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Path exists in template" />}
          {status === "error" && <AlertCircle className="w-4 h-4 text-red-500" title="Error checking path" />}
        </div>
      </div>
      
      {status === "missing" && path.trim() && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Path <strong>{path}</strong> doesn't exist in plant vaults.</span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 border-amber-300 hover:bg-amber-100 text-amber-900 shrink-0 bg-white"
            onClick={handleCreate}
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1" />
            Create
          </Button>
        </div>
      )}
      
      {status === "creating" && (
        <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>
          Creating folder across all plants...
        </div>
      )}
      
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Submissions will automatically be saved as PDFs to this path in the Plant Docs vault. <br/>
        Example: <code className="bg-slate-100 px-1 rounded">/Reports/TBT</code>
      </p>
    </div>
  );
}
