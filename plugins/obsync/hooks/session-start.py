#!/usr/bin/env python3

import json
import sys


def main() -> None:
    json.load(sys.stdin)
    print(
        "If Obsync is configured, use the obsync-wiki skill for durable project "
        "knowledge. If it is not configured or its address must change, use the "
        "obsync-setup skill first. Preserve only durable, user-authorized knowledge."
    )


if __name__ == "__main__":
    main()
