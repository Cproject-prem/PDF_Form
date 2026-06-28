import React from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";

/**
 * Vertical thumbnail strip. Click a thumb to scroll to that page in the canvas.
 */
export default function PdfThumbnails({ fileUrl, currentPage, onJump }) {
  const [n, setN] = React.useState(0);
  const file = React.useMemo(() => authPdfFile(fileUrl), [fileUrl]);
  return (
    <aside className="w-32 shrink-0 border-r border-slate-200 bg-slate-50/60 overflow-y-auto nice-scroll">
      <div className="p-2 sticky top-0 bg-slate-50/95 backdrop-blur z-10 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 text-center">Pages</div>
      </div>
      <div className="p-2 space-y-3">
        <Document file={file} onLoadSuccess={({ numPages }) => setN(numPages)} loading={null}>
          {Array.from({ length: n }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              data-testid={`pdf-thumb-${p}`}
              onClick={() => onJump(p)}
              className={`block mx-auto rounded border-2 transition-all overflow-hidden ${
                currentPage === p ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-400"
              } bg-white`}
            >
              <Page pageNumber={p} width={96} renderTextLayer={false} renderAnnotationLayer={false} />
              <div className={`text-[10px] py-0.5 ${currentPage === p ? "bg-blue-500 text-white" : "bg-white text-slate-500"}`}>
                Page {p}
              </div>
            </button>
          ))}
        </Document>
      </div>
    </aside>
  );
}
