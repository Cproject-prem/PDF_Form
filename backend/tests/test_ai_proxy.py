"""
FormForge Backend - AI Proxy & Circuit Breaker Fault-Tolerance Tests
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from circuit_breaker import ai_circuit_breaker, CircuitState

def test_circuit_breaker_state_transitions():
    cb = ai_circuit_breaker
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute() is True

    # Record 3 failures
    cb.record_failure()
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.can_execute() is False

    # Reset
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute() is True
