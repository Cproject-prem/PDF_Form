import React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { getErrorMessage } from "@/lib/api";

function sanitizeToastArgs(msg, data) {
  let cleanMsg = msg;
  if (msg && typeof msg === "object" && !React.isValidElement(msg)) {
    cleanMsg = getErrorMessage(msg);
  }
  return [cleanMsg, data];
}

const safeToast = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast(m, d);
};

safeToast.error = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast.error(m, d);
};
safeToast.success = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast.success(m, d);
};
safeToast.info = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast.info(m, d);
};
safeToast.warning = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast.warning(m, d);
};
safeToast.loading = (msg, data) => {
  const [m, d] = sanitizeToastArgs(msg, data);
  return sonnerToast.loading(m, d);
};
safeToast.dismiss = (...args) => sonnerToast.dismiss(...args);
safeToast.custom = (...args) => sonnerToast.custom(...args);
safeToast.promise = (...args) => sonnerToast.promise(...args);

const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, safeToast as toast };
