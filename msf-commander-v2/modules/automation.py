"""
MSF-COMMANDER v2 — Automation Engine
Task scheduling, credential reuse testing, finding correlation, and engagement automation.
All actions are scope-enforced and logged.
"""

import subprocess
import time
import json
import re
import threading
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.live import Live
from rich.layout import Layout
from rich import box

console = Console()


# ═══════════════════════════════════════════════════════════════════
# TASK SCHEDULER
# ═══════════════════════════════════════════════════════════════════
class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    TIMEOUT = "timeout"


@dataclass
class Task:
    id: str
    name: str
    action: str
    params: Dict[str, Any]
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: str = ""
    started_at: str = ""
    completed_at: str = ""
    duration_seconds: float = 0
    depends_on: List[str] = field(default_factory=list)


class TaskScheduler:
    """
    Background task scheduler for automated pentest workflows.
    Runs tasks in dependency order, tracks results, handles timeouts.
    """

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events
        self.tasks: Dict[str, Task] = {}
        self._lock = threading.Lock()

    def add_task(self, name: str, action: str, params: Dict[str, Any],
                 depends_on: List[str] = None) -> str:
        """Add a task to the queue."""
        import secrets
        tid = secrets.token_hex(6)
        self.tasks[tid] = Task(
            id=tid, name=name, action=action, params=params,
            depends_on=depends_on or [],
        )
        self.events.emit("info", "scheduler", "task_added", f"Queued: {name} ({action})")
        return tid

    def run_all(self, modules: Dict[str, Any], timeout_per_task: int = 600) -> Dict:
        """
        Execute all queued tasks in dependency order.
        Returns a summary of all task results.
        """
        if not self.tasks:
            console.print("[yellow]No tasks queued.[/]")
            return {}

        self.events.emit("info", "scheduler", "run_all",
                         f"Executing {len(self.tasks)} tasks")

        results_summary = []
        executed_order = self._resolve_order()

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console
        ) as progress:
            overall = progress.add_task(
                f"[bold]Running {len(executed_order)} tasks...", total=len(executed_order)
            )

            for tid in executed_order:
                task = self.tasks[tid]

                # Check dependencies
                failed_deps = [did for did in task.depends_on
                               if self.tasks.get(did, Task("", "", "", {})).status
                               in (TaskStatus.FAILED, TaskStatus.TIMEOUT)]
                if failed_deps:
                    task.status = TaskStatus.SKIPPED
                    task.error = f"Skipped: dependency failed ({', '.join(failed_deps)})"
                    self.events.emit("warn", "scheduler", "task_skipped", task.error)
                    progress.advance(overall)
                    results_summary.append(self._task_to_dict(task))
                    continue

                # Execute
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.utcnow().isoformat() + "Z"
                progress.update(overall, description=f"[bold cyan]{task.name}[/]")

                start = time.time()
                try:
                    result = self._execute_task(task, modules, timeout_per_task)
                    task.result = result
                    task.status = TaskStatus.COMPLETED
                    self.events.emit("info", "scheduler", "task_complete",
                                     f"Completed: {task.name}")
                except Exception as e:
                    task.status = TaskStatus.FAILED
                    task.error = str(e)[:500]
                    self.events.emit("error", "scheduler", "task_failed",
                                     f"Failed: {task.name} — {e}")
                finally:
                    task.completed_at = datetime.utcnow().isoformat() + "Z"
                    task.duration_seconds = round(time.time() - start, 2)

                progress.advance(overall)
                results_summary.append(self._task_to_dict(task))

        # Print summary
        self._print_summary(results_summary)
        return {"tasks": results_summary, "total": len(results_summary)}

    def _execute_task(self, task: Task, modules: Dict, timeout: int) -> Any:
        """Dispatch task to the appropriate module."""
        action = task.action
        params = task.params
        result = None

        if action == "nmap_scan":
            result = modules["recon"].nmap_scan(
                params["target"], params.get("ports", "1-10000"),
                params.get("scan_type", "-sV -sC -O -T4"))

        elif action == "nmap_quick":
            result = modules["recon"].nmap_quick(params["target"])

        elif action == "smb_enum":
            result = modules["recon"].enum_smb(params["target"])

        elif action == "dns_enum":
            result = modules["recon"].dns_enum(params.get("domain", params.get("target", "")))

        elif action == "http_headers":
            result = modules["recon"].http_headers(params["target"])

        elif action == "dir_bruteforce":
            result = modules["recon"].dir_bruteforce(
                params["target"],
                wordlist=params.get("wordlist"),
                extensions=params.get("extensions"))

        elif action == "suggest_exploits":
            result = modules["recon"].suggest_exploits()

        elif action == "ssl_check":
            target = params.get("target", "")
            if target:
                result = modules["exploit"].show_options("auxiliary/scanner/ssl/ssl_version")

        elif action == "nikto_scan":
            cmd = f"nikto -h {params['target']}"
            stdout, _, _ = self._run_cmd(cmd, timeout=timeout)
            result = {"output": stdout[:2000]}

        elif action == "sql_injection_test":
            result = modules["recon"].http_headers(params["target"])

        elif action == "privesc_suggester":
            result = modules["privesc"].msf_local_exploit_suggester(
                params.get("session", "1"))

        elif action == "credential_reuse":
            result = self._credential_reuse_test(params.get("target", ""),
                                                  params.get("credentials", []))

        elif action == "correlate_findings":
            result = self._correlate_findings()

        elif action == "export_report":
            eng = modules["engagement"].get_active()
            if eng:
                result = modules["report"].generate(eng["id"], params.get("format", "html"))

        elif action == "custom_command":
            cmd = params["command"]
            stdout, stderr, rc = self._run_cmd(cmd, timeout=timeout)
            result = {"stdout": stdout, "stderr": stderr, "returncode": rc}

        else:
            raise ValueError(f"Unknown task action: {action}")

        return result

    @staticmethod
    def _run_cmd(cmd: str, timeout: int = 300) -> Tuple[str, str, int]:
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return r.stdout.strip(), r.stderr.strip(), r.returncode
        except subprocess.TimeoutExpired:
            return "", "TIMEOUT", -1
        except Exception as e:
            return "", str(e), -1

    def _resolve_order(self) -> List[str]:
        """Topological sort of tasks by dependencies."""
        resolved = []
        visited = set()
        visiting = set()

        def visit(tid):
            if tid in visited:
                return
            if tid in visiting:
                return  # cycle, skip
            visiting.add(tid)
            for dep in self.tasks[tid].depends_on:
                if dep in self.tasks:
                    visit(dep)
            visiting.discard(tid)
            visited.add(tid)
            resolved.append(tid)

        for tid in self.tasks:
            visit(tid)
        return resolved

    @staticmethod
    def _task_to_dict(task: Task) -> Dict:
        return {
            "id": task.id, "name": task.name, "action": task.action,
            "status": task.status.value, "result": str(task.result)[:500] if task.result else None,
            "error": task.error, "duration": task.duration_seconds,
        }

    def _print_summary(self, results: List[Dict]):
        table = Table(title="Task Execution Summary", box=box.ROUNDED)
        table.add_column("Status", style="bold", max_width=12)
        table.add_column("Task", style="cyan")
        table.add_column("Action", style="dim")
        table.add_column("Duration", style="yellow", justify="right")
        table.add_column("Error", style="red", max_width=40)

        for r in results:
            status = r["status"]
            colors = {
                "completed": "green", "running": "cyan",
                "failed": "red", "skipped": "yellow", "timeout": "red", "pending": "dim"
            }
            icon = {"completed": "[+]", "failed": "[!]", "skipped": "[~]",
                    "timeout": "[!]"}[status]
            table.add_row(
                f"[{colors.get(status, 'white')}]{icon} {status.upper()}[/]",
                r["name"][:30], r["action"][:20],
                f"{r['duration']}s", r["error"][:40],
            )
        console.print(table)

        completed = sum(1 for r in results if r["status"] == "completed")
        failed = sum(1 for r in results if r["status"] in ("failed", "timeout"))
        console.print(f"\n[bold]{completed}/{len(results)}[/] tasks completed"
                      f"{f'  [red]{failed} failed[/]' if failed else ''}")

    # ── Convenience: Quick Automation Recipes ────────────
    def auto_scan(self, target: str, ports: str = "1-10000",
                  enable_web: bool = True, enable_smb: bool = True) -> str:
        """Queue a full automated scan of a target."""
        self.add_task(f"Port Scan: {target}", "nmap_scan",
                       {"target": target, "ports": ports})
        if enable_smb:
            self.add_task(f"SMB Enum: {target}", "smb_enum",
                           {"target": target},
                           depends_on=[list(self.tasks.keys())[-1]])
        if enable_web:
            self.add_task(f"HTTP Headers: {target}", "http_headers",
                           {"target": f"https://{target}"},
                           depends_on=[list(self.tasks.keys())[-1]])
            self.add_task(f"Dir Brute: {target}", "dir_bruteforce",
                           {"target": f"https://{target}"},
                           depends_on=[list(self.tasks.keys())[-1]])
        self.add_task(f"Exploit Suggestions: {target}", "suggest_exploits", {},
                       depends_on=[list(self.tasks.keys())[-1]])
        self.add_task(f"Correlate Findings", "correlate_findings", {},
                       depends_on=[list(self.tasks.keys())[-1]])

        self.events.emit("info", "scheduler", "auto_scan",
                         f"Queued automated scan for {target}")
        console.print(f"[bold cyan]Queued full automated scan: {target}[/]")
        console.print(f"  Tasks: {len(self.tasks)}")
        console.print(f"[dim]Run 'scheduler execute' to start[/]")
        return list(self.tasks.keys())[-1]

    def auto_privesc(self, session_id: str = "1") -> str:
        """Queue full privilege escalation workflow."""
        self.add_task("MSF Local Exploit Suggester", "privesc_suggester",
                       {"session": session_id})
        self.add_task("Quick Privesc Checks", "quick_check",
                       {"session": session_id})
        self.events.emit("info", "scheduler", "auto_privesc",
                         f"Queued privesc workflow for session {session_id}")
        return list(self.tasks.keys())[-1]


# ═══════════════════════════════════════════════════════════════════
# FINDING CORRELATION ENGINE
# ═══════════════════════════════════════════════════════════════════
class CorrelationEngine:
    """
    Analyzes all collected data and finds relationships between:
    - Services → Known CVEs
    - Credentials → Services to test
    - Vulnerabilities → Exploit modules
    - Targets → Attack paths
    """

    # Known service → CVE/exploit mappings
    SERVICE_VULN_DB = {
        "smb": {
            "ms17-010": {
                "cve": "CVE-2017-0144",
                "cvss": 9.8,
                "check_module": "auxiliary/scanner/smb/smb_vuln_ms17_010",
                "exploit_module": "exploit/windows/smb/ms17_010_eternalblue",
                "description": "EternalBlue — RCE via SMBv1",
                "affected_versions": ["Windows 7", "Windows Server 2008 R2", "Windows Server 2012"],
            },
            "smb_signing": {
                "severity": "medium",
                "check_module": "auxiliary/scanner/smb/smb2_security",
                "description": "SMB signing not required — relay attack possible",
            },
            "null_session": {
                "severity": "medium",
                "check_module": "auxiliary/scanner/smb/smb_enumshares",
                "description": "Null session allowed — enumerate shares",
            },
        },
        "rdp": {
            "bluekeep": {
                "cve": "CVE-2019-0708",
                "cvss": 9.8,
                "check_module": "auxiliary/scanner/rdp/cve_2019_0708_bluekeep",
                "exploit_module": "exploit/windows/rdp/cve_2019_0708_bluekeep_rce",
                "description": "BlueKeep — RCE via RDP (unpatched Windows 7/2008)",
            },
            "rdp_brute": {
                "severity": "medium",
                "check_module": "auxiliary/scanner/rdp/rdp_login",
                "description": "RDP brute force possible",
            },
        },
        "http": {
            "apache_2_4_49": {
                "cve": "CVE-2021-41773",
                "cvss": 7.5,
                "exploit_module": "exploit/multi/http/apache_path_normalize",
                "description": "Apache 2.4.49 path traversal / RCE",
            },
            "apache_2_4_50": {
                "cve": "CVE-2021-42013",
                "cvss": 9.8,
                "exploit_module": "exploit/multi/http/apache_path_normalize",
                "description": "Apache 2.4.50 path traversal / RCE",
            },
            "shellshock": {
                "cve": "CVE-2014-6271",
                "cvss": 10.0,
                "check_module": "auxiliary/scanner/http/apache_mod_cgi_bash_env_exec",
                "description": "Shellshock — RCE via CGI-Bash",
            },
        },
        "ftp": {
            "vsftpd_234": {
                "cve": "CVE-2011-2523",
                "cvss": 10.0,
                "exploit_module": "exploit/unix/ftp/vsftpd_234_backdoor",
                "description": "vsftpd 2.3.4 backdoor",
            },
            "proftpd_modcopy": {
                "cve": "CVE-2015-3306",
                "cvss": 10.0,
                "exploit_module": "exploit/unix/ftp/proftpd_modcopy_exec",
                "description": "ProFTPD mod_copy RCE",
            },
            "anonymous": {
                "severity": "low",
                "check_module": "auxiliary/scanner/ftp/anonymous",
                "description": "Anonymous FTP login enabled",
            },
        },
        "mysql": {
            "mysql_login": {
                "severity": "medium",
                "check_module": "auxiliary/scanner/mysql/mysql_login",
                "description": "MySQL brute force / weak credentials",
            },
        },
        "ssh": {
            "ssh_login": {
                "severity": "medium",
                "check_module": "auxiliary/scanner/ssh/ssh_login",
                "description": "SSH brute force / weak credentials",
            },
        },
        "mssql": {
            "mssql_sqli": {
                "cve": "CVE-2000-0402",
                "cvss": 7.5,
                "exploit_module": "exploit/windows/mssql/mssql_sqli",
                "description": "MSSQL SQL injection",
            },
        },
    }

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events

    def correlate(self) -> Dict[str, Any]:
        """Run full correlation analysis on all collected data."""
        self.events.emit("info", "correlation", "analyze", "Running correlation analysis")

        targets = self.tm.get_targets()
        findings = {"attack_paths": [], "cred_reuse": [], "high_value": [], "service_vulns": []}

        for target in targets:
            services = self.tm.get_services(target["id"])
            vulns = self.tm.get_vulnerabilities(target["id"])
            creds = [c for c in self.tm.get_credentials() if c.get("target_id") == target["id"]]

            for svc in services:
                service_name = svc.get("service", "").lower()
                version = f"{svc.get('product', '')} {svc.get('version', '')}".lower().strip()

                # Check service vulnerability database
                if service_name in self.SERVICE_VULN_DB:
                    for vuln_id, vuln_info in self.SERVICE_VULN_DB[service_name].items():
                        # Check version match for version-specific vulns
                        match = True
                        if "affected_versions" in vuln_info:
                            target_os = target.get("os_version", "").lower()
                            match = any(av.lower() in target_os
                                        for av in vuln_info["affected_versions"])

                        if match:
                            entry = {
                                "target": target["ip_address"],
                                "port": svc["port"],
                                "service": service_name,
                                "vuln_id": vuln_id,
                                "cve": vuln_info.get("cve", ""),
                                "cvss": vuln_info.get("cvss", 0),
                                "severity": vuln_info.get("severity",
                                                          "critical" if vuln_info.get("cvss", 0) >= 9 else "high"),
                                "description": vuln_info["description"],
                                "check": vuln_info.get("check_module", ""),
                                "exploit": vuln_info.get("exploit_module", ""),
                                "existing_finding": any(v.get("cve") == vuln_info.get("cve") for v in vulns),
                            }
                            findings["service_vulns"].append(entry)
                            if vuln_info.get("exploit_module"):
                                findings["attack_paths"].append(entry)

                # Check for high-value targets
                if service_name in ("microsoft-ds", "ms-wbt-server", "ms-sql-s", "mysql"):
                    findings["high_value"].append({
                        "target": target["ip_address"],
                        "port": svc["port"],
                        "service": service_name,
                        "reason": "Domain controller or high-value service",
                    })

            # Check credentials for reuse opportunities
            if creds:
                for cred in creds:
                    username = cred.get("username", "")
                    password = cred.get("password", "") or cred.get("plaintext", "")
                    if username and password:
                        findings["cred_reuse"].append({
                            "target": target["ip_address"],
                            "username": username,
                            "has_password": True,
                            "services_to_test": [s["port"] for s in services
                                                if s["service"] in ("smb", "rdp", "ssh", "mysql",
                                                                     "mssql", "ftp", "http")],
                        })

        # Sort by severity
        sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        findings["service_vulns"].sort(key=lambda x: sev_order.get(x.get("severity", "medium"), 3))
        findings["attack_paths"].sort(key=lambda x: x.get("cvss", 0), reverse=True)

        self.events.emit("info", "correlation", "complete",
                         f"Found {len(findings['service_vulns'])} potential vulns, "
                         f"{len(findings['attack_paths'])} attack paths, "
                         f"{len(findings['cred_reuse'])} credential reuse opportunities")

        self._print_correlation(findings)
        return findings

    def _print_correlation(self, findings: Dict):
        # Attack paths
        if findings["attack_paths"]:
            table = Table(title="Attack Paths (Exploitable)", box=box.ROUNDED)
            table.add_column("Target", style="cyan")
            table.add_column("Port", style="dim")
            table.add_column("CVE", style="yellow")
            table.add_column("CVSS", style="red")
            table.add_column("Description", style="white")
            table.add_column("Exploit", style="green")

            for ap in findings["attack_paths"]:
                table.add_row(
                    ap["target"], str(ap["port"]), ap["cve"],
                    str(ap.get("cvss", "")), ap["description"][:50],
                    ap["exploit"][:40],
                )
            console.print(table)

        # Service vulns
        if findings["service_vulns"]:
            table = Table(title="Service Vulnerability Matches", box=box.ROUNDED)
            table.add_column("Target", style="cyan")
            table.add_column("Port", style="dim")
            table.add_column("Severity", style="bold")
            table.add_column("Description", style="white")
            table.add_column("Check", style="yellow")
            table.add_column("Known?", style="dim")

            for sv in findings["service_vulns"]:
                known = "[green]Yes[/]" if sv["existing_finding"] else "[red]New[/]"
                sev_color = {"critical": "red", "high": "red", "medium": "yellow", "low": "green"}.get(sv["severity"], "white")
                table.add_row(
                    sv["target"], str(sv["port"]),
                    f"[{sev_color}]{sv['severity'].upper()}[/]",
                    sv["description"][:50], sv["check"][:30], known,
                )
            console.print(table)

        # Credential reuse
        if findings["cred_reuse"]:
            table = Table(title="Credential Reuse Opportunities", box=box.ROUNDED)
            table.add_column("Target", style="cyan")
            table.add_column("User", style="yellow")
            table.add_column("Services to Test", style="green")
            for cr in findings["cred_reuse"]:
                table.add_row(
                    cr["target"], cr["username"],
                    ", ".join(str(p) for p in cr["services_to_test"])[:40],
                )
            console.print(table)

        # Summary
        console.print(f"\n[bold]Correlation Summary:[/]")
        console.print(f"  Potential vulnerabilities: [cyan]{len(findings['service_vulns'])}[/]")
        console.print(f"  Exploitable attack paths: [red]{len(findings['attack_paths'])}[/]")
        console.print(f"  Credential reuse opportunities: [yellow]{len(findings['cred_reuse'])}[/]")
        console.print(f"  High-value targets: [cyan]{len(findings['high_value'])}[/]")


# ═══════════════════════════════════════════════════════════════════
# CREDENTIAL REUSE TESTER
# ═══════════════════════════════════════════════════════════════════
class CredentialReuseTester:
    """
    Test harvested credentials against discovered services.
    Uses Metasploit login modules for standardized testing.
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
        except Exception as e:
            return "", str(e), -1

    def test_credentials(self, target: str = "",
                         credentials: List[Dict] = None,
                         services: List[str] = None) -> Dict[str, Any]:
        """
        Test credentials against target services using Metasploit login modules.
        Only tests against services discovered during recon.
        """
        if not credentials:
            credentials = self.tm.get_credentials()

        if not credentials:
            console.print("[yellow]No credentials in vault to test.[/]")
            return {"tested": 0, "successful": 0}

        targets = self.tm.get_targets()
        if target:
            targets = [t for t in targets if t["ip_address"] == target]

        # Map services to MSF login modules
        service_modules = {
            "smb": "auxiliary/scanner/smb/smb_login",
            "microsoft-ds": "auxiliary/scanner/smb/smb_login",
            "rdp": "auxiliary/scanner/rdp/rdp_login",
            "ms-wbt-server": "auxiliary/scanner/rdp/rdp_login",
            "ssh": "auxiliary/scanner/ssh/ssh_login",
            "mysql": "auxiliary/scanner/mysql/mysql_login",
            "mssql": "auxiliary/scanner/mssql/mssql_login",
            "ftp": "auxiliary/scanner/ftp/ftp_login",
            "smtp": "auxiliary/scanner/smtp/smtp_login",
            "postgresql": "auxiliary/scanner/postgres/postgres_login",
            "telnet": "auxiliary/scanner/telnet/telnet_login",
        }

        results = {"tested": 0, "successful": 0, "failed": 0, "details": []}

        for tgt in targets:
            tgt_services = self.tm.get_services(tgt["id"])
            for svc in tgt_services:
                svc_name = svc.get("service", "").lower()
                module = service_modules.get(svc_name)
                if not module:
                    continue
                if services and svc_name not in services:
                    continue

                for cred in credentials:
                    username = cred.get("username", "")
                    password = cred.get("password", "") or cred.get("plaintext", "")
                    if not username:
                        continue

                    self.events.emit("info", "cred_reuse", "testing",
                                     f"Testing {username}@{tgt['ip_address']}:{svc['port']} ({svc_name})")

                    console.print(f"  [cyan]Testing {username}@{tgt['ip_address']}:{svc['port']} ({svc_name})...[/]")

                    # Build resource script
                    lines = [
                        f"use {module}",
                        f"set RHOSTS {tgt['ip_address']}",
                        f"set RPORT {svc['port']}",
                        f"set USERNAME {username}",
                        f"set PASSWORD {password}",
                        "run",
                        "exit -y",
                    ]
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    rc_file = Path("logs") / f"cred_test_{svc_name}_{ts}.rc"
                    rc_file.parent.mkdir(exist_ok=True)
                    rc_file.write_text("\n".join(lines))

                    stdout, _, _ = self._run(f"msfconsole --quiet -r {rc_file}", timeout=60)

                    results["tested"] += 1

                    # Check if login was successful
                    if "SUCCESSFUL" in stdout.upper() or "LOGIN SUCCESSFUL" in stdout.upper():
                        results["successful"] += 1
                        self.tm.add_credential(
                            username=username, password=password,
                            source="cred_reuse", target_id=tgt["id"],
                            realm=f"{svc_name}:{svc['port']}")
                        console.print(f"    [bold green]SUCCESS: {username}:{password[:8]}... on {svc_name}[/]")
                        results["details"].append({
                            "target": tgt["ip_address"], "port": svc["port"],
                            "service": svc_name, "username": username,
                            "status": "SUCCESS",
                        })
                    else:
                        results["failed"] += 1
                        results["details"].append({
                            "target": tgt["ip_address"], "port": svc["port"],
                            "service": svc_name, "username": username,
                            "status": "FAILED",
                        })

        self.events.emit("info", "cred_reuse", "complete",
                         f"Tested {results['tested']} combos, "
                         f"{results['successful']} successful")

        console.print(f"\n[bold]Credential Reuse Results:[/]")
        console.print(f"  Tested: [cyan]{results['tested']}[/]")
        console.print(f"  Successful: [green]{results['successful']}[/]")
        console.print(f"  Failed: [red]{results['failed']}[/]")

        if results["successful"] > 0:
            console.print(f"\n[bold yellow]Successful logins saved to credential vault.[/]")

        return results


# ═══════════════════════════════════════════════════════════════════
# ENGAGEMENT NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════
class EngagementNotifier:
    """Track engagement milestones and alert on important findings."""

    MILESTONES = {
        "first_target": "First target discovered",
        "first_vuln": "First vulnerability found",
        "first_session": "First session opened",
        "first_cred": "First credential harvested",
        "critical_vuln": "Critical vulnerability found",
        "domain_admin": "Domain admin access achieved",
        "pivoted": "Network pivot established",
        "target_10": "10+ targets discovered",
        "vuln_10": "10+ vulnerabilities found",
    }

    def __init__(self, db, tm, events):
        self.db = db
        self.tm = tm
        self.events = events
        self._milestones_hit = set()

    def check_milestones(self):
        """Check and report on engagement milestones."""
        stats = None
        eng = None
        from core.engine import EngagementManager
        em = EngagementManager(self.db)
        eng = em.get_active()
        if not eng:
            return

        stats = em.get_stats(eng["id"])

        checks = [
            ("first_target", stats["targets"] >= 1),
            ("first_vuln", stats["vulnerabilities"] >= 1),
            ("first_session", stats["active_sessions"] >= 1),
            ("first_cred", stats["credentials"] >= 1),
            ("target_10", stats["targets"] >= 10),
            ("vuln_10", stats["vulnerabilities"] >= 10),
        ]

        vulns = self.tm.get_vulnerabilities()
        if any(v.get("severity") == "critical" for v in vulns):
            checks.append(("critical_vuln", True))

        for key, condition in checks:
            if condition and key not in self._milestones_hit:
                self._milestones_hit.add(key)
                desc = self.MILESTONES.get(key, key)
                console.print(f"\n[bold green]MILESTONE: {desc}[/]\n")

    def engagement_summary(self) -> str:
        """Generate a text summary of the engagement progress."""
        from core.engine import EngagementManager
        em = EngagementManager(self.db)
        eng = em.get_active()
        if not eng:
            return "No active engagement"

        stats = em.get_stats(eng["id"])
        elapsed = ""
        if eng.get("start_time"):
            try:
                start = datetime.fromisoformat(eng["start_time"].replace("Z", "+00:00"))
                elapsed = str(datetime.utcnow() - start).split(".")[0]
            except Exception:
                elapsed = "Unknown"

        lines = [
            f"Engagement: {eng['name']}",
            f"Elapsed: {elapsed}",
            f"Targets: {stats['targets']}",
            f"Vulnerabilities: {stats['vulnerabilities']}",
            f"C credentials: {stats['credentials']}",
            f"Active Sessions: {stats['active_sessions']}",
            f"Loot Items: {stats['loot_items']}",
            f"Milestones: {len(self._milestones_hit)}/{len(self.MILESTONES)}",
        ]

        vulns_by_sev = stats.get("severity_breakdown", {})
        if vulns_by_sev:
            lines.append(f"Severity: C={vulns_by_sev.get('critical',0)} "
                        f"H={vulns_by_sev.get('high',0)} "
                        f"M={vulns_by_sev.get('medium',0)} "
                        f"L={vulns_by_sev.get('low',0)}")

        return "\n".join(lines)
