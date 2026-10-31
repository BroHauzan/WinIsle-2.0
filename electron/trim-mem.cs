using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace WinIsleMemoryTrimmer {
    class Program {
        [DllImport("psapi.dll")]
        static extern int EmptyWorkingSet(IntPtr hw);

        [DllImport("kernel32.dll")]
        static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);

        static void Trim(Process p) {
            try {
                EmptyWorkingSet(p.Handle);
                SetProcessWorkingSetSize(p.Handle, -1, -1);
            } catch {}
        }

        static void Main(string[] args) {
            try {
                int dummy;
                if (args.Length > 0 && int.TryParse(args[0], out dummy)) {
                    foreach (string arg in args) {
                        int id;
                        if (int.TryParse(arg, out id)) {
                            try { Trim(Process.GetProcessById(id)); } catch {}
                        }
                    }
                    return;
                }

                string targetName = args.Length > 0 ? args[0] : "WinIsle";
                Process[] procs = Process.GetProcessesByName(targetName);
                foreach (Process p in procs) {
                    Trim(p);
                }

                if (targetName.Equals("WinIsle", StringComparison.OrdinalIgnoreCase)) {
                    Process[] devProcs = Process.GetProcessesByName("electron");
                    foreach (Process p in devProcs) {
                        Trim(p);
                    }
                }
            } catch {}
        }
    }
}
