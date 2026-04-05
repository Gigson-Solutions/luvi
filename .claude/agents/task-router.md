---
name: task-router
type: analyzer
description: Intelligent task classification and routing to optimal agents
capabilities:
  - task-classification
  - agent-matching
  - workload-balancing
  - pattern-learning
  - priority-assessment
priority: medium
---

# Task Router

Classifies incoming tasks and routes them to optimal agents.

Escalates to swarm-coordinator when task exceeds single-agent capacity.
Uses `npx ruflo memory store/search` for pattern learning.
