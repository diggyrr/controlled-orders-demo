"""Summarise the orders waiting in the file-backed order queue.

Reads the queue directory that the orders API writes and the notification
worker drains. Each entry is one JSON file holding an `order.accepted` event,
stored under `ready/` until a worker claims it and `in-flight/` while it is
being processed.

    python tools/order_report.py [--queue-directory DIR] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

DEFAULT_QUEUE_DIRECTORY = ".data/queue"
ORDER_ACCEPTED_EVENT_TYPE = "order.accepted"


@dataclass
class QueueSummary:
    ready: int = 0
    in_flight: int = 0
    invalid: int = 0
    customer_domains: dict[str, int] = field(default_factory=dict)
    oldest_occurred_at: str | None = None
    newest_occurred_at: str | None = None


def summarise_queue(queue_directory: Path) -> QueueSummary:
    """Count the queued events and group them by customer email domain."""
    summary = QueueSummary()
    domains: Counter[str] = Counter()
    timestamps: list[str] = []

    for state in ("ready", "in-flight"):
        for entry in sorted((queue_directory / state).glob("*.json")):
            event = _read_event(entry)
            if event is None:
                summary.invalid += 1
                continue
            if state == "ready":
                summary.ready += 1
            else:
                summary.in_flight += 1
            domains[event["customerEmail"].rpartition("@")[2].lower()] += 1
            timestamps.append(event["occurredAt"])

    summary.customer_domains = dict(sorted(domains.items()))
    if timestamps:
        summary.oldest_occurred_at = min(timestamps)
        summary.newest_occurred_at = max(timestamps)
    return summary


def _read_event(path: Path) -> dict[str, str] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if (
        isinstance(value, dict)
        and value.get("type") == ORDER_ACCEPTED_EVENT_TYPE
        and value.get("schemaVersion") == 1
        and isinstance(value.get("occurredAt"), str)
        and isinstance(value.get("customerEmail"), str)
    ):
        return value
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--queue-directory",
        default=os.environ.get("QUEUE_DIRECTORY", DEFAULT_QUEUE_DIRECTORY),
        help="queue directory (defaults to QUEUE_DIRECTORY, then .data/queue)",
    )
    parser.add_argument("--json", action="store_true", help="print JSON")
    arguments = parser.parse_args(argv)

    summary = summarise_queue(Path(arguments.queue_directory))
    if arguments.json:
        print(json.dumps(asdict(summary), indent=2))
    else:
        print(f"Ready:      {summary.ready}")
        print(f"In flight:  {summary.in_flight}")
        print(f"Invalid:    {summary.invalid}")
        for domain, count in summary.customer_domains.items():
            print(f"  {domain}: {count}")
    return 1 if summary.invalid else 0


if __name__ == "__main__":
    sys.exit(main())
