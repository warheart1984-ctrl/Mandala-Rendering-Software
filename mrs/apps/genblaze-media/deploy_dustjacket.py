"""
Deploy Dustjacket Agent to Vertex AI Reasoning Engine.

Usage:
  python deploy_dustjacket.py --staging-bucket gs://your-bucket
"""

import argparse
import os
import sys

# Add the app directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.dustjacket_agent import DustjacketAgent

def main():
    parser = argparse.ArgumentParser(description="Deploy Dustjacket Agent to Vertex AI")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT", "marine-proposal-430017-b4"))
    parser.add_argument("--location", default=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
    parser.add_argument("--staging-bucket", required=True, help="GCS bucket for staging (gs://...)")
    parser.add_argument("--display-name", default="dustjacket")
    parser.add_argument("--description", default="FMCE Constitutional Pipeline Pilot for Agentic Cinema")
    args = parser.parse_args()
    
    # Initialize Vertex AI
    import vertexai
    vertexai.init(
        project=args.project,
        location=args.location,
        staging_bucket=args.staging_bucket
    )
    
    # Create local agent instance
    local_agent = DustjacketAgent()
    
    # Deploy to Vertex AI Reasoning Engine
    from vertexai.preview import reasoning_engines
    
    print(f"Deploying Dustjacket Agent to Vertex AI...")
    print(f"  Project: {args.project}")
    print(f"  Location: {args.location}")
    print(f"  Staging Bucket: {args.staging_bucket}")
    
    try:
        remote_agent = reasoning_engines.ReasoningEngine.create(
            reasoning_engine=local_agent,
            requirements=[
                "google-cloud-aiplatform>=1.163.0",
                "google-genai>=1.0.0",
                "httpx>=0.28.1",
                "vertexai>=1.163.0",
            ],
            display_name=args.display_name,
            description=args.description,
            extra_packages=[os.path.dirname(os.path.abspath(__file__))],
        )
        
        print(f"\n✅ Successfully deployed!")
        print(f"   Resource name: {remote_agent.resource_name}")
        print(f"   Display name: {remote_agent.display_name}")
        print(f"   Description: {remote_agent.description}")
        
        # Test the deployed agent
        print(f"\nTesting deployed agent...")
        test_result = remote_agent.query({
            "prompt": "test mandala lattice",
            "shot_id": "deploy-test-001",
            "frame_count": 1,
            "quality": "draft"
        })
        print(f"   Test result: {test_result}")
        
    except Exception as e:
        print(f"\n❌ Deployment failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        # Cleanup local client
        import asyncio
        asyncio.run(local_agent.close())

if __name__ == "__main__":
    main()