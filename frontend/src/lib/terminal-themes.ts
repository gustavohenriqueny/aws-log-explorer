export type TerminalThemeId =
  | "slate"
  | "vscode"
  | "matrix"
  | "dracula"
  | "monokai"
  | "nord"
  | "solarized"
  | "light";

export interface TerminalThemeConfig {
  id: TerminalThemeId;
  name: string;
  dotColor: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  divideClass: string;
  hoverClass: string;
  timeClass: string;
  serviceClass: string;
  containerClass: string;
  logLevelClasses: {
    error: string;
    warn: string;
    info: string;
    debug: string;
    none: string;
  };
}

export const TERMINAL_THEMES: Record<TerminalThemeId, TerminalThemeConfig> = {
  slate: {
    id: "slate",
    name: "Slate Dark",
    dotColor: "#0f172a",
    bgClass: "bg-slate-950",
    borderClass: "border-slate-800/90",
    textClass: "text-slate-100",
    divideClass: "divide-slate-900/80",
    hoverClass: "hover:bg-slate-900/60",
    timeClass: "text-slate-400",
    serviceClass: "text-cyan-400 font-semibold",
    containerClass: "text-slate-400",
    logLevelClasses: {
      error: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
      warn: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
      info: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
      debug: "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30",
      none: "text-slate-500 bg-slate-800/40",
    },
  },
  vscode: {
    id: "vscode",
    name: "VS Code",
    dotColor: "#1e1e1e",
    bgClass: "bg-[#1e1e1e]",
    borderClass: "border-[#333333]",
    textClass: "text-[#d4d4d4]",
    divideClass: "divide-[#2a2a2a]",
    hoverClass: "hover:bg-[#2a2d2e]",
    timeClass: "text-[#858585]",
    serviceClass: "text-[#4ec9b0] font-semibold",
    containerClass: "text-[#9cdcfe]",
    logLevelClasses: {
      error: "bg-[#5a1d1d] text-[#f48771] border border-[#f48771]/30",
      warn: "bg-[#5a481d] text-[#cca700] border border-[#cca700]/30",
      info: "bg-[#1b3d5a] text-[#75beff] border border-[#75beff]/30",
      debug: "bg-[#45275a] text-[#c586c0] border border-[#c586c0]/30",
      none: "text-[#858585] bg-[#2d2d2d]",
    },
  },
  matrix: {
    id: "matrix",
    name: "Matrix Hacker",
    dotColor: "#00ff66",
    bgClass: "bg-black",
    borderClass: "border-emerald-900/80 shadow-[0_0_15px_rgba(16,185,129,0.08)]",
    textClass: "text-emerald-400",
    divideClass: "divide-emerald-950/60",
    hoverClass: "hover:bg-emerald-950/50",
    timeClass: "text-emerald-600",
    serviceClass: "text-emerald-300 font-bold",
    containerClass: "text-emerald-700",
    logLevelClasses: {
      error: "bg-rose-950/80 text-rose-400 border border-rose-600",
      warn: "bg-amber-950/80 text-amber-300 border border-amber-600",
      info: "bg-emerald-950 text-emerald-300 border border-emerald-500",
      debug: "bg-emerald-900/40 text-emerald-400 border border-emerald-700",
      none: "text-emerald-800 bg-emerald-950/40",
    },
  },
  dracula: {
    id: "dracula",
    name: "Dracula",
    dotColor: "#bd93f9",
    bgClass: "bg-[#282a36]",
    borderClass: "border-[#44475a]",
    textClass: "text-[#f8f8f2]",
    divideClass: "divide-[#44475a]/50",
    hoverClass: "hover:bg-[#44475a]/40",
    timeClass: "text-[#6272a4]",
    serviceClass: "text-[#8be9fd] font-semibold",
    containerClass: "text-[#bd93f9]",
    logLevelClasses: {
      error: "bg-[#ff5555]/20 text-[#ff5555] border border-[#ff5555]/30",
      warn: "bg-[#ffb86c]/20 text-[#ffb86c] border border-[#ffb86c]/30",
      info: "bg-[#8be9fd]/20 text-[#8be9fd] border border-[#8be9fd]/30",
      debug: "bg-[#bd93f9]/20 text-[#bd93f9] border border-[#bd93f9]/30",
      none: "text-[#6272a4] bg-[#44475a]/30",
    },
  },
  monokai: {
    id: "monokai",
    name: "Monokai",
    dotColor: "#a6e22e",
    bgClass: "bg-[#272822]",
    borderClass: "border-[#3e3d32]",
    textClass: "text-[#f8f8f2]",
    divideClass: "divide-[#3e3d32]",
    hoverClass: "hover:bg-[#3e3d32]/60",
    timeClass: "text-[#75715e]",
    serviceClass: "text-[#a6e22e] font-semibold",
    containerClass: "text-[#66d9ef]",
    logLevelClasses: {
      error: "bg-[#f92672]/20 text-[#f92672] border border-[#f92672]/30",
      warn: "bg-[#fd971f]/20 text-[#fd971f] border border-[#fd971f]/30",
      info: "bg-[#66d9ef]/20 text-[#66d9ef] border border-[#66d9ef]/30",
      debug: "bg-[#ae81ff]/20 text-[#ae81ff] border border-[#ae81ff]/30",
      none: "text-[#75715e] bg-[#3e3d32]/50",
    },
  },
  nord: {
    id: "nord",
    name: "Nord",
    dotColor: "#88c0d0",
    bgClass: "bg-[#2e3440]",
    borderClass: "border-[#3b4252]",
    textClass: "text-[#eceff4]",
    divideClass: "divide-[#3b4252]",
    hoverClass: "hover:bg-[#3b4252]/60",
    timeClass: "text-[#4c566a]",
    serviceClass: "text-[#88c0d0] font-semibold",
    containerClass: "text-[#81a1c1]",
    logLevelClasses: {
      error: "bg-[#bf616a]/20 text-[#bf616a] border border-[#bf616a]/30",
      warn: "bg-[#ebcb8b]/20 text-[#ebcb8b] border border-[#ebcb8b]/30",
      info: "bg-[#88c0d0]/20 text-[#88c0d0] border border-[#88c0d0]/30",
      debug: "bg-[#b48ead]/20 text-[#b48ead] border border-[#b48ead]/30",
      none: "text-[#4c566a] bg-[#3b4252]/40",
    },
  },
  solarized: {
    id: "solarized",
    name: "Solarized",
    dotColor: "#268bd2",
    bgClass: "bg-[#002b36]",
    borderClass: "border-[#073642]",
    textClass: "text-[#839496]",
    divideClass: "divide-[#073642]",
    hoverClass: "hover:bg-[#073642]/60",
    timeClass: "text-[#586e75]",
    serviceClass: "text-[#268bd2] font-semibold",
    containerClass: "text-[#2aa198]",
    logLevelClasses: {
      error: "bg-[#dc322f]/20 text-[#dc322f] border border-[#dc322f]/30",
      warn: "bg-[#b58900]/20 text-[#b58900] border border-[#b58900]/30",
      info: "bg-[#268bd2]/20 text-[#268bd2] border border-[#268bd2]/30",
      debug: "bg-[#6c71c4]/20 text-[#6c71c4] border border-[#6c71c4]/30",
      none: "text-[#586e75] bg-[#073642]/50",
    },
  },
  light: {
    id: "light",
    name: "Terminal Claro",
    dotColor: "#e2e8f0",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-300 shadow-sm",
    textClass: "text-slate-800",
    divideClass: "divide-slate-200",
    hoverClass: "hover:bg-slate-200/70",
    timeClass: "text-slate-500",
    serviceClass: "text-blue-700 font-semibold",
    containerClass: "text-slate-600",
    logLevelClasses: {
      error: "bg-rose-100 text-rose-700 border border-rose-300",
      warn: "bg-amber-100 text-amber-800 border border-amber-300",
      info: "bg-sky-100 text-sky-800 border border-sky-300",
      debug: "bg-purple-100 text-purple-800 border border-purple-300",
      none: "text-slate-500 bg-slate-100",
    },
  },
};
