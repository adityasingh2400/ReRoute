"""Temporary script: runs ConciergeAgent standalone so the Agentverse inspector can find it."""
import os
from dotenv import load_dotenv
load_dotenv()

from uagents import Agent
from uagents_core.contrib.protocols.chat import chat_protocol_spec
from uagents import Protocol

seed = os.getenv("CONCIERGE_AGENT_SEED", "reroute-concierge-agent-seed-phrase-change-me")

agent = Agent(
    name="concierge_agent",
    seed=seed,
    port=8108,
    endpoint=["http://localhost:8108/submit"],
    network="testnet",
    mailbox=True,
    publish_agent_details=True,
)

try:
    proto = Protocol(spec=chat_protocol_spec)
    agent.include(proto, publish_manifest=True)
except Exception:
    pass

print(f"\nAgent address: {agent.address}")
print(f"Running standalone on http://localhost:8108")
print(f"Go to: https://agentverse.ai/inspect/?uri={agent.address}&network=testnet")
print(f"Click Connect, then create the mailbox.\n")
print("Press Ctrl+C when done.\n")

agent.run()
