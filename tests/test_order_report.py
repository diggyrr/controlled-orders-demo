import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from order_report import summarise_queue  # noqa: E402


def write_event(directory: Path, name: str, email: str, occurred_at: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(
        json.dumps(
            {
                "eventId": name,
                "type": "order.accepted",
                "schemaVersion": 1,
                "occurredAt": occurred_at,
                "orderId": f"order-{name}",
                "customerEmail": email,
            }
        )
    )


class OrderReportTest(unittest.TestCase):
    def test_summarises_ready_and_in_flight_events(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            queue = Path(temporary)
            write_event(queue / "ready", "1.json", "a@Example.test", "2026-01-01T00:00:00Z")
            write_event(queue / "ready", "2.json", "b@example.test", "2026-01-02T00:00:00Z")
            write_event(queue / "in-flight", "3.json", "c@other.test", "2026-01-03T00:00:00Z")
            (queue / "ready" / "bad.json").write_text("not json")

            summary = summarise_queue(queue)

        self.assertEqual(summary.ready, 2)
        self.assertEqual(summary.in_flight, 1)
        self.assertEqual(summary.invalid, 1)
        self.assertEqual(summary.customer_domains, {"example.test": 2, "other.test": 1})
        self.assertEqual(summary.oldest_occurred_at, "2026-01-01T00:00:00Z")
        self.assertEqual(summary.newest_occurred_at, "2026-01-03T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
