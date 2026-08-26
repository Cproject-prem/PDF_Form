"""
FormForge Circuit Breaker Module
Prevents repeated AI failures or timeouts from blocking the core FormForge backend.
"""

import time
import logging
from enum import Enum
from typing import Callable, Any, Dict, Tuple

logger = logging.getLogger("formforge-circuit-breaker")

class CircuitState(str, Enum):
    CLOSED = "CLOSED"         # Normal operation: requests allowed
    OPEN = "OPEN"             # Failures detected: fast-fail requests
    HALF_OPEN = "HALF_OPEN"   # Testing recovery: probe request allowed

class CircuitBreaker:
    def __init__(
        self,
        name: str = "ai-service",
        failure_threshold: int = 3,
        cooldown_seconds: float = 30.0
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.last_state_change: float = time.time()
        self.last_failure_time: float = 0.0

    def can_execute(self) -> bool:
        """Returns True if request should be attempted, False to fast-fail."""
        now = time.time()
        if self.state == CircuitState.OPEN:
            if now - self.last_state_change >= self.cooldown_seconds:
                logger.info(f"CircuitBreaker '{self.name}': Cooldown elapsed. Transitioning OPEN -> HALF_OPEN")
                self.state = CircuitState.HALF_OPEN
                self.last_state_change = now
                return True
            return False
        return True

    def record_success(self):
        """Records successful execution, resetting circuit to CLOSED."""
        if self.state != CircuitState.CLOSED:
            logger.info(f"CircuitBreaker '{self.name}': Success recorded. Transitioning {self.state} -> CLOSED")
            self.state = CircuitState.CLOSED
            self.last_state_change = time.time()
        self.failure_count = 0

    def record_failure(self):
        """Records failed execution. Opens circuit if threshold exceeded."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitState.HALF_OPEN or self.failure_count >= self.failure_threshold:
            if self.state != CircuitState.OPEN:
                logger.warning(f"CircuitBreaker '{self.name}': {self.failure_count} failures detected. Transitioning {self.state} -> OPEN")
                self.state = CircuitState.OPEN
                self.last_state_change = time.time()

# Global circuit breaker instance for AI service
ai_circuit_breaker = CircuitBreaker(name="ai-service", failure_threshold=3, cooldown_seconds=30.0)
