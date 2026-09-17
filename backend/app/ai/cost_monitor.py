from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

try:
    import redis
except ImportError:  # pragma: no cover - optional locally
    redis = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

GLOBAL_MONTHLY_BUDGET_USD = 4.80
DEFAULT_DAILY_TOKEN_LIMIT = 5_000
DEFAULT_MONTHLY_TOKEN_LIMIT = 50_000

# Together serverless pricing in USD per one million tokens.
MODEL_PRICING = {
    "qwen/qwen3.5-9b": {
        "input": 0.10,
        "output": 0.15,
    },
}
FALLBACK_PRICING = {
    "input": 1.00,
    "output": 3.00,
}


class QuotaType(str, Enum):
    DAILY = "daily"
    MONTHLY = "monthly"


class QuotaStatus(str, Enum):
    OK = "ok"
    WARNING = "warning"
    EXCEEDED = "exceeded"


@dataclass(frozen=True)
class TokenUsage:
    timestamp: float
    user_id: int
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    request_id: str | None = None


@dataclass(frozen=True)
class UsageSummary:
    period_start: datetime
    period_end: datetime
    total_tokens: int
    total_cost_usd: float
    request_count: int


@dataclass(frozen=True)
class QuotaConfig:
    limit_tokens: int
    warning_threshold: float = 0.8


class CostMonitor:
    _instance: CostMonitor | None = None

    def __init__(self) -> None:
        self._redis = self._connect_redis()
        self._memory_usage: dict[str, int] = {}
        self._memory_spend: dict[str, float] = {}
        self._memory_requests: dict[str, int] = {}

    @staticmethod
    def _connect_redis():
        redis_url = os.getenv("REDIS_URL", "").strip()

        if not redis_url or redis is None:
            return None

        try:
            client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            client.ping()
            return client
        except Exception:
            logger.warning(
                "Redis is unavailable; AI usage limits are process-local"
            )
            return None

    @staticmethod
    def _period_keys(
        user_id: int,
        now: datetime,
    ) -> tuple[str, str, str, str]:
        day = now.strftime("%Y-%m-%d")
        month = now.strftime("%Y-%m")

        return (
            f"charge:ai:user:{user_id}:tokens:{day}",
            f"charge:ai:user:{user_id}:tokens:{month}",
            f"charge:ai:spend:{month}",
            f"charge:ai:requests:{month}",
        )

    async def check_global_budget(self) -> bool:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        key = f"charge:ai:spend:{month}"

        if self._redis is not None:
            try:
                value = self._redis.get(key)
                spend = float(value) if value else 0.0
            except Exception:
                logger.warning("Could not read the shared AI budget")
                spend = self._memory_spend.get(key, 0.0)
        else:
            spend = self._memory_spend.get(key, 0.0)

        return spend < GLOBAL_MONTHLY_BUDGET_USD

    async def check_quota(
        self,
        user_id: int,
        requested_tokens: int,
    ) -> tuple[bool, QuotaStatus, str]:
        if requested_tokens < 0:
            return False, QuotaStatus.EXCEEDED, "Invalid token request"

        if not await self.check_global_budget():
            return False, QuotaStatus.EXCEEDED, "AI budget reached"

        now = datetime.now(timezone.utc)
        daily_key, monthly_key, _, _ = self._period_keys(
            user_id,
            now,
        )

        if self._redis is not None:
            try:
                daily_raw, monthly_raw = self._redis.mget(
                    [daily_key, monthly_key]
                )
                daily_used = int(daily_raw or 0)
                monthly_used = int(monthly_raw or 0)
            except Exception:
                logger.warning("Could not read shared AI usage")
                daily_used = self._memory_usage.get(daily_key, 0)
                monthly_used = self._memory_usage.get(monthly_key, 0)
        else:
            daily_used = self._memory_usage.get(daily_key, 0)
            monthly_used = self._memory_usage.get(monthly_key, 0)

        if daily_used + requested_tokens > DEFAULT_DAILY_TOKEN_LIMIT:
            return False, QuotaStatus.EXCEEDED, "Daily AI limit reached"

        if monthly_used + requested_tokens > DEFAULT_MONTHLY_TOKEN_LIMIT:
            return False, QuotaStatus.EXCEEDED, "Monthly AI limit reached"

        warning = (
            daily_used + requested_tokens
            >= DEFAULT_DAILY_TOKEN_LIMIT * 0.8
            or monthly_used + requested_tokens
            >= DEFAULT_MONTHLY_TOKEN_LIMIT * 0.8
        )

        return (
            True,
            QuotaStatus.WARNING if warning else QuotaStatus.OK,
            "Allowed",
        )

    async def record_usage(
        self,
        user_id: int,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        request_id: str | None = None,
    ) -> TokenUsage:
        safe_prompt_tokens = max(0, prompt_tokens)
        safe_completion_tokens = max(0, completion_tokens)
        total_tokens = safe_prompt_tokens + safe_completion_tokens
        cost = self._estimate_cost(
            model,
            safe_prompt_tokens,
            safe_completion_tokens,
        )
        now = datetime.now(timezone.utc)
        daily_key, monthly_key, spend_key, requests_key = (
            self._period_keys(user_id, now)
        )

        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incrby(daily_key, total_tokens)
                pipe.expire(daily_key, 60 * 60 * 24 * 35)
                pipe.incrby(monthly_key, total_tokens)
                pipe.expire(monthly_key, 60 * 60 * 24 * 62)
                pipe.incrbyfloat(spend_key, cost)
                pipe.expire(spend_key, 60 * 60 * 24 * 62)
                pipe.incr(requests_key)
                pipe.expire(requests_key, 60 * 60 * 24 * 62)
                pipe.execute()
            except Exception:
                logger.warning("Could not persist shared AI usage")
                self._record_in_memory(
                    daily_key,
                    monthly_key,
                    spend_key,
                    requests_key,
                    total_tokens,
                    cost,
                )
        else:
            self._record_in_memory(
                daily_key,
                monthly_key,
                spend_key,
                requests_key,
                total_tokens,
                cost,
            )

        return TokenUsage(
            timestamp=time.time(),
            user_id=user_id,
            provider=provider,
            model=model,
            prompt_tokens=safe_prompt_tokens,
            completion_tokens=safe_completion_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=cost,
            request_id=request_id,
        )

    def _record_in_memory(
        self,
        daily_key: str,
        monthly_key: str,
        spend_key: str,
        requests_key: str,
        total_tokens: int,
        cost: float,
    ) -> None:
        self._memory_usage[daily_key] = (
            self._memory_usage.get(daily_key, 0) + total_tokens
        )
        self._memory_usage[monthly_key] = (
            self._memory_usage.get(monthly_key, 0) + total_tokens
        )
        self._memory_spend[spend_key] = (
            self._memory_spend.get(spend_key, 0.0) + cost
        )
        self._memory_requests[requests_key] = (
            self._memory_requests.get(requests_key, 0) + 1
        )

    @staticmethod
    def _estimate_cost(
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        pricing = MODEL_PRICING.get(
            model.strip().lower(),
            FALLBACK_PRICING,
        )

        return (
            prompt_tokens * pricing["input"]
            + completion_tokens * pricing["output"]
        ) / 1_000_000

    def get_user_quota(
        self,
        user_id: int,
        quota_type: QuotaType,
    ) -> QuotaConfig:
        del user_id

        limit = (
            DEFAULT_MONTHLY_TOKEN_LIMIT
            if quota_type == QuotaType.MONTHLY
            else DEFAULT_DAILY_TOKEN_LIMIT
        )
        return QuotaConfig(limit_tokens=limit)

    async def get_usage_summary(
        self,
        user_id: int,
        start_date: datetime,
        end_date: datetime,
    ) -> UsageSummary:
        _, monthly_key, spend_key, requests_key = self._period_keys(
            user_id,
            start_date.astimezone(timezone.utc),
        )

        if self._redis is not None:
            try:
                tokens_raw, spend_raw, requests_raw = self._redis.mget(
                    [monthly_key, spend_key, requests_key]
                )
                total_tokens = int(tokens_raw or 0)
                total_cost = float(spend_raw or 0.0)
                request_count = int(requests_raw or 0)
            except Exception:
                total_tokens = self._memory_usage.get(monthly_key, 0)
                total_cost = self._memory_spend.get(spend_key, 0.0)
                request_count = self._memory_requests.get(requests_key, 0)
        else:
            total_tokens = self._memory_usage.get(monthly_key, 0)
            total_cost = self._memory_spend.get(spend_key, 0.0)
            request_count = self._memory_requests.get(requests_key, 0)

        return UsageSummary(
            period_start=start_date,
            period_end=end_date,
            total_tokens=total_tokens,
            total_cost_usd=total_cost,
            request_count=request_count,
        )

    @classmethod
    def get_instance(cls) -> CostMonitor:
        if cls._instance is None:
            cls._instance = cls()

        return cls._instance


def get_cost_monitor() -> CostMonitor:
    return CostMonitor.get_instance()


def initialize_default_quotas() -> None:
    get_cost_monitor()
