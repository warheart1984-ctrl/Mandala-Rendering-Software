"""Deploy Dustjacket Agent to Vertex AI Reasoning Engine."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dustjacket_agent import DustjacketAgent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="marine-proposal-430017-b4")
    parser.add_argument("--location", default="us-central1")
    parser.add_argument("--staging-bucket", required=True)
    parser.add_argument("--display-name", default="dustjacket")
    args = parser.parse_args()

    import vertexai
    from vertexai.preview import reasoning_engines

    vertexai.init(
        project=args.project,
        location=args.location,
        staging_bucket=args.staging_bucket,
    )

    agent = DustjacketAgent()
    print(f"Deploying {args.display_name} to Vertex AI...")
    print(f"Project: {args.project}")
    print(f"Location: {args.location}")

    try:
        remote = reasoning_engines.ReasoningEngine.create(
            reasoning_engine=agent,
            requirements=["httpx>=0.28.1"],
            display_name=args.display_name,
            description="FMCE Constitutional Pipeline Pilot - Agentic Cinema Grafana Track",
        )
        print(f"OK: {remote.resource_name}")
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
