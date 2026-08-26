import re

with open('frontend/src/pages/Approvals.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace('import { api } from "@/lib/api";', 'import { api, API } from "@/lib/api";')
content = content.replace('} from "@/components/ui/tabs";', '} from "@/components/ui/tabs";\nimport {\n  Popover, PopoverContent, PopoverTrigger,\n} from "@/components/ui/popover";\nimport { Checkbox } from "@/components/ui/checkbox";')
content = content.replace('FileText, FileType2, MapPin, Building2, User as UserIcon, Globe,\n} from "lucide-react";', 'FileText, FileType2, MapPin, Building2, User as UserIcon, Globe, Filter,\n} from "lucide-react";')

# 2. States
state_insert = """  const [filterSite, setFilterSite] = useState([]);
  const [filterSubmitter, setFilterSubmitter] = useState([]);
  const [filterApprover, setFilterApprover] = useState([]);"""
content = content.replace('const [working, setWorking] = useState(false);', 'const [working, setWorking] = useState(false);\n\n' + state_insert)

# 3. viewPdf and filter logic
logic_insert = """  const viewPdf = async (apv) => {
    if (!apv.submission_id || apv.submission_kind !== "pdf") return;
    const toastId = toast.loading("Loading PDF...");
    try {
      const token = localStorage.getItem("ff_token");
      const r = await fetch(`${API}/pdf-submissions/${apv.submission_id}/completed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load PDF. It may have been deleted.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e.message || "Failed to load PDF");
    }
  };

  const uniqueSites = [...new Set(items.map(i => i.site_name).filter(Boolean))].sort();
  const uniqueSubmitters = [...new Set(items.map(i => i.submitted_by_name || i.submitted_by_email).filter(Boolean))].sort();
  const uniqueApprovers = [...new Set(items.flatMap(i => i.approvers || []).filter(Boolean))].sort();

  const filteredItems = items.filter(apv => {
    if (filterSite.length > 0 && !filterSite.includes(apv.site_name)) return false;
    const subName = apv.submitted_by_name || apv.submitted_by_email;
    if (filterSubmitter.length > 0 && !filterSubmitter.includes(subName)) return false;
    if (filterApprover.length > 0) {
      const apvList = apv.approvers || [];
      if (!filterApprover.some(a => apvList.includes(a))) return false;
    }
    return true;
  });"""
content = content.replace('  return (\n    <AppLayout>', logic_insert + '\n\n  return (\n    <AppLayout>')

# 4. Filter UI
tabs_ui = """        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList data-testid="approvals-tabs">
              <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown label="Site" options={uniqueSites} selected={filterSite} onChange={setFilterSite} />
              <FilterDropdown label="Submitter" options={uniqueSubmitters} selected={filterSubmitter} onChange={setFilterSubmitter} />
              <FilterDropdown label="Approver" options={uniqueApprovers} selected={filterApprover} onChange={setFilterApprover} />
            </div>
          </div>"""
content = re.sub(r'<Tabs value=\{tab\} onValueChange=\{setTab\}>\s*<TabsList data-testid="approvals-tabs">.*?<\/TabsList>', tabs_ui, content, flags=re.DOTALL)

# 5. filteredItems replace
content = content.replace('items.length === 0', 'filteredItems.length === 0')
content = content.replace('items.map((apv)', 'filteredItems.map((apv)')

# 6. View PDF button UI
pdf_ui = """                  <Info label="Submission">
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{selected.submission_id || "—"}</code>
                      {selected.submission_kind === "pdf" && selected.submission_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 py-0 border-slate-200"
                          onClick={() => viewPdf(selected)}
                        >
                          View PDF
                        </Button>
                      )}
                    </div>
                  </Info>"""
content = content.replace("""                  <Info label="Submission">
                    <code className="text-xs">{selected.submission_id || "—"}</code>
                  </Info>""", pdf_ui)

# 7. Append FilterDropdown component
filter_comp = """
function FilterDropdown({ label, options, selected, onChange }) {
  const opts = options || [];
  const count = (selected || []).length;
  
  const toggle = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(x => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed flex gap-2">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs">{label}</span>
          {count > 0 && (
            <span className="border-l border-slate-200 pl-2 text-xs font-semibold">{count}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="p-3 border-b text-xs font-medium text-slate-500 bg-slate-50">
          Filter by {label}
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
          {opts.length === 0 ? (
            <div className="text-xs text-slate-400 p-2 text-center">No options available</div>
          ) : (
            opts.map(opt => {
              const isChecked = selected.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                  <Checkbox checked={isChecked} onCheckedChange={() => toggle(opt)} />
                  <span className="text-sm truncate" title={opt}>{opt}</span>
                </label>
              );
            })
          )}
        </div>
        {count > 0 && (
          <div className="p-2 border-t bg-slate-50">
            <Button variant="ghost" size="sm" className="w-full h-8 text-xs text-slate-500" onClick={() => onChange([])}>
              Clear filters
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
"""
content += filter_comp

with open('frontend/src/pages/Approvals.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
